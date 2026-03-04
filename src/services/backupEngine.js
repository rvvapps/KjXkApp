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

function toTextProgress(p) {
  if (p == null) return "";
  if (typeof p === "string") return p;
  if (typeof p !== "object") return String(p);
  if (p.text) return String(p.text);
  const phase = p.phase || p.kind || "progress";
  if (phase === "clear_store") return `Vaciando ${p.store || "store"}...`;
  if (phase === "insert_store") return `Restaurando ${p.store || "store"}... (${p.count ?? "?"})`;
  if (phase === "insert_progress") return `Insertando ${p.store || "store"}: ${p.i}/${p.total}`;
  return `Restaurando... (${phase})`;
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
      .then((v) => { clearTimeout(t); resolve(v); })
      .catch((e) => { clearTimeout(t); reject(e); });
  });
}

async function waitTx(tx) {
  if (tx && tx.done) return tx.done;
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("tx abort"));
  });
}

async function dumpAllStores(db, onProgress, timeoutMs) {
  const storeNames = Array.from(db.objectStoreNames);
  const stores = {};
  const storeCounts = {};

  for (const name of storeNames) {
    onProgress?.({ phase: "read_store", store: name, text: `Leyendo ${name}...` });
    const tx = db.transaction(name, "readonly");
    const all = await withTimeout(tx.objectStore(name).getAll(), timeoutMs, `read_${name}_timeout`);
    await withTimeout(tx.done, timeoutMs, `read_${name}_tx_timeout`);
    stores[name] = all;
    storeCounts[name] = all.length;
  }
  return { stores, storeCounts };
}

export async function generateEncryptedBackupBlob(passphrase, opts = {}) {
  const onProgress = typeof opts.onProgress === "function" ? opts.onProgress : null;
  const timeoutMs = Number.isFinite(opts.timeoutMs) ? opts.timeoutMs : 60000;

  if (!passphrase || passphrase.length < 6) {
    const err = new Error("passphrase_too_short");
    err.code = "passphrase_too_short";
    throw err;
  }

  onProgress?.({ phase: "open_db", text: "Abriendo base local..." });
  const db = await withTimeout(getDB(), timeoutMs, "open_db_timeout");

  const { stores, storeCounts } = await dumpAllStores(db, onProgress, timeoutMs);
  db.close?.();

  // Guard: empty backup is usually a mistake
  const anyData = Object.values(storeCounts).reduce((a, b) => a + (b || 0), 0) > 0;
  if (!anyData) {
    const err = new Error("empty_backup");
    err.code = "empty_backup";
    err.storeCounts = storeCounts;
    throw err;
  }

  onProgress?.({ phase: "zip_build", text: "Construyendo ZIP..." });
  const zip = new JSZip();

  // Extract blobs into receipts/ and replace with __blobRef in data.json
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

  const plainZipBytes = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  onProgress?.({ phase: "encrypt", text: "Cifrando..." });
  const encBlob = await withTimeout(encryptBytes(passphrase, plainZipBytes), timeoutMs, "encrypt_timeout");
  return { blob: encBlob, storeCounts };
}

async function deleteAllByCursor(db, storeName, onProgress, timeoutMs) {
  const tx = db.transaction(storeName, "readwrite");
  const os = tx.objectStore(storeName);

  await withTimeout(new Promise((resolve, reject) => {
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
  }), timeoutMs, `clear_${storeName}_cursor_timeout`);

  await withTimeout(tx.done, timeoutMs, `clear_${storeName}_tx_timeout`);
}

async function putOne(db, storeName, record, timeoutMs) {
  const tx = db.transaction(storeName, "readwrite");
  const os = tx.objectStore(storeName);
  await withTimeout(os.put(record), timeoutMs, `put_${storeName}_timeout`);
  await withTimeout(tx.done, timeoutMs, `put_${storeName}_tx_timeout`);
}

export async function restoreFromEncryptedBackupFile(fileBlob, passphrase, opts = {}) {
  const onProgress = typeof opts.onProgress === "function" ? opts.onProgress : null;
  const timeoutMs = Number.isFinite(opts.timeoutMs) ? opts.timeoutMs : 90000;

  if (!fileBlob) throw new Error("missing_file");
  if (!passphrase || passphrase.length < 6) {
    const err = new Error("passphrase_too_short");
    err.code = "passphrase_too_short";
    throw err;
  }

  onProgress?.({ phase: "decrypt", text: "Descifrando..." });
  const plainBytes = await withTimeout(decryptToBytes(passphrase, fileBlob), timeoutMs, "decrypt_timeout");

  onProgress?.({ phase: "unzip", text: "Abriendo ZIP..." });
  const zip = await withTimeout(JSZip.loadAsync(plainBytes), timeoutMs, "unzip_timeout");

  const dataFile = zip.file("data.json");
  const dataText = await withTimeout(dataFile?.async("string"), timeoutMs, "read_datajson_timeout");
  if (!dataText) {
    const err = new Error("bad_backup:no_data_json");
    err.code = "bad_backup";
    throw err;
  }

  onProgress?.({ phase: "parse", text: "Procesando datos..." });
  const parsed = JSON.parse(dataText);
  const stores = parsed.stores || {};
  const meta = parsed.meta || {};
  const storeCounts = meta.storeCounts || null;
  const insertedCounts = {};

  onProgress?.({ phase: "open_db", text: "Abriendo base local..." });
  const db = await withTimeout(getDB(), timeoutMs, "open_db_timeout");
  const storeNames = Array.from(db.objectStoreNames);

  for (const name of storeNames) {
    onProgress?.({ phase: "clear_store", store: name, text: `Vaciando ${name}...` });
    await deleteAllByCursor(db, name, onProgress, timeoutMs);
  }

  for (const name of storeNames) {
    const rows = stores[name];
    if (!Array.isArray(rows) || rows.length === 0) continue;

    insertedCounts[name] = 0;
    onProgress?.({ phase: "insert_store", store: name, count: rows.length, text: `Restaurando ${name}... (${rows.length})` });

    for (let i = 0; i < rows.length; i++) {
      const rec = rows[i];

      if (name === "attachments" && rec && rec.__blobRef) {
        // Await file FIRST (no open tx yet)
        const buf = await withTimeout(zip.file(rec.__blobRef)?.async("arraybuffer"), timeoutMs, "read_blob_timeout");
        const blob = buf ? new Blob([buf], { type: rec.mimeType || "application/octet-stream" }) : null;
        const { __blobRef, ...rest } = rec;
        await putOne(db, name, { ...rest, blob }, timeoutMs);
      } else {
        await putOne(db, name, rec, timeoutMs);
      }

      insertedCounts[name]++;
      if (onProgress && (i % 10 === 0 || i === rows.length - 1)) {
        onProgress({ phase: "insert_progress", store: name, i: i + 1, total: rows.length, text: `Insertando ${name}: ${i + 1}/${rows.length}` });
      }
    }
  }

  db.close?.();
  onProgress?.({ phase: "done", insertedCounts, text: "Restauración completada." });
  return { ok: true, storeCounts, insertedCounts };
}
