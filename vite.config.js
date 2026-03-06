import { getDB, getSettings, saveSettings } from "../db.js";
import { ensureOneDriveRoot, putFileUnderRoot } from "./onedriveApi.js";

function nowIso() {
  return new Date().toISOString();
}

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
    ...e,
    status: "failed",
    retryCount: (e.retryCount || 0) + 1,
    lastError: String(err || "upload_failed"),
  });
}

async function listPendingObjects(db) {
  const all = await db.getAll("sync_objects");
  return all.filter((o) => o.objectType === "receipt" && !o.uploadedAt);
}

async function findReceiptBlobByHash(db, contentHash) {
  // Scan attachments; early stop when found.
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

export async function syncOnce() {
  const db = await getDB();
  const settings = await getSettings();

  // Ensure OneDrive root
  const root = await ensureOneDriveRoot({ preferAppFolder: true });
  if (!root.ok) {
    return { ok: false, step: "ensureRoot", ...root };
  }

  // Upload pending receipt objects first
  const pendingObjects = await listPendingObjects(db);
  for (const obj of pendingObjects) {
    try {
      const blob = await findReceiptBlobByHash(db, obj.contentHash);
      if (!blob) {
        // No local blob; cannot upload. Keep pending.
        continue;
      }
      const ext = obj.mimeType === "image/webp" ? "webp" : "jpg";
      const relPath = `objects/receipts/${obj.contentHash}.${ext}`;
      const put = await putFileUnderRoot({
        rootMode: root.rootMode,
        rootFolderItemId: root.rootFolderItemId,
        relPath,
        contentType: obj.mimeType || "application/octet-stream",
        data: blob,
      });
      if (!put.ok) {
        // If upload failed, stop early to avoid burning battery/network.
        return { ok: false, step: "uploadReceipt", error: put.error, detail: put.detail };
      }
      await markObjectUploaded(db, obj.contentHash);
    } catch (err) {
      return { ok: false, step: "uploadReceipt", error: "exception", detail: String(err) };
    }
  }

  // Upload pending outbox events
  const pendingEvents = await listPendingOutbox(db);
  for (const ev of pendingEvents) {
    try {
      const relPath = `sync/outbox/${settings.deviceId}/${ev.eventId}.json`;
      const put = await putFileUnderRoot({
        rootMode: root.rootMode,
        rootFolderItemId: root.rootFolderItemId,
        relPath,
        contentType: "application/json",
        data: new Blob([JSON.stringify(ev)], { type: "application/json" }),
      });
      if (!put.ok) {
        await bumpOutboxFailure(db, ev.eventId, put.error);
        return { ok: false, step: "uploadEvent", error: put.error, detail: put.detail };
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
