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

export async function generateBatchXlsxBlob({ correlativo, headerOverrides = {}, items }) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Formulario");

  const settings = await getSettings();
  const h = { ...settings, ...headerOverrides };

  // ─── helpers de estilo ───────────────────────────────────────────────
  const thin = { style: "thin", color: { argb: "FF000000" } };
  const medium = { style: "medium", color: { argb: "FF000000" } };
  const allBorders = (t = thin) => ({ top: t, left: t, bottom: t, right: t });
  const fillSolid = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });

  // Azul oscuro corporativo (cabeceras de sección)
  const AZUL_HEADER  = "FF1F3864"; // azul muy oscuro
  const AZUL_TABLA   = "FF2F5496"; // azul medio (encabezado tabla)
  const GRIS_LABEL   = "FFF2F2F2"; // gris claro (labels de campos)
  const GRIS_DATA    = "FFFFFFFF"; // blanco (celdas de datos)
  const AMARILLO     = "FFFFF2CC"; // amarillo suave (total)

  const styleHeader = (cell, text) => {
    cell.value = text;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11, name: "Arial" };
    cell.fill = fillSolid(AZUL_HEADER);
    cell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  };

  const styleLabel = (cell, text) => {
    cell.value = text;
    cell.font = { bold: true, size: 9, name: "Arial" };
    cell.fill = fillSolid(GRIS_LABEL);
    cell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    cell.border = allBorders();
  };

  const styleData = (cell, value = "") => {
    cell.value = value;
    cell.font = { size: 10, name: "Arial" };
    cell.fill = fillSolid(GRIS_DATA);
    cell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    cell.border = allBorders();
  };

  // ─── anchos de columnas (A=17, B=12.5, C=14.7, D=5.1, E=16.9, F=2.3,
  //      G=13.4, H=35.3, I=35, J=6, K=30, L=32.7, M=22.4) ────────────
  ws.columns = [
    { key: "A", width: 17 },
    { key: "B", width: 12.5 },
    { key: "C", width: 14.7 },
    { key: "D", width: 5.1 },
    { key: "E", width: 16.9 },
    { key: "F", width: 2.3 },
    { key: "G", width: 13.4 },
    { key: "H", width: 35.3 },
    { key: "I", width: 35 },
    { key: "J", width: 6 },
    { key: "K", width: 30 },
    { key: "L", width: 32.7 },
    { key: "M", width: 22.4 },
  ];

  // ─── FILA 1-5: título + N° operación ─────────────────────────────────
  ws.getRow(1).height = 15;
  ws.getRow(2).height = 6;
  ws.getRow(3).height = 15;
  ws.getRow(4).height = 9;
  ws.getRow(5).height = 15;

  // N° Operación (esquina sup-izq, en blanco — uso exclusivo finanzas)
  ws.getCell("A1").value = "N° Operación";
  ws.getCell("A1").font = { bold: false, size: 9, name: "Arial" };
  ws.getCell("A1").border = allBorders();

  ws.getCell("A3").value = "N° Req.";
  ws.getCell("A3").font = { bold: false, size: 9, name: "Arial" };
  ws.getCell("A3").border = allBorders();

  ws.getCell("B1").value = "";
  ws.getCell("B1").border = allBorders();
  ws.getCell("B3").value = "";
  ws.getCell("B3").border = allBorders();

  ws.getCell("A5").value = "* Uso exclusivo Control Pagos";
  ws.getCell("A5").font = { italic: true, size: 8, color: { argb: "FF888888" }, name: "Arial" };

  // Título principal (E1:M5)
  ws.mergeCells("E1:M5");
  const titleCell = ws.getCell("E1");
  titleCell.value = "Formulario de Rendición de Caja Chica,\nFondos por Rendir, Reembolso de Gastos";
  titleCell.font = { bold: true, size: 16, name: "Arial", color: { argb: "FF1F3864" } };
  titleCell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  titleCell.border = { ...allBorders(medium) };

  // ─── FILA 7: Tipo de rendición (sección header) ───────────────────────
  ws.getRow(7).height = 21;
  ws.mergeCells("A7:M7");
  styleHeader(ws.getCell("A7"), "Tipo de Rendición");

  // Fila 8-11: checkboxes — solo marcamos Reembolso de Gastos
  ws.getRow(8).height = 18;
  ws.getRow(9).height = 14;
  ws.getRow(10).height = 18;
  ws.getRow(11).height = 14;

  ws.getCell("A8").value = "☐  Caja Chica";
  ws.getCell("A8").font = { size: 10, name: "Arial" };
  ws.getCell("E8").value = "☐  Fondo por Rendir";
  ws.getCell("E8").font = { size: 10, name: "Arial" };
  ws.getCell("H8").value = "☑  Reembolso de Gastos";
  ws.getCell("H8").font = { bold: true, size: 10, name: "Arial" };

  // ─── FILA 13: Información del responsable ─────────────────────────────
  ws.getRow(13).height = 21;
  ws.mergeCells("A13:M13");
  styleHeader(ws.getCell("A13"), "Información del Responsable");

  ws.getRow(14).height = 7;

  // Fila 15: Nombre + RUT
  ws.getRow(15).height = 18;
  styleLabel(ws.getCell("A15"), "Nombre Responsable");
  ws.mergeCells("B15:I15");
  styleData(ws.getCell("B15"), h.responsableNombre ?? "");
  styleLabel(ws.getCell("J15"), "RUT");
  ws.mergeCells("K15:M15");
  styleData(ws.getCell("K15"), h.responsableRut ?? "");

  ws.getRow(16).height = 6;

  // Fila 17: Cargo + Teléfono
  ws.getRow(17).height = 18;
  styleLabel(ws.getCell("A17"), "Cargo");
  ws.mergeCells("B17:I17");
  styleData(ws.getCell("B17"), h.cargo ?? "");
  styleLabel(ws.getCell("J17"), "Teléfono / Cel");
  ws.mergeCells("K17:M17");
  styleData(ws.getCell("K17"), h.telefono ?? "");

  ws.getRow(18).height = 5;

  // Fila 19: Empresa + Fecha
  ws.getRow(19).height = 18;
  styleLabel(ws.getCell("A19"), "Empresa");
  ws.mergeCells("B19:I19");
  styleData(ws.getCell("B19"), h.empresa ?? "");
  styleLabel(ws.getCell("J19"), "Fecha");
  ws.mergeCells("K19:M19");
  styleData(ws.getCell("K19"), fmtDateDDMMYYYY(new Date()));

  ws.getRow(20).height = 7;

  // ─── FILA 21: Datos bancarios ──────────────────────────────────────────
  ws.getRow(21).height = 6;

  // Fila 22: Tipo cuenta + N° cuenta + Banco
  ws.getRow(22).height = 18;
  styleLabel(ws.getCell("A22"), "Tipo de Cuenta");
  ws.mergeCells("B22:F22");
  styleData(ws.getCell("B22"), h.tipoCuenta ?? "");
  styleLabel(ws.getCell("G22"), "N° Cuenta");
  ws.mergeCells("H22:I22");
  styleData(ws.getCell("H22"), h.numeroCuenta ?? "");
  styleLabel(ws.getCell("J22"), "Banco");
  ws.mergeCells("K22:M22");
  styleData(ws.getCell("K22"), h.banco ?? "");

  ws.getRow(23).height = 17;

  // ─── FILA 24: Información de la rendición ─────────────────────────────
  ws.getRow(24).height = 21;
  ws.mergeCells("A24:M24");
  styleHeader(ws.getCell("A24"), "Información de la Rendición");

  ws.getRow(25).height = 15;

  // Fila 25: N° Rendición + Total
  styleLabel(ws.getCell("A25"), "N° Rendición");
  ws.mergeCells("B25:C25");
  styleData(ws.getCell("B25"), correlativo ?? "");
  styleLabel(ws.getCell("G25"), "Total Rendición");
  ws.mergeCells("H25:I25");
  const totalCell = ws.getCell("H25");
  totalCell.font = { bold: true, size: 11, name: "Arial" };
  totalCell.fill = fillSolid(AMARILLO);
  totalCell.alignment = { vertical: "middle", horizontal: "right", indent: 1 };
  totalCell.border = allBorders(medium);

  ws.getRow(26).height = 22;

  // ─── FILA 27: Encabezado tabla ─────────────────────────────────────────
  ws.getRow(27).height = 32;
  const tableCols = [
    { col: "A", label: "Tipo de Doc." },
    { col: "B", label: "Fecha" },
    { col: "C", label: "N° Doc" },
    { col: "D", label: "Descripción", merge: "D27:G27" },
    { col: "H", label: "Centro de\nResponsabilidad" },
    { col: "I", label: "Cuenta Contable" },
    { col: "J", label: "Partida", merge: "J27:K27" },
    { col: "L", label: "Clasificación" },
    { col: "M", label: "Monto ($)" },
  ];

  tableCols.forEach(({ col, label, merge }) => {
    if (merge) ws.mergeCells(merge);
    const cell = ws.getCell(`${col}27`);
    cell.value = label;
    cell.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" }, name: "Arial" };
    cell.fill = fillSolid(AZUL_TABLA);
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = allBorders();
  });

  // ─── FILAS DE DATOS ────────────────────────────────────────────────────
  const safeItems = Array.isArray(items) ? items : [];
  const allItems = [...safeItems].sort((a, b) => {
    const da = parseDateFlexible(a.fechaISO) ?? new Date(0);
    const db = parseDateFlexible(b.fechaISO) ?? new Date(0);
    return da.getTime() - db.getTime();
  });

  const DATA_START = 28;
  let r = DATA_START;

  const stripeA = "FFDCE6F1"; // azul muy suave
  const stripeB = "FFFFFFFF"; // blanco

  allItems.forEach((it, idx) => {
    ws.getRow(r).height = 16;
    const bg = idx % 2 === 0 ? stripeA : stripeB;

    const rowCells = [
      { col: "A", val: it.docTipo ?? "" },
      { col: "B", val: toDisplayDate(it.fechaISO) },
      { col: "C", val: it.docNumero ?? "" },
      { col: "D", val: it.detalle ?? "", merge: `D${r}:G${r}` },
      { col: "H", val: codeName(it.crCodigo, it.crNombre) },
      { col: "I", val: codeName(it.ctaCodigo, it.ctaNombre) },
      { col: "J", val: codeName(it.partidaCodigo, it.partidaNombre), merge: `J${r}:K${r}` },
      { col: "L", val: codeName(it.clasificacionCodigo, it.clasificacionNombre) },
      { col: "M", val: Number(it.monto ?? 0), numFmt: '"$"#,##0', alignRight: true },
    ];

    rowCells.forEach(({ col, val, merge, numFmt, alignRight }) => {
      if (merge) ws.mergeCells(merge);
      const cell = ws.getCell(`${col}${r}`);
      cell.value = val;
      cell.font = { size: 9, name: "Arial" };
      cell.fill = fillSolid(bg);
      cell.alignment = { vertical: "middle", horizontal: alignRight ? "right" : "left", indent: alignRight ? 0 : 1, wrapText: false };
      cell.border = allBorders();
      if (numFmt) cell.numFmt = numFmt;
    });

    r += 1;
  });

  // ─── FILA TOTAL ────────────────────────────────────────────────────────
  ws.getRow(r).height = 18;
  ws.mergeCells(`A${r}:L${r}`);
  const totalLabelCell = ws.getCell(`A${r}`);
  totalLabelCell.value = "TOTAL GENERAL";
  totalLabelCell.font = { bold: true, size: 11, name: "Arial", color: { argb: "FFFFFFFF" } };
  totalLabelCell.fill = fillSolid(AZUL_TABLA);
  totalLabelCell.alignment = { vertical: "middle", horizontal: "right", indent: 2 };
  totalLabelCell.border = allBorders(medium);

  const totalValueCell = ws.getCell(`M${r}`);
  const sumFormula = `SUM(M${DATA_START}:M${r - 1})`;
  totalValueCell.value = { formula: sumFormula };
  totalValueCell.numFmt = '"$"#,##0';
  totalValueCell.font = { bold: true, size: 11, name: "Arial" };
  totalValueCell.fill = fillSolid(AMARILLO);
  totalValueCell.alignment = { vertical: "middle", horizontal: "right" };
  totalValueCell.border = allBorders(medium);

  // Actualizar celda H25 con el mismo total
  ws.getCell("H25").value = { formula: sumFormula };
  ws.getCell("H25").numFmt = '"$"#,##0';

  // ─── Freeze header + autofilter ───────────────────────────────────────
  ws.views = [{ state: "frozen", ySplit: 27 }];
  ws.autoFilter = {
    from: { row: 27, column: 1 },
    to: { row: 27, column: 13 },
  };

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
