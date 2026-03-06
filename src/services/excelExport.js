import ExcelJS from "exceljs";
import { getSettings, getDB } from "../db.js";
import { TEMPLATE_B64 } from "./excelTemplate.js";

const CAPACITY = 42;

export function splitIntoBatches(items) {
  const batches = [];
  for (let i = 0; i < items.length; i += CAPACITY) {
    batches.push(items.slice(i, i + CAPACITY));
  }
  return batches;
}

function fmtDateDDMMYYYY(d = new Date()) {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

// FIX: convierte cualquier fecha ISO/string al formato DD-MM-YYYY para mostrar en celda Excel
function toDisplayDate(s) {
  if (!s) return "";
  const str = String(s).trim();
  if (!str) return "";
  // Ya está en DD-MM-YYYY → devolver tal cual
  if (/^\d{2}-\d{2}-\d{4}$/.test(str)) return str;
  // ISO string (YYYY-MM-DDTHH:mm...) o YYYY-MM-DD
  const d = new Date(str);
  if (!isNaN(d.getTime())) return fmtDateDDMMYYYY(d);
  return str;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function codeName(code, name) {
  const c = (code ?? "").toString().trim();
  const n = (name ?? "").toString().trim();
  if (!c && !n) return "";
  if (c && n) return `${c} - ${n}`;
  return c || n;
}

function normDocTipo(t) {
  return String(t ?? "").trim().toLowerCase();
}

function parseDateFlexible(s) {
  const str = String(s ?? "").trim();
  if (!str) return null;
  const parts = str.split(/[\/\-\.]/).map((p) => p.trim());
  if (parts.length < 3) return null;

  if (parts[0].length === 4) {
    const [y, m, d] = parts;
    const dt = new Date(Number(y), Number(m) - 1, Number(d));
    return isNaN(dt.getTime()) ? null : dt;
  }

  if (parts[2].length === 4) {
    const [d, m, y] = parts;
    const dt = new Date(Number(y), Number(m) - 1, Number(d));
    return isNaN(dt.getTime()) ? null : dt;
  }

  // Fallback: intentar new Date() directamente (cubre ISO strings)
  const dt = new Date(str);
  return isNaN(dt.getTime()) ? null : dt;
}

function groupAndSortForExports(items) {
  const noFactura = [];
  const facturas = [];

  for (const it of items) {
    const tipo = normDocTipo(it.docTipo);
    if (tipo === "factura") facturas.push(it);
    else noFactura.push(it);
  }

  const byFecha = (a, b) => {
    const da = parseDateFlexible(a.fechaISO) ?? new Date(0);
    const db = parseDateFlexible(b.fechaISO) ?? new Date(0);
    const diff = da.getTime() - db.getTime();
    if (diff !== 0) return diff;

    const ta = normDocTipo(a.docTipo);
    const tb = normDocTipo(b.docTipo);
    if (ta !== tb) return ta.localeCompare(tb, "es");
    return String(a.docNumero ?? "").localeCompare(String(b.docNumero ?? ""), "es");
  };

  noFactura.sort(byFecha);
  facturas.sort(byFecha);
  return { noFactura, facturas };
}

export async function generateBatchXlsxBlob({ correlativo, headerOverrides = {}, items }) {
  // Cargar template limpio (sin VML/checkboxes, con logo intacto)
  const binaryStr = atob(TEMPLATE_B64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes.buffer);
  const ws = wb.getWorksheet("Formulario");
  if (!ws) throw new Error("Hoja Formulario no encontrada en template");

  const settings = await getSettings();
  const h = { ...settings, ...headerOverrides };

  // ── Datos responsable ────────────────────────────────────────────────────
  ws.getCell("D15").value = h.responsableNombre ?? "";
  ws.getCell("L15").value = h.responsableRut ?? "";
  ws.getCell("D17").value = h.cargo ?? "";
  ws.getCell("L17").value = h.telefono ?? "";
  ws.getCell("D19").value = h.empresa ?? "";
  ws.getCell("L19").value = fmtDateDDMMYYYY(new Date());

  // ── Datos bancarios ──────────────────────────────────────────────────────
  ws.getCell("C22").value = h.tipoCuenta ?? "";
  ws.getCell("H22").value = h.numeroCuenta ?? "";
  ws.getCell("L22").value = h.banco ?? "";

  // ── Filas de datos ───────────────────────────────────────────────────────
  const safeItems = Array.isArray(items) ? items : [];
  const sorted = [...safeItems].sort((a, b) => {
    const da = parseDateFlexible(a.fechaISO) ?? new Date(0);
    const db = parseDateFlexible(b.fechaISO) ?? new Date(0);
    return da.getTime() - db.getTime();
  });

  const DATA_START = 28;
  const TEMPLATE_ROWS = 14; // filas 28-41 ya formateadas en template

  // Guardar estilos de fila 28 como referencia para filas extra
  const refStyles = {};
  for (let c = 1; c <= 13; c++) {
    const cell = ws.getCell(DATA_START, c);
    refStyles[c] = {
      font:      cell.font      ? { ...cell.font }      : undefined,
      alignment: cell.alignment ? { ...cell.alignment } : undefined,
      border:    cell.border    ? { ...cell.border }    : undefined,
      fill:      cell.fill      ? { ...cell.fill }      : undefined,
      numFmt:    cell.numFmt,
    };
  }

  sorted.forEach((it, idx) => {
    const r = DATA_START + idx;

    if (idx >= TEMPLATE_ROWS) {
      ws.getRow(r).height = 14.25;
      ws.mergeCells(`D${r}:G${r}`);
      ws.mergeCells(`J${r}:K${r}`);
      for (let c = 1; c <= 13; c++) {
        const cell = ws.getCell(r, c);
        const s = refStyles[c];
        if (s.font)      cell.font      = s.font;
        if (s.alignment) cell.alignment = s.alignment;
        if (s.border)    cell.border    = s.border;
        if (s.fill)      cell.fill      = s.fill;
        if (s.numFmt)    cell.numFmt    = s.numFmt;
      }
    }

    ws.getCell(r, 1).value  = it.docTipo ?? "";
    ws.getCell(r, 2).value  = toDisplayDate(it.fechaISO);
    ws.getCell(r, 3).value  = it.docNumero ?? "";
    ws.getCell(r, 4).value  = it.detalle ?? "";
    ws.getCell(r, 8).value  = codeName(it.crCodigo, it.crNombre);
    ws.getCell(r, 9).value  = codeName(it.ctaCodigo, it.ctaNombre);
    ws.getCell(r, 10).value = codeName(it.partidaCodigo, it.partidaNombre);
    ws.getCell(r, 12).value = codeName(it.clasificacionCodigo, it.clasificacionNombre);
    ws.getCell(r, 13).value = Number(it.monto ?? 0);
  });

  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}


export async function exportBatchXlsx({ correlativo, headerOverrides = {}, items }) {
  try {
    const blob = await generateBatchXlsxBlob({ correlativo, headerOverrides, items });
    downloadBlob(blob, `Rendicion_${correlativo || "SinNumero"}.xlsx`);
    return blob;
  } catch (err) {
    console.error("Error generando Excel:", err);
    throw err;
  }
}

export async function buildExportItems(gastoIds) {
  const db = await getDB();

  const [expenses, concepts, crs, accounts, partidas, clasificaciones] = await Promise.all([
    Promise.all(gastoIds.map((id) => db.get("expenses", id))),
    db.getAll("concepts"),
    db.getAll("catalog_cr"),
    db.getAll("catalog_accounts"),
    db.getAll("catalog_partidas"),
    db.getAll("catalog_clasificaciones").catch(() => []),
  ]);

  const conceptById = new Map(concepts.map((c) => [c.conceptId ?? c.id, c]));
  const crByCode = new Map(crs.map((c) => [c.crCodigo, c]));
  const accByCode = new Map(accounts.map((a) => [a.ctaCodigo, a]));
  const partidaByCode = new Map(partidas.map((p) => [p.partidaCodigo, p]));
  const clasifByCode = new Map((clasificaciones || []).map((x) => [x.clasificacionCodigo, x]));

  return (expenses || [])
    .filter(Boolean)
    .map((e) => {
      const concept = e.conceptId ? conceptById.get(e.conceptId) : null;

      const crCodigo = concept?.crCodigo ?? e.crCodigo ?? e.cr ?? "";
      const ctaCodigo = concept?.ctaCodigo ?? e.ctaCodigo ?? e.cuenta ?? e.cuentaContable ?? "";
      const partidaCodigo = concept?.partidaCodigo ?? e.partidaCodigo ?? e.partida ?? "";

      const cr = crByCode.get(crCodigo);
      const acc = accByCode.get(ctaCodigo);
      const part = partidaByCode.get(partidaCodigo);

      // FIX: normalizar fecha a DD-MM-YYYY al construir el item de exportación
      const rawFecha = e.fechaISO ?? e.fechaDocumento ?? e.fecha ?? "";

      return {
        id: e.id,
        docTipo: e.docTipo ?? e.tipoDoc ?? e.tipoDocumento ?? "",
        fechaISO: toDisplayDate(rawFecha),
        docNumero: e.docNumero ?? e.numeroDoc ?? e.numeroDocumento ?? "",
        detalle: e.detalle ?? e.glosa ?? "",
        crCodigo,
        crNombre: cr?.crNombre ?? "",
        ctaCodigo,
        ctaNombre: acc?.ctaNombre ?? "",
        partidaCodigo,
        partidaNombre: part?.partidaNombre ?? "",
        clasificacionCodigo: e.clasificacionCodigo ?? e.clasificacion ?? "",
        clasificacionNombre: clasifByCode.get(e.clasificacionCodigo ?? e.clasificacion ?? "")?.clasificacionNombre ?? e.clasificacionNombre ?? "",
        monto: Number(e.monto ?? 0),
      };
    });
}
