import ExcelJS from "exceljs";
import { getSettings, getDB } from "../db.js";

const CAPACITY = 42;

// Tipos de rendición reconocidos → celda booleana vinculada en fila 11
// Caja Chica → A11, Fondos por rendir → D11, Reembolso de gastos → H11, Gastos Operacionales → K11
const TIPO_REND_CELL = {
  "caja chica":                        "A11",
  "cajachica":                         "A11",
  "fondos":                            "D11",
  "fondos por rendir":                 "D11",
  "reembolso":                         "H11",
  "reembolso de gastos":               "H11",
  "gastos operacionales":              "K11",
  "rendición de gastos operacionales": "K11",
};

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

// Convierte cualquier fecha ISO/string al formato DD-MM-YYYY para mostrar en celda Excel
function toDisplayDate(s) {
  if (!s) return "";
  const str = String(s).trim();
  if (!str) return "";
  if (/^\d{2}-\d{2}-\d{4}$/.test(str)) return str;
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

  const dt = new Date(str);
  return isNaN(dt.getTime()) ? null : dt;
}

// ── Hoja "2. Resumen" con totales agrupados por CR → Cuenta → Partida ────────
function buildResumenSheet(wb, items, correlativo) {
  const ws2 = wb.addWorksheet("2. Resumen");

  const hdrFont   = { bold: true, size: 10, name: "Calibri" };
  const bodyFont  = { size: 10, name: "Calibri" };
  const numFmt    = "#,##0";
  const border    = {
    top:    { style: "thin" },
    bottom: { style: "thin" },
    left:   { style: "thin" },
    right:  { style: "thin" },
  };
  const hdrFill   = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9E1F2" } };
  const totalFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFCE4D6" } };

  ws2.columns = [
    { key: "cr",      width: 36 },
    { key: "cuenta",  width: 32 },
    { key: "partida", width: 32 },
    { key: "monto",   width: 16 },
  ];

  // Título
  const titleRow = ws2.addRow([`Resumen — Rendición ${correlativo ?? ""}`, "", "", ""]);
  ws2.mergeCells(`A${titleRow.number}:D${titleRow.number}`);
  titleRow.getCell(1).font      = { bold: true, size: 12, name: "Calibri" };
  titleRow.getCell(1).alignment = { horizontal: "center" };
  titleRow.height = 20;

  ws2.addRow([]);

  // Encabezados
  const hdrRow = ws2.addRow(["Centro de Responsabilidad", "Cuenta Contable", "Partida", "Monto ($)"]);
  hdrRow.eachCell((cell) => {
    cell.font      = hdrFont;
    cell.fill      = hdrFill;
    cell.border    = border;
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  });
  hdrRow.height = 16;

  // Agrupar: CR → Cuenta → Partida → suma de montos
  const grouped = new Map();
  for (const it of items) {
    const crKey      = codeName(it.crCodigo, it.crNombre) || "(Sin CR)";
    const cuentaKey  = codeName(it.ctaCodigo, it.ctaNombre) || "(Sin Cuenta)";
    const partidaKey = codeName(it.partidaCodigo, it.partidaNombre) || "(Sin Partida)";
    const monto      = Number(it.monto ?? 0);

    if (!grouped.has(crKey)) grouped.set(crKey, new Map());
    const cuentas = grouped.get(crKey);
    if (!cuentas.has(cuentaKey)) cuentas.set(cuentaKey, new Map());
    const partidas = cuentas.get(cuentaKey);
    partidas.set(partidaKey, (partidas.get(partidaKey) ?? 0) + monto);
  }

  let grandTotal = 0;

  for (const [crKey, cuentas] of grouped) {
    let crTotal = 0;
    const crStartRow = ws2.rowCount + 1;

    for (const [cuentaKey, partidas] of cuentas) {
      for (const [partidaKey, monto] of partidas) {
        const row = ws2.addRow([crKey, cuentaKey, partidaKey, monto]);
        row.getCell(4).numFmt    = numFmt;
        row.getCell(4).alignment = { horizontal: "right" };
        row.eachCell({ includeEmpty: true }, (cell, col) => {
          cell.font = bodyFont;
          if (col <= 4) cell.border = border;
        });
        crTotal    += monto;
        grandTotal += monto;
      }
    }

    // Subtotal por CR
    const crEndRow = ws2.rowCount;
    if (crEndRow >= crStartRow) {
      const stRow = ws2.addRow(["", "", `Subtotal ${crKey}`, null]);
      stRow.getCell(4).value    = { formula: `SUM(D${crStartRow}:D${crEndRow})`, result: crTotal };
      stRow.getCell(3).font     = { bold: true, size: 10, name: "Calibri" };
      stRow.getCell(4).font     = { bold: true, size: 10, name: "Calibri" };
      stRow.getCell(4).numFmt   = numFmt;
      stRow.getCell(4).alignment = { horizontal: "right" };
      [3, 4].forEach((c) => { stRow.getCell(c).border = border; });
    }
    ws2.addRow([]);
  }

  // Total general
  const totalRow = ws2.addRow(["TOTAL GENERAL", "", "", grandTotal]);
  ws2.mergeCells(`A${totalRow.number}:C${totalRow.number}`);
  totalRow.getCell(1).font      = { bold: true, size: 11, name: "Calibri" };
  totalRow.getCell(1).alignment = { horizontal: "right" };
  totalRow.getCell(4).font      = { bold: true, size: 11, name: "Calibri" };
  totalRow.getCell(4).numFmt    = numFmt;
  totalRow.getCell(4).alignment = { horizontal: "right" };
  [1, 2, 3, 4].forEach((c) => {
    totalRow.getCell(c).fill   = totalFill;
    totalRow.getCell(c).border = border;
  });
  totalRow.height = 18;
}

