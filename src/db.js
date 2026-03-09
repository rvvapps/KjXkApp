import { openDB } from "idb";
import { v4 as uuid } from "uuid";

const DB_NAME = "pettycash_db";
// DB_VERSION bump: v3 adds sync stores (outbox/state/objects) without changing existing business stores.
// DB_VERSION bump: v4 adds catalog_clasificaciones (non-breaking, additive).
// DB_VERSION bump: v5 adds catalog_destinations (destinos favoritos combustible).
// DB_VERSION bump: v6 adds sync_inbox (tracks incoming events from other devices).
const DB_VERSION = 6;

// Sync
const WORKSPACE_ID = "personal";

function nowIso() {
  return new Date().toISOString();
}

// Dispara evento global para que App.jsx haga sync en background
export function notifyDataChanged() {
  try { window.dispatchEvent(new Event("cc:dataChanged")); } catch {}
}

export const DOC_TYPES = ["Boleta", "Factura", "Voucher", "SinDoc"];

let _db = null;

export async function getDB() {
  if (_db) return _db;
  _db = await openDB(DB_NAME, DB_VERSION, {
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
      // v4: catálogo de clasificaciones (código + nombre, igual que CR/cuentas/partidas)
      if (!db.objectStoreNames.contains("catalog_clasificaciones")) {
        const s = db.createObjectStore("catalog_clasificaciones", { keyPath: "clasificacionCodigo" });
        s.createIndex("activo", "activo");
      }
      // v5: destinos favoritos de combustible
      if (!db.objectStoreNames.contains("catalog_destinations")) {
        const s = db.createObjectStore("catalog_destinations", { keyPath: "destinationId" });
        s.createIndex("activo", "activo");
        s.createIndex("crCodigo", "crCodigo");
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
      if (!db.objectStoreNames.contains("sync_inbox")) {
        const s = db.createObjectStore("sync_inbox", { keyPath: "eventId" });
        s.createIndex("processedAt", "processedAt");
        s.createIndex("fromDevice", "fromDevice");
      }
    },
  });
  return _db;
}

