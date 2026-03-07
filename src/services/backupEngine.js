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
  if (!ms) return promise;
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      const err = new Error(code || "timeout");
      err.code = code || "timeout";
      reject(err);
    }, ms);
    promise.then((v) => { clearTimeout(t); resolve(v); }).catch((e) => { clearTimeout(t); reject(e); });
  });
}

async function dumpAllStores(tick, timeoutMs) {
  tick("open_db");
  const db = await withTimeout(getDB(), timeoutMs, "open_db_timeout");
  const storeNames = Array.from(db.objectStoreNames);
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

export async function buildPlainBackupZipBytes(opts = {}) {
  const onProgress = typeof opts.onProgress === "function" ? opts.onProgress : null;
  const timeoutMs = Number.isFinite(opts.timeoutMs) ? opts.timeoutMs : 30000;
  const tick = (phase, extra) => { try { onProgress && onProgress({ phase, ...extra }); } catch {} };

  const { stores, storeCounts } = await dumpAllStores(tick, timeoutMs);

  const expensesCount = storeCounts.expenses ?? 0;
  const reimbursementsCount = storeCounts.reimbursements ?? 0;
  const attachmentsCount = storeCounts.attachments ?? 0;
  const anyData = (expensesCount + reimbursementsCount + attachmentsCount) > 0;

  if (!anyData) {
    const err = new Error("empty_backup");
    err.code = "empty_backup";
    err.storeCounts = storeCounts;
    throw err;
  }

  tick("read");
  const zip = new JSZip();

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

// Clear por cursor — 1 tx por store, sin awaits externos que expiren la tx
async function clearStoreByCursor(db, storeName) {
  const tx = db.transaction(storeName, "readwrite");
  const store = tx.objectStore(storeName);
  let cursor = await store.openCursor();
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}

// FIX v0.1.3: pre-hidratar todos los blobs ANTES de abrir la tx de insert.
// El error "transaction has finished" ocurre cuando hay awaits lentos (ej: descomprimir
// un blob del ZIP) DENTRO de una transacción IDB activa. La solución es separar
// completamente la fase async-lenta (pre-hydration) de la fase de escritura IDB.
async function preHydrateStoreRows(storeName, rows, zip) {
  if (storeName !== "attachments") return rows;

  const hydrated = [];
  for (const rec of rows) {
    if (rec && rec.__blobRef) {
      // Este await puede tardar — lo hacemos FUERA de cualquier tx IDB
      const buf = await zip.file(rec.__blobRef)?.async("arraybuffer");
      const blob = buf
        ? new Blob([buf], { type: rec.mimeType || "application/octet-stream" })
        : null;
      const { __blobRef, ...rest } = rec;
      hydrated.push({ ...rest, blob });
    } else {
      hydrated.push(rec);
    }
  }
  return hydrated;
}

export async function restoreFromEncryptedBackupFile(fileBlob, passphrase, opts = {}) {
  if (!fileBlob) throw new Error("missing_file");
  if (!passphrase || passphrase.length < 6) {
    const err = new Error("passphrase_too_short");
    err.code = "passphrase_too_short";
    throw err;
  }

  const onProgress = typeof opts.onProgress === "function" ? opts.onProgress : null;
  const timeoutMs = Number.isFinite(opts.timeoutMs) ? opts.timeoutMs : 60000;
  const tick = (phase, extra) => { try { onProgress && onProgress({ phase, ...extra }); } catch {} };

  tick("decrypt");
  const plainBytes = await withTimeout(decryptToBytes(passphrase, fileBlob), timeoutMs, "decrypt_timeout");

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
  const stores = parsed.stores || {};
  const meta = parsed.meta || {};
  const storeCounts = meta.storeCounts || null;
  const insertedCounts = {};

  const db = await getDB();
  const storeNames = Array.from(db.objectStoreNames);

  // FASE 1 — Pre-hidratar blobs (lento, FUERA de cualquier tx IDB)
  tick("hydrate");
  const hydratedStores = {};
  for (const name of storeNames) {
    const rows = stores[name];
    if (!Array.isArray(rows)) {
      hydratedStores[name] = [];
      continue;
    }
    if (name === "attachments") {
      tick("hydrate_store", { store: name, count: rows.length });
    }
    hydratedStores[name] = await preHydrateStoreRows(name, rows, zip);
  }

  // FASE 2 — Clear por cursor, 1 tx por store
  tick("clear_stores", { stores: storeNames.length });
  for (const name of storeNames) {
    tick("clear_store", { store: name });
    await clearStoreByCursor(db, name);
  }

  // FASE 3 — Insert: 1 tx por store, SIN awaits externos dentro de la tx
  tick("insert_begin", { stores: storeNames.length });
  for (const name of storeNames) {
    const rows = hydratedStores[name];
    if (!rows.length) continue;

    insertedCounts[name] = rows.length;
    tick("insert_store", { store: name, count: rows.length });

    // Todos los registros ya están hidratados — solo puts síncronos dentro de la tx
    const tx = db.transaction(name, "readwrite");
    const os = tx.objectStore(name);
    for (const rec of rows) {
      os.put(rec); // SIN await — encolar todos los puts y dejar que IDB los procese
    }
    await tx.done; // esperar que la tx complete todos los puts
  }

  tick("done", { insertedCounts });

  // Generar nuevo deviceId para este dispositivo — evita que el sync
  // ignore eventos propios de otros dispositivos que tengan el mismo ID
  try {
    const { v4 } = await import("uuid");
    const newDeviceId = v4();
    const st = await db.get("sync_state", "main");
    if (st) await db.put("sync_state", { ...st, deviceId: newDeviceId });
    const settingsAll = await db.getAll("settings");
    if (settingsAll.length > 0) {
      const s = settingsAll[0];
      await db.put("settings", { ...s, deviceId: newDeviceId });
    }
  } catch (e) {
    console.warn("restore: no se pudo regenerar deviceId", e);
  }

  return { ok: true, storeCounts, insertedCounts, meta };
}
