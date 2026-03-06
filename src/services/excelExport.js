import ExcelJS from "exceljs";
import { getSettings, getDB } from "../db.js";

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

// ── Helpers de estilo ────────────────────────────────────────────────────────
const AZUL      = "4472C4";   // títulos sección
const AZUL_CLARO = "9DC3E6";  // header tabla (theme accent1 tint +0.4)
const GRIS      = "D9D9D9";   // separadores / fondo campos
const BORDE_MED = { style: "medium", color: { argb: "FF000000" } };
const BORDE_THIN = { style: "thin",  color: { argb: "FF000000" } };
const BORDE_ALL_THIN = { top: BORDE_THIN, left: BORDE_THIN, bottom: BORDE_THIN, right: BORDE_THIN };
const BORDE_ALL_MED  = { top: BORDE_MED,  left: BORDE_MED,  bottom: BORDE_MED,  right: BORDE_MED  };

function fillSolid(argb) {
  return { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + argb } };
}

function styleLabel(ws, addr, text, opts = {}) {
  const c = ws.getCell(addr);
  c.value = text;
  c.font = { bold: true, size: opts.size ?? 11, color: { argb: opts.fontColor ?? "FF000000" }, name: "Calibri" };
  c.alignment = { vertical: "middle", horizontal: opts.align ?? "left", wrapText: true };
  if (opts.fill) c.fill = fillSolid(opts.fill);
  if (opts.border) c.border = opts.border;
}

function styleValue(ws, addr, value, opts = {}) {
  const c = ws.getCell(addr);
  c.value = value ?? "";
  c.font = { size: opts.size ?? 10, name: "Calibri" };
  c.alignment = { vertical: "middle", horizontal: opts.align ?? "center", wrapText: false };
  c.border = opts.border ?? BORDE_ALL_THIN;
  if (opts.fill) c.fill = fillSolid(opts.fill);
  if (opts.numFmt) c.numFmt = opts.numFmt;
}

function mergeLabel(ws, range, text, opts = {}) {
  ws.mergeCells(range);
  styleLabel(ws, range.split(":")[0], text, opts);
}

function mergeValue(ws, range, value, opts = {}) {
  ws.mergeCells(range);
  styleValue(ws, range.split(":")[0], value, opts);
}