export async function generateBatchXlsxBlob({ correlativo, headerOverrides = {}, items, tipoRendicion }) {
  const settings = await getSettings();
  const h = { ...settings, ...headerOverrides };

  const wb = new ExcelJS.Workbook();
  wb.creator = "Rendicion App";
  wb.created = new Date();

  const ws = wb.addWorksheet("Formulario");

  // ── Estilos base ─────────────────────────────────────────────────────────────
  const font      = { name: "Calibri", size: 9 };
  const fontBold  = { name: "Calibri", size: 9, bold: true };
  const fontTitle = { name: "Calibri", size: 10, bold: true };
  const borderThin = { style: "thin" };
  const borderAll = { top: borderThin, bottom: borderThin, left: borderThin, right: borderThin };
  const borderBottom = { bottom: borderThin };
  const fillHeader = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9E1F2" } };
  const fillTotal  = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFCE4D6" } };
  const fillSection = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2EFDA" } };
  const alignCenter = { horizontal: "center", vertical: "middle" };
  const alignRight  = { horizontal: "right",  vertical: "middle" };
  const alignLeft   = { horizontal: "left",   vertical: "middle" };
  const numFmt = "#,##0";

  const setCell = (ref, value, opts = {}) => {
    const cell = ws.getCell(ref);
    cell.value = value;
    if (opts.font)      cell.font      = opts.font;
    if (opts.fill)      cell.fill      = opts.fill;
    if (opts.border)    cell.border    = opts.border;
    if (opts.alignment) cell.alignment = opts.alignment;
    if (opts.numFmt)    cell.numFmt    = opts.numFmt;
    return cell;
  };

  // ── Anchos de columna ────────────────────────────────────────────────────────
  ws.columns = [
    { key: "A", width: 8  },  // 1 DocTipo
    { key: "B", width: 10 },  // 2 Fecha
    { key: "C", width: 10 },  // 3 N°Doc
    { key: "D", width: 12 },  // 4 Descripción (merge D:G)
    { key: "E", width: 10 },
    { key: "F", width: 10 },
    { key: "G", width: 10 },
    { key: "H", width: 18 },  // 8 CR
    { key: "I", width: 14 },  // 9 Cuenta
    { key: "J", width: 12 },  // 10 Partida (merge J:K)
    { key: "K", width: 10 },
    { key: "L", width: 12 },  // 12 Clasificación
    { key: "M", width: 12 },  // 13 Monto
  ];

  // ── FILA 1: Título ───────────────────────────────────────────────────────────
  ws.mergeCells("E1:M1");
  setCell("E1", "Formulario de Rendición de Caja chica, Fondos por rendir, Reembolso de gastos 2026", {
    font: fontTitle, alignment: alignCenter,
  });
  ws.getRow(1).height = 20;

  // ── FILA 3: N° Operación / N° Req ────────────────────────────────────────────
  ws.mergeCells("B3:C3");
  setCell("B3", "N° Operación", { font: fontBold, alignment: alignLeft });
  ws.mergeCells("B5:C5");
  setCell("B5", "N° Req.", { font: fontBold, alignment: alignLeft });

  // ── FILA 7: Tipo de rendición ────────────────────────────────────────────────
  ws.mergeCells("A7:M7");
  setCell("A7", "Tipo de rendición", {
    font: fontBold, fill: fillSection, alignment: alignCenter, border: borderAll,
  });
  ws.getRow(7).height = 16;

  // ── FILA 8-10: checkboxes (texto simple ya que ExcelJS no soporta Form Controls) ──
  const tipoNorm = String(tipoRendicion ?? "").trim().toLowerCase();
  const tipos = [
    { cell: "A9", key: "caja chica",          label: "Caja Chica" },
    { cell: "D9", key: "fondos por rendir",    label: "Fondos por rendir" },
    { cell: "H9", key: "reembolso de gastos",  label: "Reembolso de gastos" },
    { cell: "K9", key: "gastos operacionales", label: "Gastos Operacionales" },
  ];
  tipos.forEach(({ cell, key, label }) => {
    const isActive = tipoNorm === key || tipoNorm === key.replace(/\s/g, "");
    ws.mergeCells(`${cell}:${String.fromCharCode(cell.charCodeAt(0) + 2)}9`);
    setCell(cell, (isActive ? "☑ " : "☐ ") + label, {
      font: isActive ? fontBold : font,
      alignment: alignCenter,
      border: borderAll,
    });
  });
  ws.getRow(9).height = 14;

  // ── FILA 13: Sección Responsable ─────────────────────────────────────────────
  ws.mergeCells("A13:M13");
  setCell("A13", "Información del responsable", {
    font: fontBold, fill: fillSection, alignment: alignCenter, border: borderAll,
  });
  ws.getRow(13).height = 14;

  // ── FILAS 14-19: Datos responsable ───────────────────────────────────────────
  const labelOpts = { font: fontBold, border: borderAll, alignment: alignLeft };
  const valueOpts = { font, border: borderAll, alignment: alignLeft };

  ws.mergeCells("A15:C15"); setCell("A15", "Nombre Responsable", labelOpts);
  ws.mergeCells("D15:I15"); setCell("D15", h.responsableNombre ?? "", valueOpts);
  ws.mergeCells("J15:K15"); setCell("J15", "Rut", labelOpts);
  ws.mergeCells("L15:M15"); setCell("L15", h.responsableRut ?? "", valueOpts);
  ws.getRow(15).height = 13;

  ws.mergeCells("A17:C17"); setCell("A17", "Cargo", labelOpts);
  ws.mergeCells("D17:I17"); setCell("D17", h.cargo ?? "", valueOpts);
  ws.mergeCells("J17:K17"); setCell("J17", "Teléfono / Cel", labelOpts);
  ws.mergeCells("L17:M17"); setCell("L17", h.telefono ?? "", valueOpts);
  ws.getRow(17).height = 13;

  ws.mergeCells("A19:C19"); setCell("A19", "Empresa", labelOpts);
  ws.mergeCells("D19:I19"); setCell("D19", h.empresa ?? "", valueOpts);
  ws.mergeCells("J19:K19"); setCell("J19", "Fecha", labelOpts);
  ws.mergeCells("L19:M19"); setCell("L19", fmtDateDDMMYYYY(new Date()), valueOpts);
  ws.getRow(19).height = 13;

  // ── FILA 21: Sección Bancaria ─────────────────────────────────────────────────
  ws.mergeCells("A21:M21");
  setCell("A21", "Datos bancarios", {
    font: fontBold, fill: fillSection, alignment: alignCenter, border: borderAll,
  });
  ws.getRow(21).height = 14;

  ws.mergeCells("A22:B22"); setCell("A22", "Tipo de Cuenta", labelOpts);
  ws.mergeCells("C22:F22"); setCell("C22", h.tipoCuenta ?? "", valueOpts);
  ws.mergeCells("G22:H22"); setCell("G22", "N° Cuenta", labelOpts);
  ws.mergeCells("I22:J22"); setCell("I22", h.numeroCuenta ?? "", valueOpts);
  ws.mergeCells("K22:K22"); setCell("K22", "Banco", labelOpts);
  ws.mergeCells("L22:M22"); setCell("L22", h.banco ?? "", valueOpts);
  ws.getRow(22).height = 13;

  // ── FILA 24: Sección Rendición ────────────────────────────────────────────────
  ws.mergeCells("A24:M24");
  setCell("A24", "Información de la rendición", {
    font: fontBold, fill: fillSection, alignment: alignCenter, border: borderAll,
  });
  ws.getRow(24).height = 14;

  // ── FILA 27: Encabezados de columnas ─────────────────────────────────────────
  const colHeaders = [
    [1, 1, "Tipo de Doc."],
    [2, 2, "Fecha"],
    [3, 3, "N° Doc"],
    [4, 7, "Descripción"],
    [8, 8, "Centro de Responsabilidad"],
    [9, 9, "Cuenta Contable"],
    [10, 11, "Partida"],
    [12, 12, "Clasificación"],
    [13, 13, "Monto ($)"],
  ];
  colHeaders.forEach(([colStart, colEnd, label]) => {
    const startRef = `${String.fromCharCode(64 + colStart)}27`;
    const endRef   = `${String.fromCharCode(64 + colEnd)}27`;
    if (colStart !== colEnd) ws.mergeCells(`${startRef}:${endRef}`);
    setCell(startRef, label, {
      font: fontBold, fill: fillHeader, border: borderAll,
      alignment: { horizontal: "center", vertical: "middle", wrapText: true },
    });
  });
  ws.getRow(27).height = 28;

  // ── FILAS DE DATOS ────────────────────────────────────────────────────────────
  const safeItems = Array.isArray(items) ? items : [];
  const sorted = [...safeItems].sort((a, b) => {
    const da = parseDateFlexible(a.fechaISO) ?? new Date(0);
    const db = parseDateFlexible(b.fechaISO) ?? new Date(0);
    return da.getTime() - db.getTime();
  });

  const DATA_START = 28;

  sorted.forEach((it, idx) => {
    const r = DATA_START + idx;
    ws.mergeCells(`D${r}:G${r}`);
    ws.mergeCells(`J${r}:K${r}`);
    ws.getRow(r).height = 13;

    const rowBorder = { top: borderThin, bottom: borderThin, left: borderThin, right: borderThin };
    const setData = (col, val, extra = {}) => {
      const cell = ws.getCell(r, col);
      cell.value = val;
      cell.font = font;
      cell.border = rowBorder;
      cell.alignment = alignLeft;
      if (extra.numFmt) cell.numFmt = extra.numFmt;
      if (extra.alignment) cell.alignment = extra.alignment;
    };

    setData(1,  it.docTipo ?? "");
    setData(2,  toDisplayDate(it.fechaISO));
    setData(3,  it.docNumero ?? "");
    setData(4,  it.conceptNombre || it.detalle || "");
    setData(8,  codeName(it.crCodigo, it.crNombre));
    setData(9,  codeName(it.ctaCodigo, it.ctaNombre));
    setData(10, codeName(it.partidaCodigo, it.partidaNombre));
    setData(12, codeName(it.clasificacionCodigo, it.clasificacionNombre));
    setData(13, Number(it.monto ?? 0), { numFmt, alignment: alignRight });
  });

  // ── TOTALES ───────────────────────────────────────────────────────────────────
  const lastDataRow = DATA_START + Math.max(sorted.length, 1) - 1;
  const sumTotal    = sorted.reduce((acc, it) => acc + Number(it.monto ?? 0), 0);
  const totalRow    = lastDataRow + 2;
  const netoRow     = totalRow + 2;

  ws.mergeCells(`A${totalRow}:G${totalRow}`);
  setCell(`H${totalRow}`, "Total", { font: fontBold, border: borderAll, alignment: alignRight });
  setCell(`M${totalRow}`, { formula: `SUM(M${DATA_START}:M${lastDataRow})`, result: sumTotal }, {
    font: fontBold, fill: fillTotal, border: borderAll, numFmt, alignment: alignRight,
  });

  ws.mergeCells(`A${totalRow + 1}:G${totalRow + 1}`);
  setCell(`H${totalRow + 1}`, "(-) Anticipos", { font: fontBold, border: borderAll, alignment: alignRight });
  setCell(`M${totalRow + 1}`, "", { border: borderAll, numFmt });

  ws.mergeCells(`A${netoRow}:G${netoRow}`);
  setCell(`H${netoRow}`, "Total Boletas y Facturas", { font: fontBold, border: borderAll, alignment: alignRight });
  setCell(`M${netoRow}`, { formula: `+M${totalRow}+M${totalRow + 1}`, result: sumTotal }, {
    font: fontBold, fill: fillTotal, border: borderAll, numFmt, alignment: alignRight,
  });

  // ── FIRMAS ────────────────────────────────────────────────────────────────────
  const firmaRow = netoRow + 3;
  ws.getRow(firmaRow).height = 20;
  // Líneas de firma
  ["B", "H", "L"].forEach((col) => {
    const endCol = col === "B" ? "F" : col === "H" ? "J" : "N";
    ws.mergeCells(`${col}${firmaRow}:${endCol}${firmaRow}`);
    ws.getCell(`${col}${firmaRow}`).border = borderBottom;
  });
  const firmaLabelRow = firmaRow + 1;
  ws.mergeCells(`B${firmaLabelRow}:F${firmaLabelRow}`);
  setCell(`B${firmaLabelRow}`, "Firma Responsable del Fondo o Caja", { font, alignment: alignCenter });
  ws.mergeCells(`H${firmaLabelRow}:J${firmaLabelRow}`);
  setCell(`H${firmaLabelRow}`, "Firma Aprobador", { font, alignment: alignCenter });
  ws.mergeCells(`L${firmaLabelRow}:N${firmaLabelRow}`);
  setCell(`L${firmaLabelRow}`, "Firma Control Pagos", { font, alignment: alignCenter });

  // ── Hoja 2: Resumen ──────────────────────────────────────────────────────────
  buildResumenSheet(wb, sorted, correlativo);

  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}


