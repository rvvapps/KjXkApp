import JSZip from "jszip";
import { getDB } from "../db.js";
import { encryptBytes, decryptToBytes } from "./backupCrypto.js";

function extFromMime(mime) {
  if (!mime) return "bin";
  if (mime === "image/webp") return "webp";
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  return "bin";
}

function withTimeout(promise, ms, code) {
  if (!ms || !Number.isFinite(ms)) return promise;
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      const err = new Error(code || "timeout");
      err.code = code || "timeout";
      reject(err);
    }, ms);
    promise
      .then((v) => {
        clearTimeout(t);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(t);
        reject(e);
      });
  });
}

async function dumpAllStores(db, onProgress) {
  const storeNames = Array.from(db.objectStoreNames);
  const stores = {};
  const storeCounts = {};

  for (const name of storeNames) {
    onProgress?.({ phase: "read_store", store: name });
    const tx = db.transaction(name, "readonly");
    const all = await tx.objectStore(name).getAll();
    await tx.done;
    stores[name] = all;
    storeCounts[name] = all.length;
  }
  return { stores, storeCounts };
}

export async function buildPlainBackupZipBytes(opts = {}) {
  const onProgress = typeof opts.onProgress === "function" ? opts.onProgress : null;
  const timeoutMs = Number.isFinite(opts.timeoutMs) ? opts.timeoutMs : 30000;

  onProgress?.({ phase: "open_db" });
  const db = await withTimeout(getDB(), timeoutMs, "open_db_timeout");
  const { stores, storeCounts } = await dumpAllStores(db, onProgress);
  db.close?.();

  // Guard against empty backups
  const expensesCount = storeCounts.expenses ?? 0;
  const reimbursementsCount = storeCounts.reimbursements ?? 0;
  const attachmentsCount = storeCounts.attachments ?? 0;
  const anyData = expensesCount + reimbursementsCount + attachmentsCount > 0;
  if (!anyData) {
    const err = new Error("empty_backup");
    err.code = "empty_backup";
    err.storeCounts = storeCounts;
    throw err;
  }

  onProgress?.({ phase: "zip_build" });
  const zip = new JSZip();

  // Extract blobs into /receipts/ and replace them with refs inside data.json
  if (Array.isArray(stores.attachments)) {
    const updated = [];
    for (const rec of stores.attachments) {
      if (rec && rec.blob instanceof Blob) {
        const mimeType = rec.mimeType || rec.blob.type || "application/octet-stream";
        const ext = extFromMime(mimeType);
        const fileName = rec.contentHash
          ? `${rec.contentHash}.${ext}`
          : `${rec.adjuntoId || rec.id || crypto.randomUUID()}.${ext}`;
        const path = `receipts/${fileName}`;
        zip.file(path, await rec.blob.arrayBuffer());
        const { blob, ...rest } = rec;
        updated.push({ ...rest, __blobRef: path, mimeType });
      } else {
        updated.push(rec);
      }
    }
    stores.attachments = updated;
  }

  const meta = {
    format: "cajachica-backup",
    version: 1,
    createdAt: new Date().toISOString(),
    dbName: "pettycash_db",
    storeCounts,
  };

  zip.file("data.json", JSON.stringify({ meta, stores }, null, 2));

  const bytes = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  return { bytes, storeCounts };
}

export async function generateEncryptedBackupBlob(passphrase, opts = {}) {
  if (!passphrase || passphrase.length < 6) {
    const err = new Error("passphrase_too_short");
    err.code = "passphrase_too_short";
    throw err;
  }
  const { bytes, storeCounts } = await buildPlainBackupZipBytes(opts);
  const encBlob = await encryptBytes(passphrase, bytes);
  return { blob: encBlob, storeCounts };
}

