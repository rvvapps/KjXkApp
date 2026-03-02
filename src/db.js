import { openDB } from "idb";
import { v4 as uuid } from "uuid";

const DB_NAME = "pettycash_db";
// DB_VERSION bump: v3 adds sync stores (outbox/state/objects) without changing existing business stores.
const DB_VERSION = 3;

// Sync
const WORKSPACE_ID = "personal";

function nowIso() {
  return new Date().toISOString();
}

export const DOC_TYPES = ["Boleta", "Factura", "Voucher", "SinDoc"];

export async function getDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Catalogs
      if (!db.objectStoreNames.contains("catalog_cr")) {
        const s = db.createObjectStore("catalog_cr", { keyPath: "crCodigo" });
        s.createIndex("activo", "activo");
      }
      if (!db.objectStoreNames.contains("catalog_accounts")) {
        const s = db.createObjectStore("catalog_accounts", { keyPath: "ctaCodigo" });
        s.createIndex("activo", "activo");
      }
      if (!db.objectStoreNames.contains("catalog_partidas")) {
        const s = db.createObjectStore("catalog_partidas", { keyPath: "partidaCodigo" });
        s.createIndex("activo", "activo");
      }

      if (!db.objectStoreNames.contains("concepts")) {
        const s = db.createObjectStore("concepts", { keyPath: "conceptId" });
        s.createIndex("activo", "activo");
        s.createIndex("favorito", "favorito");
        s.createIndex("nombre", "nombre");
      }
      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings", { keyPath: "key" });
      }

      // Expenses + attachments
      if (!db.objectStoreNames.contains("expenses")) {
        const s = db.createObjectStore("expenses", { keyPath: "gastoId" });
        s.createIndex("estado", "estado");
        s.createIndex("fecha", "fecha");
        s.createIndex("crCodigo", "crCodigo");
        s.createIndex("ctaCodigo", "ctaCodigo");
        s.createIndex("conceptId", "conceptId");
      }
      if (!db.objectStoreNames.contains("attachments")) {
        const s = db.createObjectStore("attachments", { keyPath: "adjuntoId" });
        s.createIndex("gastoId", "gastoId");
        s.createIndex("createdAt", "createdAt");
      }

      // Reimbursements
      if (!db.objectStoreNames.contains("reimbursements")) {
        const s = db.createObjectStore("reimbursements", { keyPath: "rendicionId" });
        s.createIndex("fechaCreacion", "fechaCreacion");
        s.createIndex("estado", "estado");
        s.createIndex("correlativo", "correlativo");
      }
      if (!db.objectStoreNames.contains("reimbursement_items")) {
        const s = db.createObjectStore("reimbursement_items", { keyPath: "itemId" });
        s.createIndex("rendicionId", "rendicionId");
        s.createIndex("gastoId", "gastoId");
      }
      // Transfers (Traslados)
      if (!db.objectStoreNames.contains("transfers")) {
        const s = db.createObjectStore("transfers", { keyPath: "transferId" });
        s.createIndex("estado", "estado");
        s.createIndex("fecha", "fecha");
        s.createIndex("crCodigo", "crCodigo");
        s.createIndex("visita", "visita");
      }

      // Sync stores (Phase 1)
      if (!db.objectStoreNames.contains("sync_outbox")) {
        const s = db.createObjectStore("sync_outbox", { keyPath: "eventId" });
        s.createIndex("status", "status");
        s.createIndex("revision", "revision");
        s.createIndex("ts", "ts");
      }
      if (!db.objectStoreNames.contains("sync_state")) {
        db.createObjectStore("sync_state", { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains("sync_objects")) {
        const s = db.createObjectStore("sync_objects", { keyPath: "contentHash" });
        s.createIndex("objectType", "objectType");
        s.createIndex("pendingUpload", "pendingUpload");
        s.createIndex("lastAccessedAt", "lastAccessedAt");
      }
    },
  });
}