export async function generateBatchXlsxBlob({ correlativo, headerOverrides = {}, items }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Caja Chica";
  wb.created = new Date();
  const ws = wb.addWorksheet("Formulario", {
    pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1 }
  });

  const settings = await getSettings();
  const h = { ...settings, ...headerOverrides };

  // ── Anchos de columna (basados en original) ──────────────────────────────
  ws.getColumn(1).width  = 17;      // A
  ws.getColumn(2).width  = 12.5;    // B
  ws.getColumn(3).width  = 14.7;    // C
  ws.getColumn(4).width  = 5.1;     // D
  ws.getColumn(5).width  = 16.9;    // E
  ws.getColumn(6).width  = 2.3;     // F (separador)
  ws.getColumn(7).width  = 13.4;    // G
  ws.getColumn(8).width  = 35.3;    // H
  ws.getColumn(9).width  = 35;      // I
  ws.getColumn(10).width = 6;       // J
  ws.getColumn(11).width = 30;      // K
  ws.getColumn(12).width = 32.7;    // L
  ws.getColumn(13).width = 22.4;    // M

  // ── Fila 1: Logo área y N° Operación ────────────────────────────────────
  ws.getRow(1).height = 30;
  ws.mergeCells("A1:D5");   // área logo (vacía — sin imagen)
  ws.mergeCells("E1:M5");   // área título empresa
  const titleCell = ws.getCell("E1");
  titleCell.value = h.empresa ?? "FORMULARIO DE RENDICIÓN DE CAJA CHICA";
  titleCell.font = { bold: true, size: 20, name: "Calibri", color: { argb: "FF" + AZUL } };
  titleCell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };

  // N° Operación (esquina derecha superior — B1:C1)
  ws.getRow(2).height = 7;
  ws.getRow(4).height = 9;
  const opCell = ws.getCell("B1");
  opCell.value = "N° Operación";
  opCell.font  = { size: 9, name: "Calibri" };
  opCell.alignment = { horizontal: "center", vertical: "middle" };

  // ── Fila 7: Tipo de rendición ─────────────────────────────────────────────
  ws.getRow(6).height = 4;
  ws.getRow(7).height = 21;
  ws.getRow(8).height = 5;
  ws.mergeCells("A7:M7");
  styleLabel(ws, "A7", "Tipo de rendición", {
    size: 16, fill: AZUL, fontColor: "FFFFFFFF", align: "center",
    border: BORDE_ALL_MED,
  });

  // ── Fila 9-11: Checkboxes tipo rendición ──────────────────────────────────
  ws.getRow(10).height = 19;
  ws.getRow(11).height = 17;
  // Fila 9: separador
  // Fila 10: etiquetas
  styleLabel(ws, "A10", "☐ Caja Chica", { size: 11 });
  styleLabel(ws, "D10", "☐ Fondo por Rendir", { size: 11 });
  styleLabel(ws, "H10", "☑ Reembolso de Gastos", { size: 11, bold: true });
  ws.mergeCells("J10:M10");
  styleLabel(ws, "J10", "Número de Fondo por Rendir:", { size: 9 });

  // ── Fila 13: Información del responsable ─────────────────────────────────
  ws.getRow(12).height = 6;
  ws.getRow(13).height = 21;
  ws.getRow(14).height = 8;
  ws.getRow(16).height = 6;
  ws.getRow(18).height = 5;
  ws.getRow(20).height = 7;
  ws.mergeCells("A13:M13");
  styleLabel(ws, "A13", "Información del responsable", {
    size: 16, fill: AZUL, fontColor: "FFFFFFFF", align: "center",
    border: BORDE_ALL_MED,
  });

  // Fila 15: Nombre / RUT
  ws.getRow(15).height = 17;
  styleLabel(ws, "A15", "Nombre Responsable", { bold: true, size: 11 });
  ws.mergeCells("D15:H15");
  styleValue(ws, "D15", h.responsableNombre ?? "", { align: "center" });
  styleLabel(ws, "I15", "RUT", { bold: true, size: 11, align: "right" });
  ws.mergeCells("L15:M15");
  styleValue(ws, "L15", h.responsableRut ?? "", { align: "center" });

  // Fila 17: Cargo / Teléfono
  ws.getRow(17).height = 17;
  styleLabel(ws, "A17", "Cargo", { bold: true, size: 11 });
  ws.mergeCells("D17:H17");
  styleValue(ws, "D17", h.cargo ?? "", { align: "center" });
  styleLabel(ws, "I17", "Teléfono", { bold: true, size: 11, align: "right" });
  ws.mergeCells("L17:M17");
  styleValue(ws, "L17", h.telefono ?? "", { align: "center" });

  // Fila 19: Empresa / Fecha
  ws.getRow(19).height = 17;
  styleLabel(ws, "A19", "Empresa", { bold: true, size: 11 });
  ws.mergeCells("D19:H19");
  styleValue(ws, "D19", h.empresa ?? "", { align: "center" });
  styleLabel(ws, "I19", "Fecha", { bold: true, size: 11, align: "right" });
  ws.mergeCells("L19:M19");
  styleValue(ws, "L19", fmtDateDDMMYYYY(new Date()), { align: "center" });

  // Fila 21-22: Datos bancarios
  ws.getRow(21).height = 6;
  ws.getRow(22).height = 17;
  styleLabel(ws, "A22", "Tipo de Cuenta", { bold: true, size: 11 });
  ws.mergeCells("C22:E22");
  styleValue(ws, "C22", h.tipoCuenta ?? "", { align: "center" });
  styleLabel(ws, "F22", "N° Cuenta", { bold: true, size: 11, align: "right" });
  styleValue(ws, "H22", h.numeroCuenta ?? "", { align: "center" });
  styleLabel(ws, "I22", "Banco", { bold: true, size: 11, align: "right" });
  ws.mergeCells("L22:M22");
  styleValue(ws, "L22", h.banco ?? "", { align: "center" });

  // ── Fila 24: Información de la rendición ─────────────────────────────────
  ws.getRow(23).height = 17;
  ws.getRow(24).height = 21;
  ws.getRow(25).height = 13;
  ws.mergeCells("A24:M24");
  styleLabel(ws, "A24", "Información de la rendición", {
    size: 16, fill: AZUL, fontColor: "FFFFFFFF", align: "center",
    border: BORDE_ALL_MED,
  });

  // Fila 26: subtítulo vacío (separador visual)
  ws.getRow(26).height = 22;
  ws.mergeCells("A26:M26");

  // ── Fila 27: Headers tabla ────────────────────────────────────────────────
  ws.getRow(27).height = 32;
  const headerFill = fillSolid(AZUL_CLARO);
  const headerFont = { bold: true, size: 11, name: "Calibri" };
  const headerAlign = { vertical: "middle", horizontal: "center", wrapText: true };
  const headers = [
    [1,"A27","Tipo de Doc."],
    [2,"B27","Fecha"],
    [3,"C27","N° Doc"],
    [4,"D27:G27","Descripción"],
    [8,"H27","Centro de Responsabilidad"],
    [9,"I27","Cuenta Contable"],
    [10,"J27:K27","Partida"],
    [12,"L27","Clasificación"],
    [13,"M27","Monto ($)"],
  ];
  headers.forEach(([col, addr, text]) => {
    if (addr.includes(":")) {
      ws.mergeCells(addr);
      addr = addr.split(":")[0];
    }
    const c = ws.getCell(addr);
    c.value = text;
    c.font = headerFont;
    c.alignment = headerAlign;
    c.fill = headerFill;
    c.border = BORDE_ALL_THIN;
  });

  // ── Filas de datos ────────────────────────────────────────────────────────
  const safeItems = Array.isArray(items) ? items : [];
  const sorted = [...safeItems].sort((a, b) => {
    const da = parseDateFlexible(a.fechaISO) ?? new Date(0);
    const db = parseDateFlexible(b.fechaISO) ?? new Date(0);
    return da.getTime() - db.getTime();
  });

  const DATA_START = 28;
  const dataFont  = { size: 9, name: "Calibri" };
  const dataAlign = { vertical: "middle", wrapText: false };
  let total = 0;

  sorted.forEach((it, idx) => {
    const r = DATA_START + idx;
    ws.getRow(r).height = 14.25;

    const monto = Number(it.monto ?? 0);
    total += monto;

    // Merge Descripción (D:G) y Partida (J:K)
    ws.mergeCells(`D${r}:G${r}`);
    ws.mergeCells(`J${r}:K${r}`);

    const setCell = (col, value, align = "center", numFmt = null) => {
      const c = ws.getCell(r, col);
      c.value = value ?? "";
      c.font = dataFont;
      c.alignment = { ...dataAlign, horizontal: align };
      c.border = BORDE_ALL_THIN;
      if (numFmt) c.numFmt = numFmt;
    };

    setCell(1,  it.docTipo ?? "",                          "center");
    setCell(2,  toDisplayDate(it.fechaISO),                "center");
    setCell(3,  it.docNumero ?? "",                        "center");
    setCell(4,  it.detalle ?? "",                          "left");
    setCell(8,  codeName(it.crCodigo, it.crNombre),        "left");
    setCell(9,  codeName(it.ctaCodigo, it.ctaNombre),      "left");
    setCell(10, codeName(it.partidaCodigo, it.partidaNombre), "center");
    setCell(12, codeName(it.clasificacionCodigo, it.clasificacionNombre), "center");
    setCell(13, monto,                                     "center", "#,##0");
  });

  // ── Filas de totales ──────────────────────────────────────────────────────
  const lastDataRow = DATA_START + sorted.length - 1;
  const totRow = lastDataRow + 2;  // fila 42 base
  ws.getRow(totRow).height = 18;
  ws.getRow(totRow + 1).height = 17;
  ws.getRow(totRow + 2).height = 18;
  ws.getRow(totRow + 3).height = 28;

  ws.mergeCells(`H${totRow}:L${totRow}`);
  ws.mergeCells(`H${totRow+1}:L${totRow+1}`);
  ws.mergeCells(`H${totRow+2}:L${totRow+2}`);
  ws.mergeCells(`H${totRow+3}:L${totRow+3}`);

  const totalFontNorm = { size: 12, name: "Calibri" };
  const totalFontBold = { bold: true, size: 12, name: "Calibri" };
  const totalAlign = { vertical: "middle", horizontal: "right" };
  const totalAlignC = { vertical: "middle", horizontal: "center" };

  const setTotal = (row, label, value, bold = false) => {
    const lc = ws.getCell(`H${row}`);
    lc.value = label;
    lc.font = bold ? totalFontBold : totalFontNorm;
    lc.alignment = totalAlign;
    lc.border = BORDE_ALL_THIN;

    const vc = ws.getCell(`M${row}`);
    vc.value = value;
    vc.font = bold ? totalFontBold : totalFontNorm;
    vc.alignment = totalAlignC;
    vc.border = BORDE_ALL_THIN;
    vc.numFmt = "#,##0";
  };

  setTotal(totRow,   "Total",                   total,  false);
  setTotal(totRow+1, "(-) Anticipos",            "",     false);
  setTotal(totRow+2, "Total Boletas y Facturas", total,  true);

  // ── Firmas ────────────────────────────────────────────────────────────────
  const firmaRow = totRow + 5;
  ws.getRow(firmaRow).height = 50;
  ws.getRow(firmaRow + 1).height = 44;

  ws.mergeCells(`A${firmaRow}:D${firmaRow+1}`);
  ws.mergeCells(`E${firmaRow}:I${firmaRow+1}`);
  ws.mergeCells(`J${firmaRow}:L${firmaRow+1}`);
  ws.mergeCells(`M${firmaRow}:M${firmaRow+1}`);

  const firmaStyle = (addr, text) => {
    const c = ws.getCell(addr);
    c.value = text;
    c.font = { bold: true, size: 12, name: "Calibri" };
    c.alignment = { vertical: "bottom", horizontal: "center", wrapText: true };
    c.border = { top: BORDE_MED, bottom: BORDE_MED, left: BORDE_MED, right: BORDE_MED };
  };
  firmaStyle(`A${firmaRow}`, "Firma Responsable del Fondo o Solicitante");
  firmaStyle(`E${firmaRow}`, "Firma Aprobador");
  firmaStyle(`J${firmaRow}`, "Firma Control Pagos");

  // ── Pie: título formulario ────────────────────────────────────────────────
  const pieRow = firmaRow + 3;
  ws.getRow(pieRow).height = 43;
  ws.mergeCells(`A${pieRow}:D${pieRow+4}`);
  ws.mergeCells(`E${pieRow}:M${pieRow+4}`);
  const pieCell = ws.getCell(`E${pieRow}`);
  pieCell.value = "Formulario de Rendición de Caja Chica / Fondo por Rendir / Reembolso de Gastos";
  pieCell.font = { bold: true, size: 14, name: "Calibri", color: { argb: "FF" + AZUL } };
  pieCell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };

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
