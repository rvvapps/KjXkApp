import { openDB } from "idb";
import { v4 as uuid } from "uuid";

const DB_NAME = "pettycash_db";
const DB_VERSION = 2;

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
  await db.put("settings", { ...cur, ...patch, key: "app" });
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
  await db.put("expenses", expense);
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
  const tx = db.transaction("expenses", "readwrite");
  for (const id of gastoIds) {
    const e = await tx.store.get(id);
    if (!e) continue;
    e.estado = "rendido";
    e.rendicionId = rendicionId;
    e.updatedAt = new Date().toISOString();
    await tx.store.put(e);
  }
  await tx.done;
}

export async function addAttachment({ gastoId, filename, mimeType, blob }) {
  const db = await getDB();
  const adjuntoId = uuid();
  await db.put("attachments", { adjuntoId, gastoId, filename, mimeType, blob, createdAt: new Date().toISOString() });
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
  await db.put("reimbursements", {
    rendicionId,
    correlativo,
    fechaCreacion: new Date().toISOString(),
    estado: "borrador",
    total: 0,
  });
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
  expense.updatedAt = new Date().toISOString();
  await db.put("expenses", expense);
}

export async function deleteAttachment(adjuntoId) {
  const db = await getDB();
  await db.delete("attachments", adjuntoId);
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
  await db.put("transfers", transfer);
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
  const tx = db.transaction("transfers", "readwrite");
  for (const id of transferIds) {
    const t = await tx.store.get(id);
    if (!t) continue;
    t.estado = "usado";
    t.gastoId = gastoId;
    t.updatedAt = new Date().toISOString();
    await tx.store.put(t);
  }
  await tx.done;
}
