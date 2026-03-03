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

async function dumpAllStores() {
  const db = await getDB();
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

export async function buildPlainBackupZipBytes() {
  const { stores, storeCounts } = await dumpAllStores();

  // Guard against empty backups (common mistake during setup).
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

  const bytes = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  return { bytes, storeCounts };
}

export async function generateEncryptedBackupBlob(passphrase) {
  if (!passphrase || passphrase.length < 6) {
    const err = new Error("passphrase_too_short");
    err.code = "passphrase_too_short";
    throw err;
  }
  const { bytes, storeCounts } = await buildPlainBackupZipBytes();
  const encBlob = await encryptBytes(passphrase, bytes);
  return { blob: encBlob, storeCounts };
}

async function clearStore(os) {
  return new Promise((resolve, reject) => {
    const req = os.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error || new Error("clear_failed"));
  });
}

export async function restoreFromEncryptedBackupFile(fileBlob, passphrase) {
  if (!fileBlob) throw new Error("missing_file");
  if (!passphrase || passphrase.length < 6) {
    const err = new Error("passphrase_too_short");
    err.code = "passphrase_too_short";
    throw err;
  }

  const plainBytes = await decryptToBytes(passphrase, fileBlob);
  const zip = await JSZip.loadAsync(plainBytes);

  const dataFile = zip.file("data.json");
  const dataText = await dataFile?.async("string");
  if (!dataText) {
    const err = new Error("bad_backup:no_data_json");
    err.code = "bad_backup";
    throw err;
  }

  const parsed = JSON.parse(dataText);
  const stores = parsed.stores || {};
  const meta = parsed.meta || {};
  const storeCounts = meta.storeCounts || null;
  const insertedCounts = {};

  // IMPORTANT: avoid indexedDB.deleteDatabase() which can be BLOCKED by other tabs.
  // Instead, wipe stores with .clear(), then re-insert.
  const db = await getDB();
  const storeNames = Array.from(db.objectStoreNames);

  // Clear all stores first (single multi-store tx is faster)
  {
    const tx = db.transaction(storeNames, "readwrite");
    for (const name of storeNames) {
      await clearStore(tx.objectStore(name));
    }
    await tx.done;
  }

  // Insert store data
  for (const name of storeNames) {
    const rows = stores[name];
    if (!Array.isArray(rows)) continue;

    insertedCounts[name] = rows.length;

    const tx = db.transaction(name, "readwrite");
    const os = tx.objectStore(name);

    for (const rec of rows) {
      if (name === "attachments" && rec && rec.__blobRef) {
        const buf = await zip.file(rec.__blobRef)?.async("arraybuffer");
        const blob = buf ? new Blob([buf], { type: rec.mimeType || "application/octet-stream" }) : null;
        const { __blobRef, ...rest } = rec;
        await os.put({ ...rest, blob });
      } else {
        await os.put(rec);
      }
    }
    await tx.done;
  }

  return { ok: true, storeCounts, insertedCounts, meta };
}
