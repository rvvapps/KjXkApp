import { getDB, getSettings, saveSettings } from "../db.js";
import { ensureOneDriveRoot, putFileUnderRoot, listFilesUnderRoot, getFileUnderRoot, deleteFileUnderRoot } from "./onedriveApi.js";

function nowIso() { return new Date().toISOString(); }

// ── Helpers outbox ────────────────────────────────────────────────────────

async function listPendingOutbox(db) {
  const all = await db.getAll("sync_outbox");
  return all.filter((e) => e.status === "pending" || e.status === "failed");
}

async function markOutboxUploaded(db, eventId) {
  const e = await db.get("sync_outbox", eventId);
  if (!e) return;
  await db.put("sync_outbox", { ...e, status: "uploaded", lastError: null });
}

async function bumpOutboxFailure(db, eventId, err) {
  const e = await db.get("sync_outbox", eventId);
  if (!e) return;
  await db.put("sync_outbox", {
    ...e, status: "failed",
    retryCount: (e.retryCount || 0) + 1,
    lastError: String(err || "upload_failed"),
  });
}

// ── Helpers receipts ──────────────────────────────────────────────────────

async function listPendingObjects(db) {
  const all = await db.getAll("sync_objects");
  return all.filter((o) => o.objectType === "receipt" && !o.uploadedAt);
}

async function findReceiptBlobByHash(db, contentHash) {
  let cursor = await db.transaction("attachments").store.openCursor();
  while (cursor) {
    const v = cursor.value;
    if (v?.contentHash === contentHash && v?.blob) return v.blob;
    cursor = await cursor.continue();
  }
  return null;
}

async function markObjectUploaded(db, contentHash) {
  const o = await db.get("sync_objects", contentHash);
  if (!o) return;
  await db.put("sync_objects", { ...o, uploadedAt: nowIso() });
}

// ── Aplicar evento entrante a la DB local ─────────────────────────────────

async function applyIncomingEvent(db, ev) {
  const { type, payload } = ev;
  if (!type || !payload) return;

  if (type === "entity.upsert") {
    const { entityType, entityId, data } = payload;
    if (!entityType || !entityId || !data) return;

    const storeMap = {
      expense:        "expenses",
      reimbursement:  "reimbursements",
      transfer:       "transfers",
      attachmentMeta: "attachments",
      concept:        "concepts",
    };
    const store = storeMap[entityType];
    if (!store) return;

    const existing = await db.get(store, entityId);
    // Solo aplicar si el evento es más reciente
    if (existing && existing.updatedAt && data.updatedAt && data.updatedAt <= existing.updatedAt) return;

    // Para attachmentMeta no sobreescribir el blob local si ya existe
    if (entityType === "attachmentMeta" && existing?.blob) {
      await db.put(store, { ...data, blob: existing.blob });
    } else {
      await db.put(store, data);
    }
  }

  if (type === "entity.delete") {
    const { entityType, entityId } = payload;
    const storeMap = {
      expense:        "expenses",
      reimbursement:  "reimbursements",
      transfer:       "transfers",
      attachmentMeta: "attachments",
    };
    const store = storeMap[entityType];
    if (store) await db.delete(store, entityId).catch(() => {});
  }
}

// ── UPLOAD ────────────────────────────────────────────────────────────────