export function closeDB() {
  if (_db) { _db.close(); _db = null; }
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
      defaultOrigen: "",   // punto de partida habitual (casa/oficina)
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
    if (s.defaultOrigen === undefined) patch.defaultOrigen = "";
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

  // Seed clasificaciones si está vacío
  const anyClasif = await db.getAll("catalog_clasificaciones");
  if (anyClasif.length === 0) {
    await db.put("catalog_clasificaciones", { clasificacionCodigo: "01", clasificacionNombre: "Nacional", activo: true });
    await db.put("catalog_clasificaciones", { clasificacionCodigo: "02", clasificacionNombre: "Internacional", activo: true });
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
  // Si el código cambió, borrar el registro viejo primero
  if (item._originalCode && item._originalCode !== item.crCodigo) {
    await db.delete("catalog_cr", item._originalCode);
  }
  const { _originalCode, ...clean } = item;
  await db.put("catalog_cr", clean);
}

export async function deleteCR(crCodigo) {
  const db = await getDB();
  // Verificar si está en uso en gastos o transfers
  const enUso = await db.countFromIndex("expenses", "crCodigo", crCodigo)
    .catch(() => 0);
  if (enUso > 0) throw Object.assign(new Error(`CR en uso en ${enUso} gasto(s). Desactívalo en vez de eliminarlo.`), { code: "in_use", count: enUso });
  await db.delete("catalog_cr", crCodigo);
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
  if (item._originalCode && item._originalCode !== item.ctaCodigo) {
    await db.delete("catalog_accounts", item._originalCode);
  }
  const { _originalCode, ...clean } = item;
  await db.put("catalog_accounts", clean);
}

export async function deleteAccount(ctaCodigo) {
  const db = await getDB();
  const enUso = await db.countFromIndex("expenses", "ctaCodigo", ctaCodigo)
    .catch(() => 0);
  if (enUso > 0) throw Object.assign(new Error(`Cuenta en uso en ${enUso} gasto(s). Desactívala en vez de eliminarla.`), { code: "in_use", count: enUso });
  await db.delete("catalog_accounts", ctaCodigo);
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
  if (item._originalCode && item._originalCode !== item.partidaCodigo) {
    await db.delete("catalog_partidas", item._originalCode);
  }
  const { _originalCode, ...clean } = item;
  await db.put("catalog_partidas", clean);
}

export async function deletePartida(partidaCodigo) {
  const db = await getDB();
  await db.delete("catalog_partidas", partidaCodigo);
}

export async function listActiveClasificaciones() {
  const db = await getDB();
  const all = await db.getAll("catalog_clasificaciones");
  return all
    .filter((x) => x.activo !== false)
    .sort((a, b) => (a.clasificacionCodigo || "").localeCompare(b.clasificacionCodigo || ""));
}

export async function upsertClasificacion(item) {
  const db = await getDB();
  if (item._originalCode && item._originalCode !== item.clasificacionCodigo) {
    await db.delete("catalog_clasificaciones", item._originalCode);
  }
  const { _originalCode, ...clean } = item;
  await db.put("catalog_clasificaciones", clean);
}

export async function deleteClasificacion(clasificacionCodigo) {
  const db = await getDB();
  await db.delete("catalog_clasificaciones", clasificacionCodigo);
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
  notifyDataChanged();
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

  // iOS Safari: convertir Blob a ArrayBuffer ANTES de abrir la transacción
  // para evitar que operaciones asíncronas expiren la transacción IDB
  let storedBlob = blob;
  try {
    if (blob instanceof Blob) {
      const ab = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(blob);
      });
      storedBlob = new Blob([ab], { type: mimeType || blob.type });
    }
  } catch (e) {
    console.warn("addAttachment: blob conversion failed, storing as-is", e?.message);
  }

  const tx = db.transaction(["settings", "attachments", "sync_outbox", "sync_objects"], "readwrite");
  const { settings, revision } = await bumpRevisionInTx(tx);

  const rec = {
    adjuntoId,
    gastoId,
    filename,
    mimeType,
    contentHash,
    blob: storedBlob,
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

export async function getGastoIdsWithAttachments() {
  const db = await getDB();
  const all = await db.getAllFromIndex("attachments", "gastoId");
  return new Set(all.map((a) => a.gastoId));
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
  const reim = await db.get("reimbursements", rendicionId);
  if (!reim) throw new Error("Rendición no encontrada.");
  if (reim.estado !== "borrador" && reim.estado !== "devuelta") {
    throw Object.assign(
      new Error(`No se puede cancelar una rendición en estado "${reim.estado}".`),
      { code: "invalid_state" }
    );
  }

  const tx = db.transaction(["reimbursements", "reimbursement_items", "expenses"], "readwrite");
  const items = await tx.objectStore("reimbursement_items").index("rendicionId").getAll(rendicionId);

  for (const it of items) {
    const e = await tx.objectStore("expenses").get(it.gastoId);
    if (!e) continue;
    e.estado = "pendiente";
    delete e.rendicionId;
    e.updatedAt = new Date().toISOString();
    await tx.objectStore("expenses").put(e);
  }
  for (const it of items) {
    await tx.objectStore("reimbursement_items").delete(it.itemId);
  }
  await tx.objectStore("reimbursements").delete(rendicionId);
  await tx.done;
}

/** Quita un gasto de una rendición devuelta — lo devuelve a pendiente sin borrarlo. */
export async function removeExpenseFromReimbursement({ rendicionId, gastoId }) {
  const db = await getDB();
  const reim = await db.get("reimbursements", rendicionId);
  if (!reim) throw new Error("Rendición no encontrada.");
  if (reim.estado !== "devuelta") {
    throw Object.assign(
      new Error("Solo se puede quitar gastos de una rendición devuelta."),
      { code: "invalid_state" }
    );
  }

  const tx = db.transaction(["reimbursements", "reimbursement_items", "expenses"], "readwrite");
  const items = await tx.objectStore("reimbursement_items").index("rendicionId").getAll(rendicionId);
  const item = items.find((it) => it.gastoId === gastoId);
  if (!item) { await tx.done; return; }

  // Devolver gasto a pendiente
  const e = await tx.objectStore("expenses").get(gastoId);
  if (e) {
    e.estado = "pendiente";
    delete e.rendicionId;
    e.updatedAt = new Date().toISOString();
    await tx.objectStore("expenses").put(e);
  }

  await tx.objectStore("reimbursement_items").delete(item.itemId);
  await tx.done;
}

/** Agrega un gasto pendiente a una rendición devuelta. */
export async function addExpenseToReimbursement({ rendicionId, gastoId }) {
  const db = await getDB();
  const reim = await db.get("reimbursements", rendicionId);
  if (!reim) throw new Error("Rendición no encontrada.");
  if (reim.estado !== "devuelta") {
    throw Object.assign(
      new Error("Solo se pueden agregar gastos a una rendición devuelta."),
      { code: "invalid_state" }
    );
  }
  const expense = await db.get("expenses", gastoId);
  if (!expense) throw new Error("Gasto no encontrado.");
  if (expense.estado !== "pendiente") {
    throw Object.assign(new Error("El gasto debe estar en estado pendiente."), { code: "invalid_state" });
  }

  const tx = db.transaction(["settings", "reimbursement_items", "expenses", "sync_outbox"], "readwrite");
  const { settings, revision } = await bumpRevisionInTx(tx);

  // Calcular próximo orden
  const existing = await tx.objectStore("reimbursement_items").index("rendicionId").getAll(rendicionId);
  const nextOrden = (existing.length ? Math.max(...existing.map((i) => i.orden ?? 0)) : 0) + 1;

  const itemId = uuid();
  const item = { itemId, rendicionId, gastoId, orden: nextOrden, createdAt: nowIso() };
  tx.objectStore("reimbursement_items").put(item);

  // Marcar gasto como rendido
  const enriched = withAuditFields({ ...expense, estado: "rendido", rendicionId },
    { deviceId: settings.deviceId, revision });
  tx.objectStore("expenses").put(enriched);
  enqueueEventInTx(tx, {
    settings, revision,
    type: "entity.upsert",
    payload: { entityType: "expense", entityId: gastoId, data: enriched },
  });

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
  notifyDataChanged();
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

export async function deleteExpense(gastoId) {
  const db = await getDB();

  const expense = await db.get("expenses", gastoId);
  if (!expense) throw Object.assign(new Error("not_found"), { code: "not_found" });

  // Permitir borrar si está pendiente, o si está rendido pero en una rendición devuelta
  if (expense.estado !== "pendiente") {
    if (expense.estado === "rendido" && expense.rendicionId) {
      const reim = await db.get("reimbursements", expense.rendicionId);
      if (reim?.estado !== "devuelta") {
        throw Object.assign(
          new Error(`No se puede eliminar: el gasto está en una rendición "${reim?.estado || "desconocida"}".`),
          { code: "not_deletable", estado: reim?.estado }
        );
      }
      // Si la rendición está devuelta, primero quitar el item de la rendición
      const items = await db.getAllFromIndex("reimbursement_items", "rendicionId", expense.rendicionId);
      const item = items.find((it) => it.gastoId === gastoId);
      if (item) await db.delete("reimbursement_items", item.itemId);
    } else {
      throw Object.assign(
        new Error(`Solo se pueden eliminar gastos pendientes o devueltos. Estado actual: "${expense.estado}".`),
        { code: "not_deletable", estado: expense.estado }
      );
    }
  }

  // Obtener adjuntos para borrarlos en la misma tx
  const atts = await db.getAllFromIndex("attachments", "gastoId", gastoId);

  const tx = db.transaction(
    ["settings", "expenses", "attachments", "sync_outbox"],
    "readwrite"
  );
  const { settings, revision } = await bumpRevisionInTx(tx);

  // Borrar adjuntos
  for (const att of atts) {
    tx.objectStore("attachments").delete(att.adjuntoId);
    enqueueEventInTx(tx, {
      settings,
      revision,
      type: "entity.delete",
      payload: { entityType: "attachmentMeta", entityId: att.adjuntoId, deletedAt: nowIso() },
    });
  }

  // Borrar gasto
  tx.objectStore("expenses").delete(gastoId);
  enqueueEventInTx(tx, {
    settings,
    revision,
    type: "entity.delete",
    payload: { entityType: "expense", entityId: gastoId, deletedAt: nowIso() },
  });

  await tx.done;
  notifyDataChanged();
}

export async function listActiveDestinations() {
  const db = await getDB();
  const all = await db.getAll("catalog_destinations");
  return all
    .filter((x) => x.activo !== false)
    .sort((a, b) => (a.destino || "").localeCompare(b.destino || ""));
}

export async function upsertDestination(item) {
  const db = await getDB();
  if (!item.destinationId) {
    const { v4 } = await import("uuid");
    item.destinationId = v4();
  }
  await db.put("catalog_destinations", item);
}

export async function deleteDestination(destinationId) {
  const db = await getDB();
  await db.delete("catalog_destinations", destinationId);
}

/**
 * Liquidar combustible:
 * Agrupa N trayectos pendientes → 1 gasto de combustible completo.
 * montoFinal puede ser distinto a la suma (ajuste manual en la bomba).
 */
export async function liquidarCombustible({ transferIds, conceptId, crCodigo, montoFinal, docTipo = "Boleta" }) {
  const db = await getDB();

  const transfers = (await Promise.all(transferIds.map((id) => db.get("transfers", id)))).filter(Boolean);
  if (!transfers.length) throw new Error("No se encontraron traslados.");

  const concept = conceptId ? await db.get("concepts", conceptId) : null;
  const fecha = new Date().toISOString();

  const lines = transfers
    .slice()
    .sort((a, b) => (a.fecha || "").localeCompare(b.fecha || ""))
    .map((t) => {
      const montoTrayecto = Number(t.monto || 0);
      const fechaStr = new Date(t.fecha).toLocaleDateString("es-CL");
      return `• ${fechaStr} — ${t.destino}${montoTrayecto ? ` ($${montoTrayecto.toLocaleString("es-CL")})` : ""}`;
    })
    .join("\n");

  const sumaTramos = transfers.reduce((s, t) => s + Number(t.monto || 0), 0);
  const monto = Number.isFinite(Number(montoFinal)) && montoFinal > 0
    ? Number(montoFinal)
    : sumaTramos;

  const tx = db.transaction(
    ["settings", "expenses", "transfers", "sync_outbox"],
    "readwrite"
  );
  const { settings, revision } = await bumpRevisionInTx(tx);
  const gastoId = uuid();

  const expense = withAuditFields({
    gastoId,
    estado: "pendiente",
    fecha,
    monto,
    conceptId: conceptId || "",
    crCodigo: crCodigo || "",
    ctaCodigo: concept?.ctaDefaultCodigo || "",
    partidaCodigo: concept?.partidaDefaultCodigo || "",
    clasificacionCodigo: concept?.clasificacionDefaultCodigo || "",
    docTipo,
    docNumero: "",
    detalle: `Combustible — ${transfers.length} trayecto${transfers.length > 1 ? "s" : ""}:\n${lines}\nSuma tramos: $${sumaTramos.toLocaleString("es-CL")} | Monto final: $${monto.toLocaleString("es-CL")}`,
    fromTransferIds: transferIds,
  }, { deviceId: settings.deviceId, revision });

  tx.objectStore("expenses").put(expense);
  enqueueEventInTx(tx, {
    settings, revision,
    type: "entity.upsert",
    payload: { entityType: "expense", entityId: gastoId, data: expense },
  });

  // Marcar traslados como usados
  for (const t of transfers) {
    const updated = withAuditFields({ ...t, estado: "usado", gastoId },
      { deviceId: settings.deviceId, revision });
    tx.objectStore("transfers").put(updated);
    enqueueEventInTx(tx, {
      settings, revision,
      type: "entity.upsert",
      payload: { entityType: "transfer", entityId: t.transferId, data: updated },
    });
  }

  await tx.done;
  return { gastoId, monto };
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
  notifyDataChanged();
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



/**
 * Crea N gastos pendientes (incompletos) desde un conjunto de traslados + conceptos.
 * Cada concepto genera 1 gasto con los datos del traslado pre-completados.
 * Los traslados quedan marcados como "usado".
 * Los gastos nacen con monto=0 para identificarlos como incompletos.
 */
export async function addExpensesFromTransfer({ transferIds, conceptIds }) {
  const db = await getDB();

  // Leer traslados y conceptos antes de abrir la tx
  const transfers = (await Promise.all(transferIds.map((id) => db.get("transfers", id)))).filter(Boolean);
  const concepts = (await Promise.all(conceptIds.map((id) => db.get("concepts", id)))).filter(Boolean);

  if (!transfers.length) throw new Error("No se encontraron traslados.");
  if (!concepts.length) throw new Error("Selecciona al menos un concepto.");

  const primaryTransfer = transfers[0];
  const crCodigo = primaryTransfer.crCodigo || "";
  const visita = primaryTransfer.visita || "";
  const fecha = primaryTransfer.fecha || new Date().toISOString();

  const lines = transfers
    .slice()
    .sort((a, b) => (a.fecha || "").localeCompare(b.fecha || ""))
    .map((t) => `• ${new Date(t.fecha).toLocaleDateString("es-CL")} — ${t.tipo}: ${t.origen} → ${t.destino}`)
    .join("\n");

  const tx = db.transaction(
    ["settings", "expenses", "transfers", "sync_outbox"],
    "readwrite"
  );
  const { settings, revision } = await bumpRevisionInTx(tx);

  const createdGastoIds = [];

  // Crear 1 gasto por concepto
  for (const concept of concepts) {
    const gastoId = uuid();
    const expense = withAuditFields({
      gastoId,
      estado: "pendiente",
      fecha,
      monto: 0, // incompleto — el usuario debe completarlo
      conceptId: concept.conceptId,
      crCodigo,
      ctaCodigo: concept.ctaDefaultCodigo || "",
      partidaCodigo: concept.partidaDefaultCodigo || "",
      clasificacionCodigo: concept.clasificacionDefaultCodigo || "",
      docTipo: "Boleta",
      docNumero: "",
      detalle: `Visita: ${visita}\n${lines}`,
      fromTransferId: transferIds[0], // trazabilidad
      fromTransferIds: transferIds,   // todos los traslados origen
    }, { deviceId: settings.deviceId, revision });

    tx.objectStore("expenses").put(expense);
    enqueueEventInTx(tx, {
      settings,
      revision,
      type: "entity.upsert",
      payload: { entityType: "expense", entityId: gastoId, data: expense },
    });
    createdGastoIds.push(gastoId);
  }

  // Marcar traslados como usados
  for (const t of transfers) {
    const updated = withAuditFields({
      ...t,
      estado: "usado",
      gastoId: createdGastoIds[0], // referencia al primer gasto creado
    }, { deviceId: settings.deviceId, revision });
    tx.objectStore("transfers").put(updated);
    enqueueEventInTx(tx, {
      settings,
      revision,
      type: "entity.upsert",
      payload: { entityType: "transfer", entityId: t.transferId, data: updated },
    });
  }

  await tx.done;
  return { createdGastoIds };
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
export async function updateReimbursementTotal({ rendicionId, total }) {
  const db = await getDB();
  const r = await db.get("reimbursements", rendicionId);
  if (!r) return;
  r.total = Number(total) || 0;
  r.updatedAt = new Date().toISOString();
  await db.put("reimbursements", r);
}

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

export async function markReimbursementPagada({ rendicionId }) {
  const db = await getDB();
  const r = await db.get("reimbursements", rendicionId);
  if (!r) throw new Error("Rendición no encontrada.");
  if (r.estado !== "aprobada") throw Object.assign(
    new Error(`Solo se puede marcar como pagada una rendición aprobada (estado actual: "${r.estado}").`),
    { code: "invalid_state" }
  );
  r.estado = "pagada";
  r.pagadaAt = new Date().toISOString();
  r.updatedAt = new Date().toISOString();
  await db.put("reimbursements", r);
  return r;
}