export async function exportBatchXlsx({ correlativo, headerOverrides = {}, items, tipoRendicion }) {
  try {
    const blob = await generateBatchXlsxBlob({ correlativo, headerOverrides, items, tipoRendicion });
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

  const conceptById  = new Map(concepts.map((c) => [c.conceptId ?? c.id, c]));
  const crByCode     = new Map(crs.map((c) => [c.crCodigo, c]));
  const accByCode    = new Map(accounts.map((a) => [a.ctaCodigo, a]));
  const partidaByCode = new Map(partidas.map((p) => [p.partidaCodigo, p]));
  const clasifByCode  = new Map((clasificaciones || []).map((x) => [x.clasificacionCodigo, x]));

  return (expenses || [])
    .filter(Boolean)
    .map((e) => {
      const concept = e.conceptId ? conceptById.get(e.conceptId) : null;

      const crCodigo      = concept?.crCodigo ?? e.crCodigo ?? e.cr ?? "";
      const ctaCodigo     = concept?.ctaCodigo ?? e.ctaCodigo ?? e.cuenta ?? e.cuentaContable ?? "";
      const partidaCodigo = concept?.partidaCodigo ?? e.partidaCodigo ?? e.partida ?? "";

      const cr    = crByCode.get(crCodigo);
      const acc   = accByCode.get(ctaCodigo);
      const part  = partidaByCode.get(partidaCodigo);

      const rawFecha = e.fechaISO ?? e.fechaDocumento ?? e.fecha ?? "";

      return {
        id: e.id,
        docTipo: e.docTipo ?? e.tipoDoc ?? e.tipoDocumento ?? "",
        fechaISO: toDisplayDate(rawFecha),
        docNumero: e.docNumero ?? e.numeroDoc ?? e.numeroDocumento ?? "",
        detalle: e.detalle ?? e.glosa ?? "",
        conceptNombre: concept?.nombre ?? "",
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
