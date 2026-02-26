import ExcelJS from "exceljs";
import { saveAs } from "./saveAs.js";
import { getSettings, getDB } from "../db.js";

const TEMPLATE_URL = "/templates/Formulario_Rendicion_Template.xlsx";

const MAP = {
  header: {
    nOperacion: "C1",
    nReq: "C3",
    responsableNombre: "D15",
    responsableRut: "L15",
    cargo: "D17",
    telefono: "L17",
    empresa: "D19",
    fecha: "L19",
    tipoCuenta: "C22",
    banco: "L22",
    numeroCuenta: "H22",
  },
  table1Rows: { start: 28, end: 41 },
  table2Rows: { start: 58, end: 85 },
  cols: {
    docTipo: "A",
    fecha: "B",
    docNumero: "C",
    detalle: "D", // merged D-G
    cr: "H",
    cuenta: "I",
    partida: "J", // merged J-K
    clasificacion: "L",
    monto: "M",
  }
};

const CAPACITY = (MAP.table1Rows.end - MAP.table1Rows.start + 1) + (MAP.table2Rows.end - MAP.table2Rows.start + 1);

function fmtDateISOToDDMMYYYY(iso) {
  try {
    const d = new Date(iso);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
  } catch {
    return "";
  }
}

async function fetchTemplateArrayBuffer() {
  const res = await fetch(TEMPLATE_URL);
  if (!res.ok) throw new Error("No se pudo cargar el template .xlsx (public/templates).");
  return res.arrayBuffer();
}

function getRowSlots() {
  const slots = [];
  for (let r = MAP.table1Rows.start; r <= MAP.table1Rows.end; r++) slots.push(r);
  for (let r = MAP.table2Rows.start; r <= MAP.table2Rows.end; r++) slots.push(r);
  return slots;
}

export function splitIntoBatches(items) {
  const batches = [];
  for (let i = 0; i < items.length; i += CAPACITY) {
    batches.push(items.slice(i, i + CAPACITY));
  }
  return batches;
}

/**
 * items: array of enriched expense rows:
 * { docTipo, fechaISO, docNumero, detalle, crCodigo, ctaCodigo, partidaCodigo, clasificacionCodigo, monto }
 */
export async function exportBatchXlsx({ correlativo, headerOverrides = {}, items }) {
  const buf = await fetchTemplateArrayBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.getWorksheet("Formulario") || wb.worksheets[0];

  const settings = await getSettings();
  const header = { ...settings, ...headerOverrides };

  // Header fill
  ws.getCell(MAP.header.nOperacion).value = header.nOperacion || correlativo || "";
  ws.getCell(MAP.header.nReq).value = header.nReq || "";
  ws.getCell(MAP.header.responsableNombre).value = header.responsableNombre || "";
  ws.getCell(MAP.header.responsableRut).value = header.responsableRut || "";
  ws.getCell(MAP.header.cargo).value = header.cargo || "";
  ws.getCell(MAP.header.telefono).value = header.telefono || "";
  ws.getCell(MAP.header.empresa).value = header.empresa || "";
  ws.getCell(MAP.header.fecha).value = header.fecha || fmtDateISOToDDMMYYYY(new Date().toISOString());
  ws.getCell(MAP.header.tipoCuenta).value = header.tipoCuenta || "";
  ws.getCell(MAP.header.banco).value = header.banco || "";
  ws.getCell(MAP.header.numeroCuenta).value = header.numeroCuenta || "";

  // Detail rows
  const slots = getRowSlots();
  items.forEach((it, idx) => {
    const r = slots[idx];
    ws.getCell(`${MAP.cols.docTipo}${r}`).value = it.docTipo || "";
    ws.getCell(`${MAP.cols.fecha}${r}`).value = fmtDateISOToDDMMYYYY(it.fechaISO) || "";
    ws.getCell(`${MAP.cols.docNumero}${r}`).value = it.docNumero || "";
    ws.getCell(`${MAP.cols.detalle}${r}`).value = it.detalle || "";
    ws.getCell(`${MAP.cols.cr}${r}`).value = it.crCodigo || "";
    ws.getCell(`${MAP.cols.cuenta}${r}`).value = it.ctaCodigo || "";
    ws.getCell(`${MAP.cols.partida}${r}`).value = it.partidaCodigo || "";
    ws.getCell(`${MAP.cols.clasificacion}${r}`).value = it.clasificacionCodigo || "";
    ws.getCell(`${MAP.cols.monto}${r}`).value = Number(it.monto || 0);
  });

  const out = await wb.xlsx.writeBuffer();
  const blob = new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const fname = `Rendicion_${correlativo}.xlsx`;
  saveAs(blob, fname);
  return fname;
}

// Enrich expense ids into export rows
export async function buildExportItems(gastoIds) {
  const db = await getDB();
  const [expenses, concepts] = await Promise.all([
    Promise.all(gastoIds.map(id => db.get("expenses", id))),
    db.getAll("concepts"),
  ]);
  const conceptById = new Map(concepts.map(c => [c.conceptId, c]));
  return expenses.filter(Boolean).map(e => {
    const c = conceptById.get(e.conceptId);
    const conceptName = c?.nombre || "Gasto";
    const detail = e.detalle?.trim() || `${conceptName}`;
    return {
      docTipo: e.docTipo,
      fechaISO: e.fecha,
      docNumero: e.docNumero || "",
      detalle: detail,
      crCodigo: e.crCodigo,
      ctaCodigo: e.ctaCodigo,
      partidaCodigo: e.partidaCodigo || "",
      clasificacionCodigo: e.clasificacionCodigo || "",
      monto: e.monto
    };
  });
}