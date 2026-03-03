import JSZip from "jszip";
import { getDB, ensureSeedData } from "../db.js";
import { deriveAesKeyFromPassphrase } from "./crypto.js";

// -----------------------------
// Encrypted Full Backup (.cczip)
// -----------------------------
// File format: UTF-8 JSON header + "\n" + AES-GCM ciphertext bytes.
// Header example:
// { "format":"cczip", "version":1, "kdf":"PBKDF2-SHA256", "iterations":150000,
//   "salt":"base64", "iv":"base64", "createdAt":"ISO" }

const DB_NAME = "pettycash_db";
const KDF_ITERATIONS = 150000;

function nowStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

function toBase64(bytes) {
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}

function fromBase64(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function zipFullSnapshot() {
  const db = await getDB();
  const zip = new JSZip();

  // Export all stores (v3). Attachments blobs go to /receipts/ and are referenced in data.json.
  const storeNames = Array.from(db.objectStoreNames);

  const data = {
    meta: {
      format: "caja-chica-backup",
      version: 1,
      createdAt: new Date().toISOString(),
      dbName: DB_NAME,
      stores: storeNames,
    },
    stores: {},
    attachments: {
      // adjuntoId -> { path, mimeType, filename, contentHash }
      blobs: {},
    },
  };

  for (const storeName of storeNames) {
    const all = await db.getAll(storeName);

    if (storeName !== "attachments") {
      data.stores[storeName] = all;
      continue;
    }

    // Attachments: strip blob out of JSON, store blob in zip file.
    const exported = [];
    for (const rec of all) {
      const { blob, ...rest } = rec || {};
      let blobPath = null;

      if (blob instanceof Blob) {
        const ext =
          rec?.mimeType === "image/webp"
            ? "webp"
            : rec?.mimeType === "image/jpeg"
            ? "jpg"
            : rec?.mimeType === "image/png"
            ? "png"
            : "bin";

        const key = rec?.contentHash ? rec.contentHash : rec?.adjuntoId;
        blobPath = `receipts/${key}.${ext}`;
        zip.file(blobPath, blob);
        data.attachments.blobs[rec.adjuntoId] = {
          path: blobPath,
          mimeType: rec?.mimeType || "application/octet-stream",
          filename: rec?.filename || `${key}.${ext}`,
          contentHash: rec?.contentHash || null,
        };
      }

      exported.push({ ...rest, blobRef: blobPath || null });
    }
    data.stores.attachments = exported;
  }

  zip.file("data.json", JSON.stringify(data, null, 2));

  // Generate zip bytes
  const zipBytes = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 } });
  return zipBytes;
}

async function encryptZipBytes(zipBytes, passphrase) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKeyFromPassphrase(passphrase, salt, { iterations: KDF_ITERATIONS });

  const cipherBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    zipBytes
  );

  const cipherBytes = new Uint8Array(cipherBuf);

  const header = {
    format: "cczip",
    version: 1,
    kdf: "PBKDF2-SHA256",
    iterations: KDF_ITERATIONS,
    salt: toBase64(salt),
    iv: toBase64(iv),
    createdAt: new Date().toISOString(),
  };

  const enc = new TextEncoder();
  const headerBytes = enc.encode(JSON.stringify(header));
  const newline = new Uint8Array([10]);

  const out = new Uint8Array(headerBytes.length + 1 + cipherBytes.length);
  out.set(headerBytes, 0);
  out.set(newline, headerBytes.length);
  out.set(cipherBytes, headerBytes.length + 1);

  return { bytes: out, header };
}

function splitHeaderAndCipher(allBytes) {
  // find first newline (0x0A)
  const idx = allBytes.indexOf(10);
  if (idx <= 0) throw new Error("Formato inválido: header no encontrado");
  const headerBytes = allBytes.slice(0, idx);
  const cipherBytes = allBytes.slice(idx + 1);
  const dec = new TextDecoder();
  const header = JSON.parse(dec.decode(headerBytes));
  return { header, cipherBytes };
}

async function decryptToZipBytes(fileBytes, passphrase) {
  const { header, cipherBytes } = splitHeaderAndCipher(fileBytes);

  if (header.format !== "cczip") throw new Error("Formato inválido: no es cczip");
  const salt = fromBase64(header.salt);
  const iv = fromBase64(header.iv);
  const key = await deriveAesKeyFromPassphrase(passphrase, salt, { iterations: header.iterations || KDF_ITERATIONS });

  const plainBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    cipherBytes
  );
  return new Uint8Array(plainBuf);
}

function deleteIndexedDb(dbName) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(dbName);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error || new Error("deleteDatabase failed"));
    req.onblocked = () => reject(new Error("deleteDatabase blocked"));
  });
}

// Public API

export async function generateEncryptedFullBackup({ passphrase }) {
  if (!passphrase || passphrase.length < 6) {
    return { ok: false, error: "passphrase_too_short" };
  }
  const zipBytes = await zipFullSnapshot();
  const { bytes } = await encryptZipBytes(zipBytes, passphrase);
  const filename = `backup_full_${nowStamp()}.cczip`;
  const blob = new Blob([bytes], { type: "application/octet-stream" });
  return { ok: true, blob, filename };
}

export async function restoreFromEncryptedBackup({ file, passphrase }) {
  if (!file) return { ok: false, error: "missing_file" };
  if (!passphrase || passphrase.length < 6) return { ok: false, error: "passphrase_too_short" };

  const fileBytes = new Uint8Array(await file.arrayBuffer());
  let zipBytes;
  try {
    zipBytes = await decryptToZipBytes(fileBytes, passphrase);
  } catch (e) {
    return { ok: false, error: "decrypt_failed", detail: String(e?.message || e) };
  }

  let data;
  let zip;
  try {
    zip = await JSZip.loadAsync(zipBytes);
    const dataText = await zip.file("data.json").async("string");
    data = JSON.parse(dataText);
  } catch (e) {
    return { ok: false, error: "zip_parse_failed", detail: String(e?.message || e) };
  }

  // Replace local DB entirely
  try {
    await deleteIndexedDb(DB_NAME);
  } catch (e) {
    return { ok: false, error: "delete_db_failed", detail: String(e?.message || e) };
  }

  // Recreate schema + restore
  try {
    await ensureSeedData(); // creates DB and backfills defaults (safe)
    const db = await getDB();

    // Restore store-by-store. Attachments need blob reload.
    for (const [storeName, records] of Object.entries(data.stores || {})) {
      if (!Array.isArray(records)) continue;
      const tx = db.transaction([storeName], "readwrite");
      const store = tx.objectStore(storeName);

      if (storeName !== "attachments") {
        for (const rec of records) {
          await store.put(rec);
        }
        await tx.done;
        continue;
      }

      // attachments: read blob from zip using map in data.attachments.blobs
      for (const rec of records) {
        const blobMeta = data.attachments?.blobs?.[rec.adjuntoId] || null;
        let blob = null;
        if (blobMeta?.path) {
          const f = zip.file(blobMeta.path);
          if (f) {
            const ab = await f.async("arraybuffer");
            blob = new Blob([ab], { type: blobMeta.mimeType || rec.mimeType || "application/octet-stream" });
          }
        }
        const restored = { ...rec };
        delete restored.blobRef;
        restored.blob = blob;
        restored.sizeBytes = blob?.size ?? restored.sizeBytes ?? null;
        await store.put(restored);
      }
      await tx.done;
    }

    db.close();
  } catch (e) {
    return { ok: false, error: "restore_failed", detail: String(e?.message || e) };
  }

  return { ok: true };
}
