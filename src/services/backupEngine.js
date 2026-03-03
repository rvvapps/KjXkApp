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
  const timeoutMs = Number.isFinite(ms) ? ms : 0;
  if (!timeoutMs) return promise;
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      const err = new Error(code || "timeout");
      err.code = code || "timeout";
      reject(err);
    }, timeoutMs);
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

async function dumpAllStores(db, storeNames) {
  const stores = {};
  const storeCounts = {};

  for (const name of storeNames) {
    const tx = db.transaction(name, "readonly");
    const all = await tx.objectStore(name).getAll();
    stores[name] = all;
    storeCounts[name] = all.length;
    await tx.done;
  }

  return { stores, storeCounts };
}

/**
 * Builds a plain (unencrypted) ZIP as bytes.
 * Contains:
 *  - data.json (meta + all stores)
 *  - receipts/* (attachments blobs)
 */
export async function buildPlainBackupZipBytes(opts = {}) {
  const onProgress = typeof opts.onProgress === "function" ? opts.onProgress : null;
  const timeoutMs = Number.isFinite(opts.timeoutMs) ? opts.timeoutMs : 30000;
  const tick = (phase, extra = {}) => {
    try {
      if (onProgress) onProgress({ phase, ...extra });
    } catch {
      // ignore
    }
  };

  tick("open_db");
  const db = await withTimeout(getDB(), timeoutMs, "open_db_timeout");
  const storeNames = Array.from(db.objectStoreNames);

  tick("read_stores", { stores: storeNames.length });
  const { stores, storeCounts } = await withTimeout(
    dumpAllStores(db, storeNames),
    timeoutMs,
    "read_stores_timeout"
  );

  // Guard against empty backups (common mistake during setup).
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

  tick("zip_build");
  const zip = new JSZip();

  // Extract blobs into /receipts/ and replace them with refs inside data.json
  if (Array.isArray(stores.attachments)) {
    const updated = [];
    let moved = 0;

    for (const rec of stores.attachments) {
      if (rec && rec.blob instanceof Blob) {
        const mimeType = rec.mimeType || rec.blob.type || "application/octet-stream";
        const ext = extFromMime(mimeType);
        const fileName = rec.contentHash
          ? `${rec.contentHash}.${ext}`
          : `${rec.adjuntoId || crypto.randomUUID?.() || Date.now()}.${ext}`;
        const path = `receipts/${fileName}`;

        zip.file(path, await rec.blob.arrayBuffer());

        const { blob, ...rest } = rec;
        updated.push({ ...rest, __blobRef: path, mimeType });
        moved += 1;
      } else {
        updated.push(rec);
      }
    }

    stores.attachments = updated;
    tick("zip_receipts", { moved });
  }

  const meta = {
    format: "cajachica-backup",
    version: 1,
    createdAt: new Date().toISOString(),
    dbName: "pettycash_db",
    storeCounts,
  };

  zip.file("data.json", JSON.stringify({ meta, stores }, null, 2));

  const bytes = await withTimeout(
    zip.generateAsync({
      type: "uint8array",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    }),
    timeoutMs,
    "zip_timeout"
  );

  tick("zip_done", { bytes: bytes.length });
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

function clearStore(os) {
  return new Promise((resolve, reject) => {
    const req = os.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error || new Error("clear_failed"));
  });
}

/**
 * Restores a previously generated encrypted backup.
 * Strategy: clear all stores (readwrite tx) then put restored records.
 * Avoids indexedDB.deleteDatabase() because it can be blocked by open connections.
 */
export async function restoreFromEncryptedBackupFile(fileBlob, passphrase, opts = {}) {
  if (!fileBlob) throw new Error("missing_file");
  if (!passphrase || passphrase.length < 6) {
    const err = new Error("passphrase_too_short");
    err.code = "passphrase_too_short";
    throw err;
  }

  const onProgress = typeof opts.onProgress === "function" ? opts.onProgress : null;
  const timeoutMs = Number.isFinite(opts.timeoutMs) ? opts.timeoutMs : 60000;
  const tick = (phase, extra = {}) => {
    try {
      if (onProgress) onProgress({ phase, ...extra });
    } catch {
      // ignore
    }
  };

  tick("decrypt");
  const plainBytes = await withTimeout(
    decryptToBytes(passphrase, fileBlob),
    timeoutMs,
    "decrypt_timeout"
  );

  tick("unzip");
  const zip = await withTimeout(JSZip.loadAsync(plainBytes), timeoutMs, "unzip_timeout");

  const dataFile = zip.file("data.json");
  const dataText = await dataFile?.async("string");
  if (!dataText) {
    const err = new Error("bad_backup:no_data_json");
    err.code = "bad_backup";
    throw err;
  }

  tick("parse");
  const parsed = JSON.parse(dataText);
  const stores = parsed?.stores || {};
  const meta = parsed?.meta || {};
  const storeCounts = meta?.storeCounts || null;
  const insertedCounts = {};

  tick("open_db");
  const db = await withTimeout(getDB(), timeoutMs, "open_db_timeout");
  const storeNames = Array.from(db.objectStoreNames);

  // Clear all stores first (single multi-store tx is faster)
  tick("clear_stores", { stores: storeNames.length });
  {
    const tx = db.transaction(storeNames, "readwrite");
    for (const name of storeNames) {
      await clearStore(tx.objectStore(name));
    }
    await tx.done;
  }

  // Insert store data
  tick("insert_begin", { stores: storeNames.length });
  for (const name of storeNames) {
    const rows = stores[name];
    if (!Array.isArray(rows)) {
      insertedCounts[name] = 0;
      continue;
    }

    insertedCounts[name] = rows.length;
    tick("insert_store", { store: name, count: rows.length });

    const tx = db.transaction(name, "readwrite");
    const os = tx.objectStore(name);

    for (const rec of rows) {
      if (name === "attachments" && rec && rec.__blobRef) {
        const buf = await zip.file(rec.__blobRef)?.async("arraybuffer");
        const blob = buf
          ? new Blob([buf], { type: rec.mimeType || "application/octet-stream" })
          : null;
        const { __blobRef, ...rest } = rec;
        await os.put({ ...rest, blob });
      } else {
        await os.put(rec);
      }
    }

    await tx.done;
  }

  tick("done", { insertedCounts });
  return { ok: true, storeCounts, insertedCounts, meta };
}
