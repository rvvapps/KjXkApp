const STAGE_DB = "pettycash_restore_stage";
const STAGE_VERSION = 1;
const STORE = "kv";

function openStageDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(STAGE_DB, STAGE_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("stage_open_failed"));
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("stage_tx_failed"));
    tx.onabort = () => reject(tx.error || new Error("stage_tx_aborted"));
  });
}

export async function stageRestoreBlob(blob) {
  const db = await openStageDB();
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).put({ key: "pending", blob });
  await txDone(tx);
  db.close();
  return true;
}

export async function readStagedRestoreBlob() {
  const db = await openStageDB();
  const tx = db.transaction(STORE, "readonly");
  const req = tx.objectStore(STORE).get("pending");
  const blob = await new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result ? req.result.blob : null);
    req.onerror = () => reject(req.error || new Error("stage_get_failed"));
  });
  await txDone(tx);
  db.close();
  return blob;
}

export async function clearStagedRestore() {
  const db = await openStageDB();
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).delete("pending");
  await txDone(tx);
  db.close();
  return true;
}