async function deleteAllByCursor(db, storeName, onProgress, timeoutMs) {
  const tx = db.transaction(storeName, "readwrite");
  const os = tx.objectStore(storeName);

  await withTimeout(
    new Promise((resolve, reject) => {
      const req = os.openCursor();
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          resolve();
        }
      };
      req.onerror = () => reject(req.error);
    }),
    timeoutMs,
    `clear_${storeName}_timeout`
  );

  await withTimeout(tx.done, timeoutMs, `clear_${storeName}_tx_timeout`);
}

async function putOne(db, storeName, record, onProgress, timeoutMs) {
  const tx = db.transaction(storeName, "readwrite");
  const os = tx.objectStore(storeName);
  await withTimeout(os.put(record), timeoutMs, `put_${storeName}_timeout`);
  await withTimeout(tx.done, timeoutMs, `put_${storeName}_tx_timeout`);
}

export async function restoreFromEncryptedBackupFile(fileBlob, passphrase, opts = {}) {
  if (!fileBlob) throw new Error("missing_file");
  const onProgress = typeof opts.onProgress === "function" ? opts.onProgress : null;
  const timeoutMs = Number.isFinite(opts.timeoutMs) ? opts.timeoutMs : 60000;

  if (!passphrase || passphrase.length < 6) {
    const err = new Error("passphrase_too_short");
    err.code = "passphrase_too_short";
    throw err;
  }

  onProgress?.({ phase: "decrypt" });
  const plainBytes = await withTimeout(decryptToBytes(passphrase, fileBlob), timeoutMs, "decrypt_timeout");

  onProgress?.({ phase: "unzip" });
  const zip = await withTimeout(JSZip.loadAsync(plainBytes), timeoutMs, "unzip_timeout");

  const dataFile = zip.file("data.json");
  const dataText = await withTimeout(dataFile?.async("string"), timeoutMs, "read_datajson_timeout");
  if (!dataText) {
    const err = new Error("bad_backup:no_data_json");
    err.code = "bad_backup";
    throw err;
  }

  onProgress?.({ phase: "parse" });
  const parsed = JSON.parse(dataText);
  const stores = parsed.stores || {};
  const meta = parsed.meta || {};
  const storeCounts = meta.storeCounts || null;
  const insertedCounts = {};

  onProgress?.({ phase: "open_db" });
  const db = await withTimeout(getDB(), timeoutMs, "open_db_timeout");
  const storeNames = Array.from(db.objectStoreNames);

  // 1) Wipe stores one-by-one using cursor deletes (robust, no clear/deleteDatabase)
  for (const name of storeNames) {
    onProgress?.({ phase: "clear_store", store: name });
    await deleteAllByCursor(db, name, onProgress, timeoutMs);
  }

  // 2) Insert store data one-by-one (robust against tx auto-finish)
  for (const name of storeNames) {
    const rows = stores[name];
    if (!Array.isArray(rows) || rows.length === 0) continue;

    insertedCounts[name] = 0;
    onProgress?.({ phase: "insert_store", store: name, count: rows.length });

    for (let i = 0; i < rows.length; i++) {
      const rec = rows[i];

      if (name === "attachments" && rec && rec.__blobRef) {
        // Build record FIRST (await zip) before opening tx, to avoid tx auto-finish
        const buf = await withTimeout(zip.file(rec.__blobRef)?.async("arraybuffer"), timeoutMs, "read_blob_timeout");
        const blob = buf ? new Blob([buf], { type: rec.mimeType || "application/octet-stream" }) : null;
        const { __blobRef, ...rest } = rec;
        await putOne(db, name, { ...rest, blob }, onProgress, timeoutMs);
      } else {
        await putOne(db, name, rec, onProgress, timeoutMs);
      }

      insertedCounts[name]++;
      if (onProgress && (i % 10 === 0 || i === rows.length - 1)) {
        onProgress({ phase: "insert_progress", store: name, i: i + 1, total: rows.length });
      }
    }
  }

  db.close?.();
  onProgress?.({ phase: "done", insertedCounts });
  return { ok: true, storeCounts, insertedCounts, meta };
}
