// Backup encryption helpers (AES-GCM + PBKDF2) for .cczip
// No secrets stored. Passphrase required for restore.

function utf8ToBytes(str) {
  return new TextEncoder().encode(str);
}
function bytesToUtf8(bytes) {
  return new TextDecoder().decode(bytes);
}
function b64encode(bytes) {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}
function b64decode(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export async function deriveAesKeyFromPassphrase(passphrase, saltBytes, iterations = 100000) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    utf8ToBytes(passphrase),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: saltBytes,
      iterations,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptBytes(passphrase, plainBytes) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const iterations = 100000;

  const key = await deriveAesKeyFromPassphrase(passphrase, salt, iterations);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plainBytes)
  );

  const header = {
    v: 1,
    alg: "AES-GCM",
    kdf: "PBKDF2-SHA256",
    iter: iterations,
    salt: b64encode(salt),
    iv: b64encode(iv),
  };

  // Store as JSON header + "\n" + base64(ciphertext) for simplicity & portability.
  // (Slight overhead but acceptable for Phase 1.)
  const payload = JSON.stringify(header) + "\n" + b64encode(ciphertext);
  return new Blob([payload], { type: "application/octet-stream" });
}

export async function decryptToBytes(passphrase, encryptedBlob) {
  const text = await encryptedBlob.text();
  const nl = text.indexOf("\n");
  if (nl < 0) throw new Error("bad_format:missing_header");
  const header = JSON.parse(text.slice(0, nl));
  const ciphertext = b64decode(text.slice(nl + 1));

  const salt = b64decode(header.salt);
  const iv = b64decode(header.iv);
  const key = await deriveAesKeyFromPassphrase(passphrase, salt, header.iter);

  const plain = new Uint8Array(
    await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext)
  );
  return plain;
}

export function isEncryptedBackupText(text) {
  try {
    const nl = text.indexOf("\n");
    if (nl < 0) return false;
    const header = JSON.parse(text.slice(0, nl));
    return header && header.alg === "AES-GCM" && header.kdf && header.salt && header.iv;
  } catch {
    return false;
  }
}
