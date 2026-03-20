import ExcelJS from "exceljs";
import { getSettings, getDB } from "../db.js";

// Logo corporativo (extraído del template original)
const LOGO_B64 = "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";

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

  // ── Estilos exactos del template corporativo ─────────────────────────────────
  const F = (opts = {}) => ({ name: "Calibri", size: 9, ...opts });
  const borderThin   = { style: "thin" };
  const borderMedium = { style: "medium" };
  const allThin   = { top: borderThin, bottom: borderThin, left: borderThin, right: borderThin };
  const botThin   = { bottom: borderThin };
  const topMedBotThinLeftMed = { top: borderMedium, bottom: borderThin, left: borderMedium, right: borderThin };
  const topThinBotMedLeftMed = { top: borderThin, bottom: borderMedium, left: borderMedium, right: borderThin };
  const allMed    = { top: borderMedium, bottom: borderMedium, left: borderMedium, right: borderThin };
  const fillBlue  = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9E1F2" } };
  const fillYellow = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFF99" } };
  const fillTotal  = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFCE4D6" } };
  const numFmt = "#,##0";

  const c = (ref) => ws.getCell(ref);
  const style = (ref, opts) => {
    const cell = ws.getCell(ref);
    if (opts.v !== undefined)   cell.value     = opts.v;
    if (opts.font)              cell.font      = opts.font;
    if (opts.fill)              cell.fill      = opts.fill;
    if (opts.border)            cell.border    = opts.border;
    if (opts.align)             cell.alignment = opts.align;
    if (opts.numFmt)            cell.numFmt    = opts.numFmt;
    return cell;
  };
  const merge = (r) => ws.mergeCells(r);

  // ── Logo corporativo ─────────────────────────────────────────────────────────
  try {
    const logoId = wb.addImage({
      base64: LOGO_B64,
      extension: "png",
    });
    ws.addImage(logoId, {
      tl: { col: 0.2, row: 0.1 },
      br: { col: 1.1, row: 5.1 },
    });
  } catch {}

  // ── Anchos de columna (exactos del template) ─────────────────────────────────
  ws.getColumn(1).width  = 17;      // A
  ws.getColumn(2).width  = 12.5;    // B
  ws.getColumn(3).width  = 14.7;    // C
  ws.getColumn(4).width  = 5.1;     // D
  ws.getColumn(5).width  = 16.9;    // E
  ws.getColumn(6).width  = 2.3;     // F
  ws.getColumn(7).width  = 13.4;    // G
  ws.getColumn(8).width  = 35.3;    // H
  ws.getColumn(9).width  = 35;      // I
  ws.getColumn(10).width = 6;       // J
  ws.getColumn(11).width = 30;      // K
  ws.getColumn(12).width = 32.7;    // L
  ws.getColumn(13).width = 22.4;    // M

  // ── Alturas de filas clave ────────────────────────────────────────────────────
  ws.getRow(1).height  = 15;
  ws.getRow(2).height  = 6.75;
  ws.getRow(3).height  = 15;
  ws.getRow(4).height  = 9;
  ws.getRow(5).height  = 15;
  ws.getRow(6).height  = 3.75;
  ws.getRow(7).height  = 21;
  ws.getRow(8).height  = 4.5;
  ws.getRow(10).height = 18.75;
  ws.getRow(12).height = 6;
  ws.getRow(13).height = 21;
  ws.getRow(14).height = 7.5;
  ws.getRow(16).height = 6;
  ws.getRow(18).height = 5.25;
  ws.getRow(20).height = 6.75;
  ws.getRow(21).height = 6;
  ws.getRow(23).height = 17.25;
  ws.getRow(24).height = 21;
  ws.getRow(25).height = 15;
  ws.getRow(26).height = 21.75;
  ws.getRow(27).height = 32.25;

  // ── FILA 1: Encabezado ───────────────────────────────────────────────────────
  merge("B1:B2"); style("B1", { v: "N° Operación", font: F({ bold: true }), align: { horizontal: "left", vertical: "center" } });
  merge("C1:D2"); style("C1", { v: correlativo || "", font: F({ bold: true, size: 11 }), align: { horizontal: "center", vertical: "center" } });
  merge("E1:M5");
  style("E1", {
    v: "Formulario de Rendición de Caja chica, Fondos por rendir, Reembolso de gastos 2026",
    font: F({ bold: true, size: 14 }),
    align: { horizontal: "center", vertical: "center", wrapText: true },
  });

  // ── FILA 3-5: N° Req ─────────────────────────────────────────────────────────
  merge("B3:D4"); style("B3", { v: "N° Req.", font: F({ bold: true }) });
  merge("B5:D5"); style("B5", { v: "* Uso exclusivo Control Pagos", font: F({ size: 8, italic: true }) });

  // ── FILA 7: Tipo de rendición ────────────────────────────────────────────────
  merge("A7:M7");
  style("A7", {
    v: "Tipo de rendición",
    font: F({ bold: true, size: 16 }),
    align: { horizontal: "center", vertical: "center" },
    border: { bottom: borderThin, left: borderThin, right: borderThin },
  });

  // ── FILAS 9-11: Checkboxes tipo rendición ────────────────────────────────────
  const tipoNorm = String(tipoRendicion ?? "").trim().toLowerCase();
  const tiposRend = [
    { cols: "A9:C9", key: "caja chica",          label: "Caja Chica" },
    { cols: "D9:F9", key: "fondos por rendir",    label: "Fondos por rendir" },
    { cols: "G9:I9", key: "reembolso de gastos",  label: "Reembolso de gastos" },
    { cols: "J9:M9", key: "gastos operacionales", label: "Gastos Operacionales" },
  ];
  tiposRend.forEach(({ cols, key, label }) => {
    const isActive = tipoNorm === key || tipoNorm === key.replace(/\s+/g, "");
    merge(cols);
    const startRef = cols.split(":")[0];
    style(startRef, {
      v: (isActive ? "☑ " : "☐ ") + label,
      font: F({ bold: isActive, size: 11 }),
      align: { horizontal: "center", vertical: "center" },
      border: allThin,
    });
  });
  ws.getRow(9).height = 18.75;

  // ── FILA 13: Información del responsable ─────────────────────────────────────
  merge("A13:M13");
  style("A13", {
    v: "Información del responsable",
    font: F({ bold: true, size: 16 }),
    fill: fillBlue,
    align: { horizontal: "center", vertical: "center" },
    border: allThin,
  });

  // ── FILAS 15-22: Datos responsable ───────────────────────────────────────────
  const labelStyle = { font: F({ bold: true, size: 10 }), border: allThin, align: { horizontal: "left", vertical: "center" } };
  const valueStyle = { font: F({ size: 10 }), border: allThin, align: { horizontal: "left", vertical: "center" } };

  merge("A15:C15"); style("A15", { v: "Nombre Responsable", ...labelStyle });
  merge("D15:I15"); style("D15", { v: h.responsableNombre ?? "", ...valueStyle });
  merge("J15:K15"); style("J15", { v: "Rut", ...labelStyle });
  merge("L15:M15"); style("L15", { v: h.responsableRut ?? "", ...valueStyle });
  ws.getRow(15).height = 15;

  merge("A17:C17"); style("A17", { v: "Cargo", ...labelStyle });
  merge("D17:H17"); style("D17", { v: h.cargo ?? "", ...valueStyle });
  merge("J17:M17"); style("J17", { v: h.telefono ?? "", ...valueStyle });
  style("I17", { v: "Teléfono / Cel", ...labelStyle });
  ws.getRow(17).height = 15;

  merge("A19:C19"); style("A19", { v: "Empresa", ...labelStyle });
  merge("D19:H19"); style("D19", { v: h.empresa ?? "", ...valueStyle });
  style("I19", { v: "Fecha", ...labelStyle });
  merge("J19:K19");
  merge("L19:M19"); style("L19", { v: fmtDateDDMMYYYY(new Date()), ...valueStyle });
  ws.getRow(19).height = 15;

  // ── FILA 22: Datos bancarios ──────────────────────────────────────────────────
  merge("A22:B22"); style("A22", { v: "Tipo de Cuenta", ...labelStyle });
  merge("C22:E22"); style("C22", { v: h.tipoCuenta ?? "", ...valueStyle });
  merge("F22:F22"); style("F22", { v: "", border: allThin });
  style("G22", { v: "N° Cuenta", ...labelStyle });
  merge("H22:I22"); style("H22", { v: h.numeroCuenta ?? "", ...valueStyle });
  style("J22", { v: "Banco", ...labelStyle });
  merge("L22:M22"); style("L22", { v: h.banco ?? "", ...valueStyle });
  ws.getRow(22).height = 15;

  // ── FILA 24: Información de la rendición ─────────────────────────────────────
  merge("A24:M24");
  style("A24", {
    v: "Información de la rendición",
    font: F({ bold: true, size: 16 }),
    fill: fillBlue,
    align: { horizontal: "center", vertical: "center" },
    border: allThin,
  });

  // ── FILA 26: Título correlativo ───────────────────────────────────────────────
  merge("A26:M26");
  style("A26", {
    v: correlativo || "",
    font: F({ bold: true, size: 12 }),
    align: { horizontal: "center", vertical: "center" },
  });

  // ── FILA 27: Encabezados columnas ────────────────────────────────────────────
  const hdrStyle = { font: F({ bold: true, size: 11 }), fill: fillBlue, align: { horizontal: "center", vertical: "center", wrapText: true }, border: allThin };
  style("A27", { v: "Tipo de Doc.", ...hdrStyle });
  style("B27", { v: "Fecha", ...hdrStyle });
  style("C27", { v: "N° Doc", ...hdrStyle });
  merge("D27:G27"); style("D27", { v: "Descripción", ...hdrStyle });
  style("H27", { v: "Centro de Responsabilidad", ...hdrStyle });
  style("I27", { v: "Cuenta Contable", ...hdrStyle });
  merge("J27:K27"); style("J27", { v: "Partida", ...hdrStyle });
  style("L27", { v: "Clasificación", ...hdrStyle });
  style("M27", { v: "Monto ($)", ...hdrStyle });

  // ── FILAS DE DATOS — Bloque 1: filas 28-41 (máx 14) ─────────────────────────
  const safeItems = Array.isArray(items) ? items : [];
  const sorted = [...safeItems].sort((a, b) => {
    const da = parseDateFlexible(a.fechaISO) ?? new Date(0);
    const db = parseDateFlexible(b.fechaISO) ?? new Date(0);
    return da.getTime() - db.getTime();
  });

  const BLOCK1_START = 28;
  const BLOCK1_ROWS  = 14;  // filas 28-41
  const BLOCK2_START = 58;
  const BLOCK2_ROWS  = 28;  // filas 58-85
  const MAX_ITEMS    = BLOCK1_ROWS + BLOCK2_ROWS; // 42

  const block1Items = sorted.slice(0, BLOCK1_ROWS);
  const block2Items = sorted.slice(BLOCK1_ROWS, MAX_ITEMS);

  const writeDataRow = (r, it) => {
    merge(`D${r}:G${r}`);
    merge(`J${r}:K${r}`);
    const rowBorder = allThin;
    const dataFont  = F({ size: 9 });
    const dataAlign = { vertical: "center", wrapText: true };

    const setD = (col, val, extra = {}) => {
      const cell = ws.getCell(r, col);
      cell.value     = val;
      cell.font      = extra.font  ?? dataFont;
      cell.border    = rowBorder;
      cell.alignment = { ...dataAlign, ...(extra.align ?? {}) };
      if (extra.numFmt) cell.numFmt = extra.numFmt;
    };

    setD(1,  it?.docTipo ?? "");
    setD(2,  toDisplayDate(it?.fechaISO));
    setD(3,  it?.docNumero ?? "");
    setD(4,  it?.conceptNombre || it?.detalle || "");
    setD(8,  codeName(it?.crCodigo, it?.crNombre));
    setD(9,  codeName(it?.ctaCodigo, it?.ctaNombre));
    setD(10, codeName(it?.partidaCodigo, it?.partidaNombre));
    setD(12, codeName(it?.clasificacionCodigo, it?.clasificacionNombre));
    setD(13, Number(it?.monto ?? 0), { numFmt, align: { horizontal: "right", vertical: "center" } });
    ws.getRow(r).height = 15;
  };

  // Escribir bloque 1 (siempre 14 filas, vacías si no hay datos)
  for (let i = 0; i < BLOCK1_ROWS; i++) {
    writeDataRow(BLOCK1_START + i, block1Items[i] ?? null);
  }

  // ── FILAS 43-45: Totales bloque 1 ────────────────────────────────────────────
  const sumTotal = sorted.reduce((acc, it) => acc + Number(it.monto ?? 0), 0);

  merge("H43:L43");
  style("H43", {
    v: "Total",
    font: F({ size: 12 }),
    align: { horizontal: "center", vertical: "center", wrapText: true },
    border: topMedBotThinLeftMed,
  });
  style("M43", {
    v: { formula: `SUM(M${BLOCK1_START}:M${BLOCK1_START + BLOCK1_ROWS - 1},M${BLOCK2_START}:M${BLOCK2_START + BLOCK2_ROWS - 1})`, result: sumTotal },
    font: F({ size: 12 }),
    border: topMedBotThinLeftMed,
    numFmt,
    align: { horizontal: "right", vertical: "center" },
  });
  ws.getRow(43).height = 17.25;

  merge("H44:L44");
  style("H44", {
    v: "(-) Anticipos",
    font: F({ size: 12 }),
    align: { horizontal: "center", vertical: "center", wrapText: true },
    border: topThinBotMedLeftMed,
  });
  style("M44", {
    v: "",
    font: F({ size: 12 }),
    border: topThinBotMedLeftMed,
    numFmt,
  });
  ws.getRow(44).height = 18;

  merge("H45:L45");
  style("H45", {
    v: "Total Boletas y Facturas",
    font: F({ bold: true, size: 12 }),
    align: { horizontal: "center", vertical: "center", wrapText: true },
    border: allMed,
  });
  style("M45", {
    v: { formula: "+M43+M44", result: sumTotal },
    font: F({ bold: true, size: 12 }),
    fill: fillTotal,
    border: allMed,
    numFmt,
    align: { horizontal: "right", vertical: "center" },
  });
  ws.getRow(45).height = 28.5;

  // ── FILAS 46-47: Espacio firma superior ───────────────────────────────────────
  ws.getRow(46).height = 48;
  ws.getRow(47).height = 43.5;

  // ── FILA 48: Firmas ──────────────────────────────────────────────────────────
  merge("B48:C48");
  style("B48", {
    v: "Firma Responsable del Fondo o Caja",
    font: F({ bold: true, size: 12 }),
    align: { horizontal: "center", vertical: "top", wrapText: true },
    border: { top: borderThin },
  });
  style("H48", {
    v: "Firma Aprobador",
    font: F({ bold: true, size: 12 }),
    align: { horizontal: "center", vertical: "top", wrapText: true },
    border: { top: borderThin },
  });
  style("L48", {
    v: "Firma Control Pagos",
    font: F({ bold: true, size: 12 }),
    align: { horizontal: "center", vertical: "top", wrapText: true },
    border: { top: borderThin },
  });
  ws.getRow(48).height = 50.85;

  // ── FILA 49: Título Hoja 2 ────────────────────────────────────────────────────
  merge("E49:M53");
  merge("B49:D53");
  style("E49", {
    v: "Formulario de Rendición de Caja chica, Fondos por rendir, Reembolso de gastos 2026\n(Hoja 2)",
    font: F({ bold: true, size: 14 }),
    align: { horizontal: "center", vertical: "center", wrapText: true },
  });

  // ── FILA 56: Separador ────────────────────────────────────────────────────────
  merge("A56:M56");
  style("A56", {
    v: "",
    fill: fillBlue,
    border: allThin,
  });
  ws.getRow(56).height = 17.25;

  // ── FILA 57: Encabezados bloque 2 ────────────────────────────────────────────
  style("A57", { v: "Tipo de Doc.", ...hdrStyle });
  style("B57", { v: "Fecha", ...hdrStyle });
  style("C57", { v: "N° Doc", ...hdrStyle });
  merge("D57:G57"); style("D57", { v: "Detalle", ...hdrStyle });
  style("H57", { v: "Centro de Responsabilidad", ...hdrStyle });
  style("I57", { v: "Cuenta Contable", ...hdrStyle });
  merge("J57:K57"); style("J57", { v: "Partida", ...hdrStyle });
  style("L57", { v: "Clasificación", ...hdrStyle });
  style("M57", { v: "Monto ($)", ...hdrStyle });
  ws.getRow(57).height = 34.5;

  // Escribir bloque 2 (siempre 28 filas)
  for (let i = 0; i < BLOCK2_ROWS; i++) {
    writeDataRow(BLOCK2_START + i, block2Items[i] ?? null);
  }

  ws.getRow(85).height = 15.75;

  // ── FILAS 86-103: Resumen interno ────────────────────────────────────────────
  ws.getRow(86).height = 17.25;
  ws.getRow(87).height = 18;
  ws.getRow(88).height = 18;

  merge("H86:M87");
  style("H86", {
    v: "Resumen",
    font: F({ bold: true, size: 12 }),
    fill: fillBlue,
    align: { horizontal: "center", vertical: "center" },
    border: allThin,
  });

  // Encabezados resumen interno
  style("H88", { v: "Tipo", font: F({ bold: true }), fill: fillBlue, border: allThin, align: { horizontal: "center", vertical: "center" } });
  style("I88", { v: "Cuenta", font: F({ bold: true }), fill: fillBlue, border: allThin, align: { horizontal: "center", vertical: "center" } });
  merge("J88:K88"); style("J88", { v: "Partida", font: F({ bold: true }), fill: fillBlue, border: allThin, align: { horizontal: "center", vertical: "center" } });
  style("L88", { v: "Clasificación", font: F({ bold: true }), fill: fillBlue, border: allThin, align: { horizontal: "center", vertical: "center" } });
  style("M88", { v: "Monto", font: F({ bold: true }), fill: fillBlue, border: allThin, align: { horizontal: "center", vertical: "center" } });

  // Agrupar gastos para resumen (igual que el original)
  const grouped = new Map();
  for (const it of sorted) {
    const tipo   = codeName(it.crCodigo, it.crNombre) || "";
    const cuenta = codeName(it.ctaCodigo, it.ctaNombre) || "";
    const partida = codeName(it.partidaCodigo, it.partidaNombre) || "";
    const clasif = codeName(it.clasificacionCodigo, it.clasificacionNombre) || "";
    const key = `${tipo}|${cuenta}|${partida}|${clasif}`;
    grouped.set(key, (grouped.get(key) ?? 0) + Number(it.monto ?? 0));
  }

  let resumRow = 89;
  for (const [key, monto] of grouped) {
    const [tipo, cuenta, partida, clasif] = key.split("|");
    merge(`J${resumRow}:K${resumRow}`);
    style(`H${resumRow}`, { v: tipo,    font: F(), border: allThin, align: { vertical: "center" } });
    style(`I${resumRow}`, { v: cuenta,  font: F(), border: allThin, align: { vertical: "center" } });
    style(`J${resumRow}`, { v: partida, font: F(), border: allThin, align: { vertical: "center" } });
    style(`L${resumRow}`, { v: clasif,  font: F(), border: allThin, align: { vertical: "center" } });
    style(`M${resumRow}`, { v: monto,   font: F(), border: allThin, numFmt, align: { horizontal: "right", vertical: "center" } });
    ws.getRow(resumRow).height = 17.25;
    resumRow++;
  }

  // Total resumen
  merge(`H${resumRow}:L${resumRow}`);
  style(`H${resumRow}`, {
    v: "Total",
    font: F({ bold: true, size: 11 }),
    fill: fillTotal,
    border: allThin,
    align: { horizontal: "center", vertical: "center" },
  });
  style(`M${resumRow}`, {
    v: { formula: `SUM(M89:M${resumRow - 1})`, result: sumTotal },
    font: F({ bold: true, size: 11 }),
    fill: fillTotal,
    border: allThin,
    numFmt,
    align: { horizontal: "right", vertical: "center" },
  });
  ws.getRow(resumRow).height = 18;

  // ── Hoja 2 Resumen externo ────────────────────────────────────────────────────
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