export async function ensureSeedData() {
  const db = await getDB();

  // Settings defaults
  const s = await db.get("settings", "app");
  if (!s) {
    await db.put("settings", {
      key: "app",
      workspaceId: WORKSPACE_ID,
      deviceId: uuid(),
      deviceLabel: "",
      localRevision: 0,
      lastSyncAt: null,
      lastWeeklyBackupAt: null,
      responsableNombre: "",
      responsableRut: "",
      cargo: "",
      telefono: "",
      empresa: "",
      banco: "",
      tipoCuenta: "",
      numeroCuenta: "",
      crDefaultCodigo: "",
      correlativoPrefix: "RC",
      correlativoNextNumber: 1,
    });
  } else {
    // Backfill identity/sync fields for existing installs (no schema break).
    const patch = {};
    if (!s.workspaceId) patch.workspaceId = WORKSPACE_ID;
    if (!s.deviceId) patch.deviceId = uuid();
    if (s.deviceLabel === undefined) patch.deviceLabel = "";
    if (typeof s.localRevision !== "number") patch.localRevision = 0;
    if (s.lastSyncAt === undefined) patch.lastSyncAt = null;
    if (s.lastWeeklyBackupAt === undefined) patch.lastWeeklyBackupAt = null;
    if (Object.keys(patch).length) {
      await db.put("settings", { ...s, ...patch });
    }
  }

  // Ensure sync_state baseline
  const st = await db.get("sync_state", "main");
  if (!st) {
    await db.put("sync_state", {
      key: "main",
      rootMode: null, // 'approot' | 'folder'
      driveId: null,
      rootFolderItemId: null,
      lastCheckpoint: {},
    });
  }

  // Seed some sample catalog values if empty (optional)
  const anyCR = await db.getAll("catalog_cr");
  if (anyCR.length === 0) {
    await db.put("catalog_cr", { crCodigo: "0001", crNombre: "Gerencia Constructora", activo: true });
    await db.put("catalog_cr", { crCodigo: "0002", crNombre: "Calidad", activo: true });
  }
  const anyAcct = await db.getAll("catalog_accounts");
  if (anyAcct.length === 0) {
    await db.put("catalog_accounts", { ctaCodigo: "510100", ctaNombre: "Gastos de Viaje", activo: true });
    await db.put("catalog_accounts", { ctaCodigo: "510200", ctaNombre: "Combustibles", activo: true });
  }
  const anyPart = await db.getAll("catalog_partidas");
  if (anyPart.length === 0) {
    await db.put("catalog_partidas", { partidaCodigo: "01", partidaNombre: "Operación", activo: true });
    await db.put("catalog_partidas", { partidaCodigo: "02", partidaNombre: "Administración", activo: true });
  }

  // Seed a couple concepts if missing
  const concepts = await db.getAll("concepts");
  if (concepts.length === 0) {
    await db.put("concepts", {
      conceptId: uuid(),
      nombre: "Combustible",
      ctaDefaultCodigo: "510200",
      partidaDefaultCodigo: "01",
      clasificacionDefaultCodigo: "",
      requiereDoc: true,
      requiereRespaldo: true,
      favorito: true,
      activo: true,
    });
    await db.put("concepts", {
      conceptId: uuid(),
      nombre: "Estacionamiento",
      ctaDefaultCodigo: "510100",
      partidaDefaultCodigo: "01",
      clasificacionDefaultCodigo: "",
      requiereDoc: true,
      requiereRespaldo: true,
      favorito: true,
      activo: true,
    });
  }
}

export async function getSettings() {
  const db = await getDB();
  return db.get("settings", "app");
}

export async function saveSettings(patch) {
  const db = await getDB();
  const cur = await getSettings();
  const next = { ...cur, ...patch, key: "app" };
  await db.put("settings", next);
}

// -------------------------
// Sync state helpers
// -------------------------