export async function syncUp() {
  const db = await getDB();
  const settings = await getSettings();
  const root = await ensureOneDriveRoot({ preferAppFolder: true });
  if (!root.ok) return { ok: false, step: "ensureRoot", ...root };

  // Subir receipts pendientes (uno a uno — son binarios grandes)
  const pendingObjects = await listPendingObjects(db);
  for (const obj of pendingObjects) {
    try {
      const blob = await findReceiptBlobByHash(db, obj.contentHash);
      if (!blob) continue;
      const ext = obj.mimeType === "image/webp" ? "webp" : "jpg";
      const relPath = `objects/receipts/${obj.contentHash}.${ext}`;
      const put = await putFileUnderRoot({
        rootMode: root.rootMode, rootFolderItemId: root.rootFolderItemId,
        relPath, contentType: obj.mimeType || "application/octet-stream", data: blob,
      });
      if (!put.ok) return { ok: false, step: "uploadReceipt", error: put.error };
      await markObjectUploaded(db, obj.contentHash);
    } catch (err) {
      return { ok: false, step: "uploadReceipt", error: "exception", detail: String(err) };
    }
  }

  // Subir eventos del outbox en paralelo por batches de 5
  const pendingEvents = await listPendingOutbox(db);
  const BATCH = 5;
  for (let i = 0; i < pendingEvents.length; i += BATCH) {
    const batch = pendingEvents.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      batch.map(async (ev) => {
        const relPath = `sync/outbox/${settings.deviceId}/${ev.eventId}.json`;
        const put = await putFileUnderRoot({
          rootMode: root.rootMode, rootFolderItemId: root.rootFolderItemId,
          relPath, contentType: "application/json",
          data: new Blob([JSON.stringify(ev)], { type: "application/json" }),
        });
        if (!put.ok) throw new Error(put.error || "upload_failed");
        return ev.eventId;
      })
    );
    for (let j = 0; j < results.length; j++) {
      const ev = batch[j];
      if (results[j].status === "fulfilled") {
        await markOutboxUploaded(db, ev.eventId);
      } else {
        await bumpOutboxFailure(db, ev.eventId, results[j].reason);
      }
    }
  }

  await saveSettings({ lastSyncAt: nowIso() });

  // Limpiar de OneDrive los eventos propios subidos hace más de 24h
  // Esto da tiempo a todos los receptores de procesarlos antes de borrarlos
  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const uploadedEvents = await db.getAll("sync_outbox");
    const toClean = uploadedEvents.filter((e) => e.status === "uploaded" && e.uploadedAt && e.uploadedAt < cutoff);
    if (toClean.length > 0) {
      await Promise.allSettled(
        toClean.map((ev) =>
          deleteFileUnderRoot({
            rootMode: root.rootMode, rootFolderItemId: root.rootFolderItemId,
            relPath: `sync/outbox/${settings.deviceId}/${ev.eventId}.json`,
          }).catch(() => {})
        )
      );
    }
  } catch (e) {
    // No crítico
  }

  return { ok: true, uploadedEvents: pendingEvents.length, uploadedReceipts: pendingObjects.length };
}

// ── DOWNLOAD ──────────────────────────────────────────────────────────────

export async function syncDown() {
  const db = await getDB();
  const settings = await getSettings();
  const root = await ensureOneDriveRoot({ preferAppFolder: true });
  if (!root.ok) return { ok: false, step: "ensureRoot", ...root };

  // Listar carpetas de dispositivos en sync/outbox/
  const devList = await listFilesUnderRoot({
    rootMode: root.rootMode, rootFolderItemId: root.rootFolderItemId,
    relPath: "sync/outbox",
  });
  if (!devList.ok) return { ok: true, appliedEvents: 0 }; // carpeta no existe aún — ok

  let appliedEvents = 0;
  const myDeviceId = settings.deviceId;

  for (const devFolder of devList.files) {
    // Saltar nuestro propio deviceId — ya tenemos esos eventos localmente
    if (devFolder.name === myDeviceId) continue;

    const evList = await listFilesUnderRoot({
      rootMode: root.rootMode, rootFolderItemId: root.rootFolderItemId,
      relPath: `sync/outbox/${devFolder.name}`,
    });
    if (!evList.ok) continue;

    // Ordenar por nombre (eventId tiene timestamp implícito via revision)
    const files = evList.files.sort((a, b) => a.name.localeCompare(b.name));

    // Filtrar eventos ya procesados
    const pendingFiles = [];
    for (const file of files) {
      const alreadyApplied = await db.get("sync_inbox", file.name.replace(".json", "")).catch(() => null);
      if (!alreadyApplied) pendingFiles.push(file);
    }

    // Descargar en paralelo por batches de 5 para acelerar sync
    const BATCH = 5;
    for (let i = 0; i < pendingFiles.length; i += BATCH) {
      const batch = pendingFiles.slice(i, i + BATCH);
      const results = await Promise.allSettled(
        batch.map(async (file) => {
          const dl = await getFileUnderRoot({
            rootMode: root.rootMode, rootFolderItemId: root.rootFolderItemId,
            relPath: `sync/outbox/${devFolder.name}/${file.name}`,
          });
          if (!dl.ok) return null;
          const text = await dl.blob.text();
          return { file, ev: JSON.parse(text) };
        })
      );

      for (const result of results) {
        if (result.status !== "fulfilled" || !result.value) continue;
        const { file, ev } = result.value;
        try {
          await applyIncomingEvent(db, ev);
          await db.put("sync_inbox", {
            eventId: ev.eventId || file.name.replace(".json", ""),
            processedAt: nowIso(),
            fromDevice: devFolder.name,
          }).catch(() => {});
          appliedEvents++;
        } catch (err) {
          console.warn("syncDown: error aplicando evento", file.name, err);
        }
      }
    }
  }

  return { ok: true, appliedEvents };
}

// ── Descargar blobs faltantes desde OneDrive ──────────────────────────────

