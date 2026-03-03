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
  const tms = Number.isFinite(ms) ? ms : 0;
  if (!tms) return promise;
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      const err = new Error(code || "timeout");
      err.code = code || "timeout";
      reject(err);
    }, tms);
    promise
      .then((v) => { clearTimeout(t); resolve(v); })
      .catch((e) => { clearTimeout(t); reject(e); });
  });
}

async function dumpAllStores(opts = {}) {
  const onProgress = typeof opts.onProgress === "function" ? opts.onProgress : null;
  const timeoutMs = Number.isFinite(opts.timeoutMs) ? opts.timeoutMs : 60000;
  const tick = (phase, extra = {}) => {
    try { onProgress && onProgress({ phase, ...extra }); } catch {}
  };

  tick("open_db");
  const db = await withTimeout(getDB(), timeoutMs, "open_db_timeout");

  const storeNames = Array.from(db.objectStoreNames);
  const stores = {};
  const storeCounts = {};

  for (const name of storeNames) {
    tick("read_store", { store: name });
    const tx = db.transaction(name, "readonly");
    const all = await withTimeout(tx.objectStore(name).getAll(), timeoutMs, `read_${name}_timeout`);
    stores[name] = all;
    storeCounts[name] = Array.isArray(all) ? all.length : 0;
    await withTimeout(tx.done, timeoutMs, `read_${name}_commit_timeout`);
  }

  try { db.close && db.close(); } catch {}
  return { stores, storeCounts, tick, timeoutMs };
}

async function buildPlainBackupZipBytes(opts = {}) {
  const onProgress = typeof opts.onProgress === "function" ? opts.onProgress : null;
  const timeoutMs = Number.isFinite(opts.timeoutMs) ? opts.timeoutMs : 60000;
  const tick = (phase, extra = {}) => {
    try { onProgress && onProgress({ phase, ...extra }); } catch {}
  };

  tick("read");
  const { stores, storeCounts } = await dumpAllStores({ onProgress, timeoutMs });

  // Guard against empty backups.
  const anyData =
    (storeCounts.expenses ?? 0) +
    (storeCounts.reimbursements ?? 0) +
    (storeCounts.attachments ?? 0) > 0;

  if (!anyData) {
    const err = new Error("empty_backup");
    err.code = "empty_backup";
    err.storeCounts = storeCounts;
    throw err;
  }

  tick("zip");
  const zip = new JSZip();

  // Extract blobs into /receipts/ and replace them with refs inside data.json
  if (Array.isArray(stores.attachments)) {
    const updated = [];
    for (const rec of stores.attachments) {
      if (rec && rec.blob instanceof Blob) {
        const mimeType = rec.mimeType || rec.blob.type || "application/octet-stream";
        const ext = extFromMime(mimeType);
        const fileName = rec.contentHash ? `${rec.contentHash}.${ext}` : `${rec.adjuntoId}.${ext}`;
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

  const bytes = await withTimeout(
    zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 } }),
    timeoutMs,
    "zip_timeout"
  );

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

async function wipeStoreByDeleting(db, name, opts = {}) {
  const onProgress = typeof opts.onProgress === "function" ? opts.onProgress : null;
  const timeoutMs = Number.isFinite(opts.timeoutMs) ? opts.timeoutMs : 60000;
  const tick = (phase, extra = {}) => {
    try { onProgress && onProgress({ phase, ...extra }); } catch {}
  };

  tick("wipe_store", { store: name });

  const tx = db.transaction(name, "readwrite");
  const os = tx.objectStore(name);

  // Delete using cursor to avoid clear() hanging in some SPA situations.
  let cursor = await withTimeout(os.openCursor(), timeoutMs, `cursor_${name}_timeout`);
  let deleted = 0;

  while (cursor) {
    await withTimeout(cursor.delete(), timeoutMs, `delete_${name}_timeout`);
    deleted += 1;
    cursor = await withTimeout(cursor.continue(), timeoutMs, `cursor_${name}_continue_timeout`);
  }

  await withTimeout(tx.done, timeoutMs, `wipe_${name}_commit_timeout`);
  tick("wipe_store_done", { store: name, deleted });
  return deleted;
}

export async function restoreFromEncryptedBackupFile(fileBlob, passphrase, opts = {}) {
  const onProgress = typeof opts.onProgress === "function" ? opts.onProgress : null;
  const timeoutMs = Number.isFinite(opts.timeoutMs) ? opts.timeoutMs : 90000;
  const tick = (phase, extra = {}) => {
    try { onProgress && onProgress({ phase, ...extra }); } catch {}
  };

  if (!fileBlob) throw new Error("missing_file");
  if (!passphrase || passphrase.length < 6) {
    const err = new Error("passphrase_too_short");
    err.code = "passphrase_too_short";
    throw err;
  }

  tick("decrypt");
  const plainBytes = await withTimeout(decryptToBytes(passphrase, fileBlob), timeoutMs, "decrypt_timeout");

  tick("unzip");
  const zip = await withTimeout(JSZip.loadAsync(plainBytes), timeoutMs, "unzip_timeout");

  const dataFile = zip.file("data.json");
  const dataText = await withTimeout(dataFile?.async("string"), timeoutMs, "read_datajson_timeout");
  if (!dataText) {
    const err = new Error("bad_backup:no_data_json");
    err.code = "bad_backup";
    throw err;
  }

  tick("parse");
  const parsed = JSON.parse(dataText);
  const stores = parsed.stores || {};
  const meta = parsed.meta || {};
  const storeCounts = meta.storeCounts || null;
  const insertedCounts = {};

  tick("open_db");
  const db = await withTimeout(getDB(), timeoutMs, "open_db_timeout");
  const storeNames = Array.from(db.objectStoreNames);

  // Wipe stores one-by-one (robust)
  tick("wipe_begin", { stores: storeNames.length });
  for (const name of storeNames) {
    await wipeStoreByDeleting(db, name, { onProgress, timeoutMs });
  }

  // Insert store data
  tick("insert_begin", { stores: storeNames.length });
  for (const name of storeNames) {
    const rows = stores[name];
    if (!Array.isArray(rows)) continue;

    insertedCounts[name] = rows.length;
    tick("insert_store", { store: name, count: rows.length });

    const tx = db.transaction(name, "readwrite");
    const os = tx.objectStore(name);

    for (const rec of rows) {
      if (name === "attachments" && rec && rec.__blobRef) {
        const buf = await withTimeout(zip.file(rec.__blobRef)?.async("arraybuffer"), timeoutMs, "read_blob_timeout");
        const blob = buf ? new Blob([buf], { type: rec.mimeType || "application/octet-stream" }) : null;
        const { __blobRef, ...rest } = rec;
        await withTimeout(os.put({ ...rest, blob }), timeoutMs, `put_${name}_timeout`);
      } else {
        await withTimeout(os.put(rec), timeoutMs, `put_${name}_timeout`);
      }
    }
    await withTimeout(tx.done, timeoutMs, `insert_${name}_commit_timeout`);
  }

  try { db.close && db.close(); } catch {}
  tick("done", { insertedCounts });
  return { ok: true, storeCounts, insertedCounts, meta };
}