export async function getSyncState() {
  const db = await getDB();
  return db.get("sync_state", "main");
}

export async function saveSyncState(patch) {
  const db = await getDB();
  const cur = await getSyncState();
  const next = { ...(cur || { key: "main" }), ...patch, key: "main" };
  await db.put("sync_state", next);
  return next;
}

// -------------------------
// Sync helpers (Phase 1)
// -------------------------

async function enqueueEvent(db, { type, payload }) {
  const tx = db.transaction(["settings", "sync_outbox"], "readwrite");
  const s = await tx.objectStore("settings").get("app");
  const nextRev = (s?.localRevision || 0) + 1;
  const event = {
    eventId: uuid(),
    workspaceId: s?.workspaceId || WORKSPACE_ID,
    deviceId: s?.deviceId || "",
    revision: nextRev,
    ts: nowIso(),
    type,
    payload,
    status: "pending",
    retryCount: 0,
    lastError: null,
  };
  await tx.objectStore("settings").put({ ...s, localRevision: nextRev });
  await tx.objectStore("sync_outbox").put(event);
  await tx.done;
  return event;
}

async function bumpRevisionInTx(tx) {
  const sStore = tx.objectStore("settings");
  const s = await sStore.get("app");
  const nextRev = (s?.localRevision || 0) + 1;
  await sStore.put({ ...s, localRevision: nextRev });
  return { settings: s, revision: nextRev };
}

async function enqueueEventInTx(tx, { settings, revision, type, payload }) {
  const event = {
    eventId: uuid(),
    workspaceId: settings?.workspaceId || WORKSPACE_ID,
    deviceId: settings?.deviceId || "",
    revision,
    ts: nowIso(),
    type,
    payload,
    status: "pending",
    retryCount: 0,
    lastError: null,
  };
  await tx.objectStore("sync_outbox").put(event);
  return event;
}

async function getIdentity(db) {
  const s = await db.get("settings", "app");
  return {
    workspaceId: s?.workspaceId || WORKSPACE_ID,
    deviceId: s?.deviceId || "",
  };
}

function withAuditFields(entity, { deviceId, revision }) {
  const ts = nowIso();
  const createdAt = entity.createdAt || ts;
  return {
    ...entity,
    createdAt,
    updatedAt: ts,
    updatedByDeviceId: deviceId,
    updatedByRevision: revision,
  };
}

export async function listPendingOutboxEvents(limit = 50) {
  const db = await getDB();
  const idx = db.transaction("sync_outbox").store.index("status");
  const all = await idx.getAll("pending");
  return all.sort((a, b) => (a.revision || 0) - (b.revision || 0)).slice(0, limit);
}

export async function markOutboxEventUploaded(eventId) {
  const db = await getDB();
  const ev = await db.get("sync_outbox", eventId);
  if (!ev) return;
  await db.put("sync_outbox", { ...ev, status: "uploaded", uploadedAt: nowIso() });
}

export async function markOutboxEventFailed(eventId, errorMessage) {
  const db = await getDB();
  const ev = await db.get("sync_outbox", eventId);
  if (!ev) return;
  await db.put("sync_outbox", {
    ...ev,
    status: "pending",
    retryCount: (ev.retryCount || 0) + 1,
    lastError: String(errorMessage || "unknown error"),
    lastTriedAt: nowIso(),
  });
}

export async function setLastSyncAt(tsIso) {
  const db = await getDB();
  const s = await getSettings();
  await db.put("settings", { ...s, lastSyncAt: tsIso, key: "app" });
}

/**
 * ✅ IMPORTANTÍSIMO:
 * NO usamos getAllFromIndex con claves booleanas (true/false),
 * porque IndexedDB no acepta boolean como key en un índice -> DataError.
 * Entonces: getAll() + filtrado en JS.
 */
