
import JSZip from "jszip";

function waitTx(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("tx abort"));
  });
}

async function deleteByCursor(db, storeName) {
  const tx = db.transaction(storeName, "readwrite");
  const store = tx.objectStore(storeName);
  const request = store.openCursor();

  await new Promise((resolve, reject) => {
    request.onsuccess = function (event) {
      const cursor = event.target.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      } else {
        resolve();
      }
    };
    request.onerror = () => reject(request.error);
  });

  await waitTx(tx);
}

async function putOneByOne(db, storeName, records, onProgress) {
  for (let i = 0; i < records.length; i++) {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).put(records[i]);
    await waitTx(tx);
    if (onProgress && (i % 10 === 0 || i === records.length - 1)) {
      onProgress(`Insertando ${storeName}... ${i + 1}/${records.length}`);
    }
  }
}

export async function restoreFromEncryptedBackupFile(file, password, onProgress) {
  onProgress?.("Leyendo archivo...");
  const arrayBuffer = await file.arrayBuffer();

  onProgress?.("Abriendo ZIP...");
  const zip = await JSZip.loadAsync(arrayBuffer);

  const dataFile = zip.file("data.json");
  if (!dataFile) throw new Error("Backup inválido (sin data.json)");

  const data = JSON.parse(await dataFile.async("string"));

  const dbReq = indexedDB.open("pettycash_db");
  const db = await new Promise((resolve, reject) => {
    dbReq.onsuccess = () => resolve(dbReq.result);
    dbReq.onerror = () => reject(dbReq.error);
  });

  const stores = Array.from(db.objectStoreNames);

  for (const storeName of stores) {
    onProgress?.(`Vaciando ${storeName}...`);
    await deleteByCursor(db, storeName);
  }

  for (const storeName of stores) {
    const records = data[storeName] || [];
    if (records.length > 0) {
      onProgress?.(`Restaurando ${storeName}...`);
      await putOneByOne(db, storeName, records, onProgress);
    }
  }

  db.close();
  onProgress?.("Restauración completada.");
}
