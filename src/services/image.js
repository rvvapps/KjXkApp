// iPhone-first defaults: keep receipts readable while minimizing storage.
// - maxDim: 1600px (long edge)
// - quality: 0.72
// - prefer WebP when supported, fallback to JPEG
import { sha256Hex } from "./crypto.js";

export async function compressImageFile(file, { maxDim = 1600, quality = 0.72 } = {}) {
  if (!file || !file.type || !file.type.startsWith("image/")) return file;

  const img = document.createElement("img");
  const url = URL.createObjectURL(file);
  img.src = url;
  await img.decode();
  URL.revokeObjectURL(url);

  const { width, height } = img;
  const scale = Math.min(1, maxDim / Math.max(width, height));
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, w, h);

  // Prefer WebP if supported. Fallback to JPEG.
  const toBlob = (type) => new Promise((resolve) => canvas.toBlob(resolve, type, quality));

  let outType = "image/webp";
  let blob = await toBlob(outType);
  if (!blob) {
    outType = "image/jpeg";
    blob = await toBlob(outType);
  }

  const ext = outType === "image/webp" ? "webp" : "jpg";
  const base = (file.name || "boleta").replace(/\.[^.]+$/, "");
  return new File([blob], `${base}.${ext}`, { type: outType });
}

// Prepares a receipt image for storage/sync:
// - compress + resize
// - compute sha256 hash of final blob for OneDrive object key
// Returns { blob, mimeType, filename, width, height, sizeBytes, contentHash }
export async function prepareReceiptImage(file, { maxDim = 1600, quality = 0.72 } = {}) {
  const compressed = await compressImageFile(file, { maxDim, quality });
  // Determine dimensions from the compressed file (cheap: decode as image again)
  const img = document.createElement("img");
  const url = URL.createObjectURL(compressed);
  img.src = url;
  await img.decode();
  URL.revokeObjectURL(url);
  const width = img.width;
  const height = img.height;

  const blob = compressed instanceof File ? compressed : new File([compressed], "boleta", { type: compressed.type });
  const contentHash = await sha256Hex(blob);

  return {
    blob,
    mimeType: blob.type,
    filename: blob.name || `receipt.${blob.type === "image/webp" ? "webp" : "jpg"}`,
    width,
    height,
    sizeBytes: blob.size,
    contentHash,
  };
}