export async function listActiveCR() {
  const db = await getDB();
  const all = await db.getAll("catalog_cr");
  return all
    .filter((x) => x.activo !== false)
    .sort((a, b) => (a.crCodigo || "").localeCompare(b.crCodigo || ""));
}

export async function upsertCR(item) {
  const db = await getDB();
  await db.put("catalog_cr", item);
}

export async function listActiveAccounts() {
  const db = await getDB();
  const all = await db.getAll("catalog_accounts");
  return all
    .filter((x) => x.activo !== false)
    .sort((a, b) => (a.ctaCodigo || "").localeCompare(b.ctaCodigo || ""));
}

export async function upsertAccount(item) {
  const db = await getDB();
  await db.put("catalog_accounts", item);
}

export async function listActivePartidas() {
  const db = await getDB();
  const all = await db.getAll("catalog_partidas");
  return all
    .filter((x) => x.activo !== false)
    .sort((a, b) => (a.partidaCodigo || "").localeCompare(b.partidaCodigo || ""));
}

export async function upsertPartida(item) {
  const db = await getDB();
  await db.put("catalog_partidas", item);
}

export async function listConcepts() {
  const db = await getDB();
  const all = await db.getAll("concepts");
  const active = all.filter((c) => c.activo !== false);

  active.sort((a, b) => {
    const fav = (b.favorito === true) - (a.favorito === true);
    if (fav !== 0) return fav;
    return (a.nombre || "").localeCompare(b.nombre || "");
  });

  return active;
}

export async function addExpense(expense) {
  const db = await getDB();
  const tx = db.transaction(["settings", "expenses", "sync_outbox"], "readwrite");
  const { settings, revision } = await bumpRevisionInTx(tx);
  const enriched = withAuditFields(expense, { deviceId: settings.deviceId, revision });
  await tx.objectStore("expenses").put(enriched);
  await enqueueEventInTx(tx, {
    settings,
    revision,
    type: "entity.upsert",
    payload: { entityType: "expense", entityId: enriched.gastoId, data: enriched },
  });
  await tx.done;
}

export async function listPendingExpenses() {
  const db = await getDB();
  return db.getAllFromIndex("expenses", "estado", "pendiente");
}
export async function countExpensesByConceptId(conceptId) {
  const db = await getDB();

  // Usamos el índice conceptId (ya existe en tu upgrade)
  const tx = db.transaction("expenses", "readonly");
  const idx = tx.store.index("conceptId");

  // MVP: getAll y contamos (suficiente para tu volumen actual)
  const items = await idx.getAll(conceptId);
  await tx.done;

  return items.length;
}

export async function markExpensesReimbursed({ gastoIds, rendicionId }) {
  const db = await getDB();
  const tx = db.transaction(["settings", "expenses", "sync_outbox"], "readwrite");
  const { settings, revision } = await bumpRevisionInTx(tx);
  for (const id of gastoIds) {
    const e = await tx.objectStore("expenses").get(id);
    if (!e) continue;
    e.estado = "rendido";
    e.rendicionId = rendicionId;
    const enriched = withAuditFields(e, { deviceId: settings.deviceId, revision });
    await tx.objectStore("expenses").put(enriched);
    await enqueueEventInTx(tx, {
      settings,
      revision,
      type: "entity.upsert",
      payload: { entityType: "expense", entityId: enriched.gastoId, data: enriched },
    });
  }
  await tx.done;
}