async function downloadMissingBlobs(db, root) {
  // Buscar attachments que tienen contentHash pero blob vacío/nulo
  const allAtts = await db.getAll("attachments");
  const missing = allAtts.filter((a) => a.contentHash && (!a.blob || a.blob.size === 0));
  if (missing.length === 0) return 0;

  let downloaded = 0;
  for (const att of missing) {
    try {
      const ext = att.mimeType === "image/webp" ? "webp" : att.mimeType === "application/pdf" ? "pdf" : "jpg";
      const relPath = `objects/receipts/${att.contentHash}.${ext}`;
      const dl = await getFileUnderRoot({
        rootMode: root.rootMode, rootFolderItemId: root.rootFolderItemId, relPath,
      });
      if (!dl.ok || !dl.blob || dl.blob.size === 0) continue;

      // Guardar blob en el attachment existente
      const tx = db.transaction("attachments", "readwrite");
      const existing = await tx.store.get(att.adjuntoId);
      if (existing) {
        await tx.store.put({ ...existing, blob: dl.blob, sizeBytes: dl.blob.size });
      }
      await tx.done;
      downloaded++;
    } catch (err) {
      console.warn("downloadMissingBlobs: error descargando", att.contentHash, err);
    }
  }
  return downloaded;
}

// ── SYNC COMPLETO (up + down) ─────────────────────────────────────────────

export async function syncOnce() {
  const down = await syncDown();
  if (!down.ok) return { ok: false, step: "syncDown", ...down };
  const up = await syncUp();
  if (!up.ok) return up;

  // Descargar blobs faltantes (imágenes que llegaron por evento pero sin contenido)
  let downloadedBlobs = 0;
  try {
    const db = await getDB();
    const root = await ensureOneDriveRoot({ preferAppFolder: true });
    if (root.ok) downloadedBlobs = await downloadMissingBlobs(db, root);
  } catch (err) {
    console.warn("syncOnce: downloadMissingBlobs error", err);
  }

  return {
    ok: true,
    uploadedEvents: up.uploadedEvents,
    uploadedReceipts: up.uploadedReceipts,
    appliedEvents: down.appliedEvents,
    downloadedBlobs,
  };
}

// ── BACKUP en OneDrive ────────────────────────────────────────────────────

export async function findLatestBackupInOneDrive() {
  const root = await ensureOneDriveRoot({ preferAppFolder: true });
  if (!root.ok) return { ok: false, error: root.error };

  const list = await listFilesUnderRoot({
    rootMode: root.rootMode, rootFolderItemId: root.rootFolderItemId,
    relPath: "exports",
  });
  if (!list.ok) return { ok: false, error: "no_exports_folder" };

  const backups = list.files
    .filter((f) => f.name.endsWith(".cczip"))
    .sort((a, b) => b.lastModifiedDateTime.localeCompare(a.lastModifiedDateTime));

  if (backups.length === 0) return { ok: false, error: "no_backups" };
  return { ok: true, file: backups[0], root };
}

export async function downloadBackupFromOneDrive(relPath, root) {
  if (!root) {
    const r = await ensureOneDriveRoot({ preferAppFolder: true });
    if (!r.ok) return { ok: false, error: r.error };
    root = r;
  }
  return getFileUnderRoot({
    rootMode: root.rootMode, rootFolderItemId: root.rootFolderItemId,
    relPath,
  });
}

// ── Limpiar outbox de OneDrive ────────────────────────────────────────────

export async function cleanOneDriveOutbox({ onProgress } = {}) {
  const root = await ensureOneDriveRoot({ preferAppFolder: true });
  if (!root.ok) return { ok: false, error: root.error };

  // Listar carpetas de dispositivos
  const devList = await listFilesUnderRoot({
    rootMode: root.rootMode, rootFolderItemId: root.rootFolderItemId,
    relPath: "sync/outbox",
  });
  if (!devList.ok) return { ok: true, deleted: 0 }; // no existe aún

  let deleted = 0;
  for (const devFolder of devList.files) {
    const evList = await listFilesUnderRoot({
      rootMode: root.rootMode, rootFolderItemId: root.rootFolderItemId,
      relPath: `sync/outbox/${devFolder.name}`,
    });
    if (!evList.ok) continue;
    for (const file of evList.files) {
      try {
        const r = await deleteFileUnderRoot({
          rootMode: root.rootMode, rootFolderItemId: root.rootFolderItemId,
          relPath: `sync/outbox/${devFolder.name}/${file.name}`,
        });
        if (r.ok) {
          deleted++;
          onProgress?.(`🗑️ Eliminando eventos… (${deleted})`);
        }
      } catch (e) {
        console.warn("cleanOneDriveOutbox: error borrando", file.name, e);
      }
    }
  }

  // Limpiar también sync_inbox local para evitar duplicados al re-sincronizar
  const db = await getDB();
  await db.clear("sync_inbox").catch(() => {});
  await db.clear("sync_outbox").catch(() => {});

  return { ok: true, deleted };
}
