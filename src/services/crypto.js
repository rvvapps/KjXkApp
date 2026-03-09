// Minimal crypto utilities for offline-first sync.
// Uses WebCrypto (available on modern browsers, including iOS Safari).

export async function sha256Hex(blobOrArrayBuffer) {
  const ab = blobOrArrayBuffer instanceof ArrayBuffer
    ? blobOrArrayBuffer
    : await blobOrArrayBuffer.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", ab);
  const bytes = new Uint8Array(hash);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function deriveAesKeyFromPassphrase(passphrase, saltBytes, { iterations = 150000 } = {}) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: saltBytes, iterations, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}