export async function addAttachment({ gastoId, filename, mimeType, blob, width = null, height = null, contentHash = null }) {
  const db = await getDB();
  const adjuntoId = uuid();
  const tx = db.transaction(["settings", "attachments", "sync_outbox", "sync_objects"], "readwrite");
  const { settings, revision } = await bumpRevisionInTx(tx);
  const rec = {
    adjuntoId,
    gastoId,
    filename,
    mimeType,
    contentHash,
    blob,
    sizeBytes: blob?.size ?? null,
    width,
    height,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    updatedByDeviceId: settings.deviceId,
    updatedByRevision: revision,
    lastAccessedAt: nowIso(),
  };
  await tx.objectStore("attachments").put(rec);

  if (contentHash) {
    await tx.objectStore("sync_objects").put({
      contentHash,
      objectType: "receipt",
      mimeType,
      sizeBytes: blob?.size ?? null,
      localBlobPresent: true,
      uploadedAt: null,
      remotePath: `objects/receipts/${contentHash}.${mimeType === "image/webp" ? "webp" : "jpg"}`,
      lastAccessedAt: nowIso(),
      pinned: false,
    });
  }
  // Minimalist events: sync metadata via entity.upsert.
  // Binary sync: if we have a contentHash, also enqueue object.ensure.
  if (contentHash) {
    await enqueueEventInTx(tx, {
      settings,
      revision,
      type: "object.ensure",
      payload: {
        objectType: "receipt",
        contentHash,
        mimeType,
        sizeBytes: blob?.size ?? null,
        remotePath: `objects/receipts/${contentHash}.${mimeType === "image/webp" ? "webp" : "jpg"}`,
        refs: [{ entityType: "expense", entityId: gastoId }],
      },
    });
  }
  const meta = { ...rec };
  delete meta.blob;
  await enqueueEventInTx(tx, {
    settings,
    revision,
    type: "entity.upsert",
    payload: { entityType: "attachmentMeta", entityId: adjuntoId, data: meta },
  });
  await tx.done;
  return adjuntoId;
}

export async function listAttachmentsForExpense(gastoId) {
  const db = await getDB();
  const idx = db.transaction("attachments").store.index("gastoId");
  return idx.getAll(gastoId);
}

export async function createReimbursement({ correlativo }) {
  const db = await getDB();
  const rendicionId = uuid();
  const tx = db.transaction(["settings", "reimbursements", "sync_outbox"], "readwrite");
  const { settings, revision } = await bumpRevisionInTx(tx);
  const base = {
    rendicionId,
    correlativo,
    fechaCreacion: nowIso(),
    estado: "borrador",
    total: 0,
    // Phase-1 fields for future states (nullable)
    approvedAt: null,
    paidAt: null,
    rejectionReason: null,
    cancelledAt: null,
  };
  const enriched = withAuditFields(base, { deviceId: settings.deviceId, revision });
  await tx.objectStore("reimbursements").put(enriched);
  await enqueueEventInTx(tx, {
    settings,
    revision,
    type: "entity.upsert",
    payload: { entityType: "reimbursement", entityId: rendicionId, data: enriched },
  });
  await tx.done;
  return rendicionId;
}

export async function addReimbursementItems({ rendicionId, gastoIds }) {
  const db = await getDB();
  const tx = db.transaction(["reimbursement_items"], "readwrite");
  let order = 1;
  for (const gastoId of gastoIds) {
    await tx.objectStore("reimbursement_items").put({ itemId: uuid(), rendicionId, gastoId, orden: order++ });
  }
  await tx.done;
}

export async function listReimbursements() {
  const db = await getDB();
  const all = await db.getAll("reimbursements");
  all.sort((a, b) => (b.fechaCreacion || "").localeCompare(a.fechaCreacion || ""));
  return all;
}

export async function getReimbursement(rendicionId) {
  const db = await getDB();
  return await db.get("reimbursements", rendicionId);
}

export async function listReimbursementItems(rendicionId) {
  const db = await getDB();
  const items = await db.getAllFromIndex("reimbursement_items", "rendicionId", rendicionId);
  items.sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
  return items;
}

