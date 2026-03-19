import ExcelJS from "exceljs";
import { getSettings, getDB } from "../db.js";
import { TEMPLATE_B64 } from "./excelTemplate.js";

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
  // Cargar template limpio (sin VML/checkboxes, con logo intacto)
  const binaryStr = atob(TEMPLATE_B64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

  // Copiar a ArrayBuffer propio para evitar problemas con SharedArrayBuffer en Safari
  const buf = bytes.buffer.slice(0);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);

  const ws = wb.getWorksheet("Formulario");
  if (!ws) throw new Error("Hoja Formulario no encontrada en template");

  const settings = await getSettings();
  const h = { ...settings, ...headerOverrides };

  // ── Datos responsable ────────────────────────────────────────────────────────
  ws.getCell("D15").value = h.responsableNombre ?? "";
  ws.getCell("L15").value = h.responsableRut ?? "";
  ws.getCell("D17").value = h.cargo ?? "";
  ws.getCell("L17").value = h.telefono ?? "";
  ws.getCell("D19").value = h.empresa ?? "";
  ws.getCell("L19").value = fmtDateDDMMYYYY(new Date());

  // ── Datos bancarios ──────────────────────────────────────────────────────────
  ws.getCell("C22").value = h.tipoCuenta ?? "";
  ws.getCell("H22").value = h.numeroCuenta ?? "";
  ws.getCell("L22").value = h.banco ?? "";

  // ── Tipo de rendición — activar celda linked al checkbox correspondiente ─────
  // Las celdas A11/D11/H11/K11 son boolean linked cells de los 4 checkboxes.
  // Poner TRUE en la celda correcta activa el checkbox al abrir el archivo en Excel.
  const tipoNorm = String(tipoRendicion ?? "").trim().toLowerCase();
  const checkCell = TIPO_REND_CELL[tipoNorm] ?? null;
  ["A11", "D11", "H11", "K11"].forEach((ref) => {
    ws.getCell(ref).value = false;
  });
  if (checkCell) {
    ws.getCell(checkCell).value = true;
  }

  // ── Filas de datos ───────────────────────────────────────────────────────────
  const safeItems = Array.isArray(items) ? items : [];
  const sorted = [...safeItems].sort((a, b) => {
    const da = parseDateFlexible(a.fechaISO) ?? new Date(0);
    const db = parseDateFlexible(b.fechaISO) ?? new Date(0);
    return da.getTime() - db.getTime();
  });

  const DATA_START   = 28;
  const TEMPLATE_ROWS = 14; // filas 28-41 preformateadas en el template

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
    ws.getCell(r, 4).value  = it.conceptNombre || it.detalle || "";
    ws.getCell(r, 8).value  = codeName(it.crCodigo, it.crNombre);
    ws.getCell(r, 9).value  = codeName(it.ctaCodigo, it.ctaNombre);
    ws.getCell(r, 10).value = codeName(it.partidaCodigo, it.partidaNombre);
    ws.getCell(r, 12).value = codeName(it.clasificacionCodigo, it.clasificacionNombre);
    ws.getCell(r, 13).value = Number(it.monto ?? 0);
  });

  // ── Fórmulas de totales ──────────────────────────────────────────────────────
  const lastDataRow = DATA_START + Math.max(sorted.length, TEMPLATE_ROWS) - 1;
  const sumTotal    = sorted.reduce((acc, it) => acc + Number(it.monto ?? 0), 0);

  if (sorted.length > TEMPLATE_ROWS) {
    // Los datos sobrepasan las filas del template: escribir totales justo después
    const totalRowNum = lastDataRow + 2;

    // Copiar estilo de M43 (total del template) al nuevo total
    const origTotalCell = ws.getCell("M43");
    const newTotal = ws.getCell(`M${totalRowNum}`);
    newTotal.value  = { formula: `SUM(M${DATA_START}:M${lastDataRow})`, result: sumTotal };
    newTotal.numFmt = origTotalCell.numFmt || "#,##0";
    if (origTotalCell.font)   newTotal.font   = { ...origTotalCell.font };
    if (origTotalCell.fill)   newTotal.fill   = { ...origTotalCell.fill };
    if (origTotalCell.border) newTotal.border = { ...origTotalCell.border };

    // Etiqueta "Total"
    const origHdrCell = ws.getCell("H43");
    ws.getCell(`H${totalRowNum}`).value = "Total";
    if (origHdrCell.font) ws.getCell(`H${totalRowNum}`).font = { ...origHdrCell.font };

    // Total neto = Total + Anticipos (anticipos vacíos → 0)
    const netoCell = ws.getCell(`M${totalRowNum + 2}`);
    netoCell.value  = { formula: `+M${totalRowNum}+M${totalRowNum + 1}`, result: sumTotal };
    netoCell.numFmt = "#,##0";
  } else {
    // Con ≤14 filas los totales del template están en filas 43-45 en su posición original.
    ws.getCell("M43").value = {
      formula: `SUM(M${DATA_START}:M${DATA_START + TEMPLATE_ROWS - 1})`,
      result: sumTotal,
    };
    ws.getCell("M45").value = {
      formula: "+M43+M44",
      result: sumTotal,
    };
  }

  // ── Hoja 2: Resumen agrupado por CR / Cuenta / Partida ───────────────────────
  buildResumenSheet(wb, sorted, correlativo);

  // Limpiar imágenes antes de exportar — ExcelJS tiene un bug con anchors
  // en Safari/iOS que hace fallar el writeBuffer. Se pierde el logo pero
  // todos los datos, fórmulas y formato quedan intactos.
  wb.worksheets.forEach((sheet) => {
    try { sheet._drawings = []; } catch {}
    try { if (sheet.model) sheet.model.drawings = []; } catch {}
  });

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
