import { getDB, getSettings, saveSettings } from "../db.js";
import { ensureOneDriveRoot, putFileUnderRoot, listFilesUnderRoot, getFileUnderRoot } from "./onedriveApi.js";

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

  // Subir receipts pendientes
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

  // Subir eventos del outbox
  const pendingEvents = await listPendingOutbox(db);
  for (const ev of pendingEvents) {
    try {
      const relPath = `sync/outbox/${settings.deviceId}/${ev.eventId}.json`;
      const put = await putFileUnderRoot({
        rootMode: root.rootMode, rootFolderItemId: root.rootFolderItemId,
        relPath, contentType: "application/json",
        data: new Blob([JSON.stringify(ev)], { type: "application/json" }),
      });
      if (!put.ok) {
        await bumpOutboxFailure(db, ev.eventId, put.error);
        return { ok: false, step: "uploadEvent", error: put.error };
      }
      await markOutboxUploaded(db, ev.eventId);
    } catch (err) {
      await bumpOutboxFailure(db, ev.eventId, err);
      return { ok: false, step: "uploadEvent", error: "exception", detail: String(err) };
    }
  }

  await saveSettings({ lastSyncAt: nowIso() });
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

    for (const file of files) {
      try {
        // Verificar si ya procesamos este evento
        const alreadyApplied = await db.get("sync_inbox", file.name.replace(".json", "")).catch(() => null);
        if (alreadyApplied) continue;

        const dl = await getFileUnderRoot({
          rootMode: root.rootMode, rootFolderItemId: root.rootFolderItemId,
          relPath: `sync/outbox/${devFolder.name}/${file.name}`,
        });
        if (!dl.ok) continue;

        const text = await dl.blob.text();
        const ev = JSON.parse(text);
        await applyIncomingEvent(db, ev);

        // Marcar como procesado en sync_inbox
        await db.put("sync_inbox", {
          eventId: ev.eventId || file.name.replace(".json", ""),
          processedAt: nowIso(),
          fromDevice: devFolder.name,
        }).catch(() => {});

        appliedEvents++;
      } catch (err) {
        console.warn("syncDown: error procesando evento", file.name, err);
      }
    }
  }

  return { ok: true, appliedEvents };
}

// ── SYNC COMPLETO (up + down) ─────────────────────────────────────────────

export async function syncOnce() {
  const down = await syncDown();
  if (!down.ok) return { ok: false, step: "syncDown", ...down };
  const up = await syncUp();
  if (!up.ok) return up;
  return {
    ok: true,
    uploadedEvents: up.uploadedEvents,
    uploadedReceipts: up.uploadedReceipts,
    appliedEvents: down.appliedEvents,
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
  return { ok: true, file: backups[0] };
}

export async function downloadBackupFromOneDrive(relPath) {
  const root = await ensureOneDriveRoot({ preferAppFolder: true });
  if (!root.ok) return { ok: false, error: root.error };
  return getFileUnderRoot({
    rootMode: root.rootMode, rootFolderItemId: root.rootFolderItemId,
    relPath,
  });
}