export async function setReimbursementEstado({ rendicionId, estado }) {
  const db = await getDB();
  const tx = db.transaction(["settings", "reimbursements", "sync_outbox"], "readwrite");
  const { settings, revision } = await bumpRevisionInTx(tx);
  const r = await tx.objectStore("reimbursements").get(rendicionId);
  if (!r) {
    await tx.done;
    return;
  }
  r.estado = estado;
  const enriched = withAuditFields(r, { deviceId: settings.deviceId, revision });
  await tx.objectStore("reimbursements").put(enriched);
  await enqueueEventInTx(tx, {
    settings,
    revision,
    type: "entity.upsert",
    payload: { entityType: "reimbursement", entityId: rendicionId, data: enriched },
  });
  await tx.done;
}

/**
 * Cancela un borrador:
 * - Borra items y la rendición
 * - Devuelve gastos a estado "pendiente" (quitando rendicionId)
 * NOTA: esto es útil como "salida" cuando hubo errores o se quiere rehacer.
 */
export async function cancelReimbursement({ rendicionId }) {
  const db = await getDB();
  const tx = db.transaction(["reimbursements", "reimbursement_items", "expenses"], "readwrite");

  const items = await tx.objectStore("reimbursement_items").index("rendicionId").getAll(rendicionId);
  const gastoIds = items.map((it) => it.gastoId).filter(Boolean);

  // Devuelve gastos
  for (const gastoId of gastoIds) {
    const e = await tx.objectStore("expenses").get(gastoId);
    if (!e) continue;
    e.estado = "pendiente";
    delete e.rendicionId;
    e.updatedAt = new Date().toISOString();
    await tx.objectStore("expenses").put(e);
  }

  // Borra items
  for (const it of items) {
    await tx.objectStore("reimbursement_items").delete(it.itemId);
  }

  // Borra rendición
  await tx.objectStore("reimbursements").delete(rendicionId);

  await tx.done;
}

export async function upsertConcept(concept) {
  const db = await getDB();
  await db.put("concepts", concept);
}

export async function getConcept(conceptId) {
  const db = await getDB();
  return db.get("concepts", conceptId);
}

export async function deactivateConcept(conceptId) {
  const db = await getDB();
  const c = await db.get("concepts", conceptId);
  if (!c) return;
  c.activo = false;
  await db.put("concepts", c);
}

export async function activateConcept(conceptId) {
  const db = await getDB();
  const c = await db.get("concepts", conceptId);
  if (!c) return;
  c.activo = true;
  await db.put("concepts", c);
}

export async function listAllConcepts() {
  const db = await getDB();
  const all = await db.getAll("concepts");
  all.sort((a, b) => {
    const fav = (b.favorito === true) - (a.favorito === true);
    if (fav !== 0) return fav;
    return (a.nombre || "").localeCompare(b.nombre || "");
  });
  return all;
}

export async function getExpense(gastoId) {
  const db = await getDB();
  return db.get("expenses", gastoId);
}

export async function updateExpense(expense) {
  const db = await getDB();
  const tx = db.transaction(["settings", "expenses", "sync_outbox"], "readwrite");
  const { settings, revision } = await bumpRevisionInTx(tx);
  const enriched = withAuditFields(expense, { deviceId: settings.deviceId, revision });
  await tx.objectStore("expenses").put(enriched);
  await enqueueEventInTx(tx, {
    settings,
    revision,
    type: "entity.upsert",
    payload: { entityType: "expense", entityId: enriched.gastoId, data: enriched },
  });
  await tx.done;
}

export async function deleteAttachment(adjuntoId) {
  const db = await getDB();
  const tx = db.transaction(["settings", "attachments", "sync_outbox"], "readwrite");
  const { settings, revision } = await bumpRevisionInTx(tx);
  await tx.objectStore("attachments").delete(adjuntoId);
  await enqueueEventInTx(tx, {
    settings,
    revision,
    type: "entity.delete",
    payload: { entityType: "attachmentMeta", entityId: adjuntoId, deletedAt: nowIso() },
  });
  await tx.done;
}
export const TRANSFER_TYPES = [
  "Vehículo propio",
  "Auto arrendado",
  "Taxi / Uber",
  "Avión",
  "Bus",
  "Otro",
];

export async function addTransfer(transfer) {
  const db = await getDB();
  const tx = db.transaction(["settings", "transfers", "sync_outbox"], "readwrite");
  const { settings, revision } = await bumpRevisionInTx(tx);
  const enriched = withAuditFields(transfer, { deviceId: settings.deviceId, revision });
  await tx.objectStore("transfers").put(enriched);
  await enqueueEventInTx(tx, {
    settings,
    revision,
    type: "entity.upsert",
    payload: { entityType: "transfer", entityId: enriched.transferId, data: enriched },
  });
  await tx.done;
}

export async function listPendingTransfers() {
  const db = await getDB();
  // estado es string (válido como key), así que esto es seguro
  return db.getAllFromIndex("transfers", "estado", "pendiente");
}

export async function listTransfersByEstado(estado) {
  const db = await getDB();
  return db.getAllFromIndex("transfers", "estado", estado);
}

export async function markTransfersUsed({ transferIds, gastoId }) {
  const db = await getDB();
  const tx = db.transaction(["settings", "transfers", "sync_outbox"], "readwrite");
  const { settings, revision } = await bumpRevisionInTx(tx);
  for (const id of transferIds) {
    const t = await tx.objectStore("transfers").get(id);
    if (!t) continue;
    t.estado = "usado";
    t.gastoId = gastoId;
    const enriched = withAuditFields(t, { deviceId: settings.deviceId, revision });
    await tx.objectStore("transfers").put(enriched);
    await enqueueEventInTx(tx, {
      settings,
      revision,
      type: "entity.upsert",
      payload: { entityType: "transfer", entityId: enriched.transferId, data: enriched },
    });
  }
  await tx.done;
}


/** =========================
 *  Workflow de estados
 *  borrador -> enviada -> (devuelta | aprobada)
 *  Reglas:
 *   - enviada/aprobada: gastos quedan congelados (no editables)
 *   - devuelta: se permite editar y re-exportar
 *   - aprobada: cerrada (sin re-export)
 * ========================= */

export const REIM_ESTADOS = ["borrador", "enviada", "devuelta", "aprobada"];

export function isReimbursementLocked(estado) {
  return estado === "enviada" || estado === "aprobada";
}

export async function getReimbursementEstado(rendicionId) {
  const r = await getReimbursement(rendicionId);
  return r?.estado ?? null;
}

export async function isExpenseLockedByReimbursement(expense) {
  const rid = expense?.rendicionId;
  if (!rid) return false;
  const estado = await getReimbursementEstado(rid);
  return isReimbursementLocked(estado);
}

export async function sendReimbursement({ rendicionId }) {
  await setReimbursementEstado({ rendicionId, estado: "enviada" });
}

export async function returnReimbursement({ rendicionId, motivo = "" }) {
  const db = await getDB();
  const r = await db.get("reimbursements", rendicionId);
  if (!r) return;
  r.estado = "devuelta";
  r.motivoDevuelta = motivo || r.motivoDevuelta || "";
  r.updatedAt = new Date().toISOString();
  await db.put("reimbursements", r);
}

export async function approveReimbursement({ rendicionId }) {
  await setReimbursementEstado({ rendicionId, estado: "aprobada" });
}

/** Guarda un snapshot (Excel/PDF) en la rendición. */
export async function setReimbursementSnapshot({ rendicionId, excelBlob = null, pdfBlob = null, exportedAt = null }) {
  const db = await getDB();
  const r = await db.get("reimbursements", rendicionId);
  if (!r) throw new Error("Rendición no encontrada para snapshot");
  r.snapshotExcelBlob = excelBlob;
  r.snapshotPdfBlob = pdfBlob;
  r.snapshotExportedAt = exportedAt || new Date().toISOString();
  r.updatedAt = new Date().toISOString();
  await db.put("reimbursements", r);
  return r;
}
