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

  const ws = wb.addWorksheet("Formulario");

  // ── Logo ─────────────────────────────────────────────────────────────────────
  try {
    const logoId = wb.addImage({ base64: LOGO_B64, extension: "png" });
    ws.addImage(logoId, { tl: { col: 0.176, row: 0.450 }, br: { col: 0.889, row: 4.605 } });
  } catch {}

  // ── Colores exactos del template corporativo ─────────────────────────────────
  const BLUE_HDR  = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4472C4" } }; // azul secciones
  const BLUE_COL  = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4472C4" } }; // azul encabezados col
  const ORANGE    = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFCE4D6" } }; // total neto
  const numFmt    = "#,##0";

  const thin   = { style: "thin" };
  const med    = { style: "medium" };
  const allT   = { top: thin,  bottom: thin,  left: thin,  right: thin  };
  const allM   = { top: med,   bottom: med,   left: med,   right: thin  };
  const topMbotT = { top: med, bottom: thin,  left: med,   right: thin  };
  const topTbotM = { top: thin, bottom: med,  left: med,   right: thin  };

  const F = (o={}) => ({ name: "Calibri", size: 9, ...o });
  const WHITE = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } };

  const s = (ref, v, opts={}) => {
    const cell = ws.getCell(ref);
    if (v !== undefined) cell.value = v;
    if (opts.font)   cell.font      = opts.font;
    if (opts.fill)   cell.fill      = opts.fill;
    if (opts.border) cell.border    = opts.border;
    if (opts.align)  cell.alignment = opts.align;
    if (opts.numFmt) cell.numFmt    = opts.numFmt;
    return cell;
  };
  const m = (r) => { try { ws.mergeCells(r); } catch {} };
  const aC = { horizontal: "center", vertical: "middle" };
  const aL = { horizontal: "left",   vertical: "middle" };
  const aR = { horizontal: "right",  vertical: "middle" };
  const aW = { horizontal: "center", vertical: "middle", wrapText: true };

  // ── Anchos de columna exactos ────────────────────────────────────────────────
  ws.getColumn(1).width  = 17;
  ws.getColumn(2).width  = 12.57;
  ws.getColumn(3).width  = 14.71;
  ws.getColumn(4).width  = 5.14;
  ws.getColumn(5).width  = 16.86;
  ws.getColumn(6).width  = 2.29;
  ws.getColumn(7).width  = 13.43;
  ws.getColumn(8).width  = 35.29;
  ws.getColumn(9).width  = 35;
  ws.getColumn(10).width = 6;
  ws.getColumn(11).width = 30;
  ws.getColumn(12).width = 32.71;
  ws.getColumn(13).width = 22.43;

  // ── Alturas de fila exactas ──────────────────────────────────────────────────
  const rh = { 1:15, 2:6.75, 3:15, 4:9, 5:15, 6:3.75, 7:21, 8:4.5,
               10:18.75, 12:6, 13:21, 14:7.5, 16:6, 18:5.25, 20:6.75,
               21:6, 23:17.25, 24:21, 25:15, 26:21.75, 27:32.25,
               42:18, 43:17.25, 44:18, 45:28.5, 46:48, 47:43.5, 48:50.85 };
  for (const [r, h2] of Object.entries(rh)) ws.getRow(Number(r)).height = h2;

  // ── FILA 1-5: Header ─────────────────────────────────────────────────────────
  m("B1:B2");   s("B1", "N° Operación", { font: F({bold:true}), align: aL });
  m("C1:D2");   s("C1", correlativo || "", { font: F({bold:true,size:11}), align: aC, border: allT });
  m("E1:M5");
  s("E1",
    "Formulario de Rendición de Caja chica, Fondos por rendir, Reembolso de gastos 2026",
    { font: { name:"Calibri", size:20, bold:true, color:{argb:"FFFFFFFF"} },
      fill: BLUE_HDR, align: { horizontal:"center", vertical:"middle", wrapText:true } });

  m("B3:D4"); s("B3", "N° Req.",                      { font: F({bold:true}), align: aL });
  m("B5:D5"); s("B5", "* Uso exclusivo Control Pagos", { font: F({size:8, italic:true}), align: aL });

  // ── FILA 7: Tipo de rendición ────────────────────────────────────────────────
  m("A7:M7");
  s("A7", "Tipo de rendición",
    { font: WHITE, fill: BLUE_HDR, align: aC,
      border: { bottom: thin, left: thin, right: thin } });

  // ── FILA 9: Checkboxes tipo rendición ────────────────────────────────────────
  const tipoNorm = String(tipoRendicion ?? "").trim().toLowerCase();
  const checkMap = [
    { start:"A9", end:"C9",  key:"caja chica",           label:"Caja Chica" },
    { start:"D9", end:"G9",  key:"fondos por rendir",    label:"Reembolso de Fondos" },
    { start:"H9", end:"I9",  key:"reembolso de gastos",  label:"Reembolso de gastos" },
    { start:"J9", end:"M9",  key:"gastos operacionales", label:"Rendición de Gastos" },
  ];
  checkMap.forEach(({ start, end, key, label }) => {
    const isActive = tipoNorm === key || tipoNorm === key.replace(/\s+/g,"");
    m(`${start}:${end}`);
    s(start, (isActive ? "☑ " : "☐ ") + label, {
      font: F({ bold: isActive, size: 11 }),
      align: { horizontal:"left", vertical:"middle" },
    });
  });
  ws.getRow(9).height = 18.75;
  // ── FILA 11: Número de Fondo por rendir ───────────────────────────────────────
  m("J11:K11");
  s("J11", "Número de Fondo por rendir", { font: F({bold:true,size:11}), align: aR });
  m("L11:M11");
  s("L11", "", { border: allT });

  // ── FILA 13: Información del responsable ─────────────────────────────────────
  m("A13:M13");
  s("A13", "Información del responsable",
    { font: WHITE, fill: BLUE_HDR, align: aC, border: allT });

  // ── FILAS 15-22: Datos responsable ───────────────────────────────────────────
  const lbl = { font: F({bold:true,size:10}), border: allT, align: aL };
  const val = { font: F({size:10}),           border: allT, align: aL };

  s("A15","Nombre Responsable",lbl); m("A15:C15");
  m("D15:H15"); s("D15", h.responsableNombre ?? "", val);
  s("I15","", { border: allT });
  s("J15","Rut",lbl);
  m("L15:M15"); s("L15", h.responsableRut ?? "", val);

  s("A17","Cargo",lbl); m("A17:C17");
  m("D17:H17"); s("D17", h.cargo ?? "", val);
  s("I17","", { border: allT });
  s("J17","Teléfono / Cel",lbl);
  m("L17:M17"); s("L17", h.telefono ?? "", val);

  s("A19","Empresa",lbl); m("A19:C19");
  m("D19:H19"); s("D19", h.empresa ?? "", val);
  s("I19","", { border: allT });
  s("J19","Fecha",lbl);
  m("L19:M19"); s("L19", fmtDateDDMMYYYY(new Date()), val);

  // ── FILA 22: Datos bancarios ──────────────────────────────────────────────────
  s("A22","Tipo de Cuenta",lbl); m("A22:B22");
  m("C22:E22"); s("C22", h.tipoCuenta ?? "", val);
  s("G22","N° Cuenta",lbl);
  s("H22", h.numeroCuenta ?? "", val); m("H22:I22");
  s("J22","Banco",lbl);
  m("L22:M22"); s("L22", h.banco ?? "", val);

  // ── FILA 24: Información de la rendición ─────────────────────────────────────
  m("A24:M24");
  s("A24","Información de la rendición",
    { font: WHITE, fill: BLUE_HDR, align: aC, border: allT });

  // ── FILA 26: Correlativo ──────────────────────────────────────────────────────
  m("A26:M26");
  s("A26", correlativo || "", { font: F({bold:true,size:12}), align: aC });

  // ── FILA 27: Encabezados columnas ────────────────────────────────────────────
  const hdr = { font: F({size:11, bold:true}), border: allT, align: aW };
  s("A27","Tipo de Doc.",hdr);
  s("B27","Fecha",hdr);
  s("C27","N° Doc",hdr);
  m("D27:G27"); s("D27","Descripción",hdr);
  s("H27","Centro de Responsabilidad",hdr);
  s("I27","Cuenta Contable",hdr);
  m("J27:K27"); s("J27","Partida",hdr);
  s("L27","Clasificación",hdr);
  s("M27","Monto ($)",hdr);

  // ── DATOS: 2 bloques exactos del template ────────────────────────────────────
  const safeItems = Array.isArray(items) ? items : [];
  const sorted = [...safeItems].sort((a,b) => {
    const da = parseDateFlexible(a.fechaISO) ?? new Date(0);
    const db = parseDateFlexible(b.fechaISO) ?? new Date(0);
    return da - db;
  });

  const B1S = 28, B1R = 14;   // bloque 1: filas 28-41
  const B2S = 58, B2R = 28;   // bloque 2: filas 58-85
  const b1 = sorted.slice(0, B1R);
  const b2 = sorted.slice(B1R, B1R + B2R);

  const writeRow = (r, it) => {
    m(`D${r}:G${r}`); m(`J${r}:K${r}`);
    ws.getRow(r).height = 15;
    const d = (col, val2, extra={}) => {
      const cell = ws.getCell(r, col);
      cell.value     = val2;
      cell.font      = F({size:9});
      cell.border    = allT;
      cell.alignment = { ...aL, wrapText: true };
      if (extra.numFmt) cell.numFmt    = extra.numFmt;
      if (extra.align)  cell.alignment = extra.align;
    };
    if (!it) {
      // fila vacía con bordes
      [1,2,3,4,8,9,10,12,13].forEach(c => d(c, ""));
      return;
    }
    d(1,  it.docTipo ?? "");
    d(2,  toDisplayDate(it.fechaISO));
    d(3,  it.docNumero ?? "");
    d(4,  it.conceptNombre || it.detalle || "");
    d(8,  codeName(it.crCodigo, it.crNombre));
    d(9,  codeName(it.ctaCodigo, it.ctaNombre));
    d(10, codeName(it.partidaCodigo, it.partidaNombre));
    d(12, codeName(it.clasificacionCodigo, it.clasificacionNombre));
    d(13, Number(it.monto ?? 0), { numFmt, align: { ...aR } });
  };

  for (let i = 0; i < B1R; i++) writeRow(B1S + i, b1[i] ?? null);

  // ── FILAS 43-45: Totales ─────────────────────────────────────────────────────
  const sumTotal = sorted.reduce((a,it) => a + Number(it.monto ?? 0), 0);

  m("H43:L43");
  s("H43","Total", { font: F({size:12}), align: aW, border: topMbotT });
  s("M43",
    { formula: `SUM(M${B1S}:M${B1S+B1R-1},M${B2S}:M${B2S+B2R-1})`, result: sumTotal },
    { font: F({size:12}), border: topMbotT, numFmt, align: aR });

  m("H44:L44");
  s("H44","(-) Anticipos", { font: F({size:12}), align: aW, border: topTbotM });
  s("M44", 0, { font: F({size:12}), border: topTbotM, numFmt, align: aR });

  m("H45:L45");
  s("H45","Total Boletas y Facturas",
    { font: F({bold:true,size:12}), align: aW, border: allM });
  s("M45",
    { formula: "+M43+M44", result: sumTotal },
    { font: F({bold:true,size:12}), fill: ORANGE, border: allM, numFmt, align: aR });

  // ── FILAS 46-48: Espacio + Firmas ────────────────────────────────────────────
  m("B48:C48");
  s("B48","Firma Responsable del Fondo o Caja",
    { font: F({bold:true,size:12}), align:{horizontal:"center",vertical:"top",wrapText:true},
      border:{top:thin} });
  s("H48","Firma Aprobador",
    { font: F({bold:true,size:12}), align:{horizontal:"center",vertical:"top",wrapText:true},
      border:{top:thin} });
  s("L48","Firma Control Pagos",
    { font: F({bold:true,size:12}), align:{horizontal:"center",vertical:"top",wrapText:true},
      border:{top:thin} });

  // ── FILA 49-53: Título Hoja 2 ────────────────────────────────────────────────
  m("E49:M53");
  s("E49",
    "Formulario de Rendición de Caja chica, Fondos por rendir, Reembolso de gastos 2026\n(Hoja 2)",
    { font: { name:"Calibri", size:14, bold:true, color:{argb:"FFFFFFFF"} },
      fill: BLUE_HDR, align:{horizontal:"center",vertical:"middle",wrapText:true} });
  m("B49:D53");

  // ── FILA 56: Separador ────────────────────────────────────────────────────────
  m("A56:M56");
  s("A56","", { fill: BLUE_HDR, border: allT });
  ws.getRow(56).height = 17.25;

  // ── FILA 57: Encabezados bloque 2 ────────────────────────────────────────────
  s("A57","Tipo de Doc.",hdr);
  s("B57","Fecha",hdr);
  s("C57","N° Doc",hdr);
  m("D57:G57"); s("D57","Detalle",hdr);
  s("H57","Centro de Responsabilidad",hdr);
  s("I57","Cuenta Contable",hdr);
  m("J57:K57"); s("J57","Partida",hdr);
  s("L57","Clasificación",hdr);
  s("M57","Monto ($)",hdr);
  ws.getRow(57).height = 34.5;

  for (let i = 0; i < B2R; i++) writeRow(B2S + i, b2[i] ?? null);
  ws.getRow(85).height = 15.75;

  // ── FILAS 86+: Resumen interno ────────────────────────────────────────────────
  ws.getRow(86).height = 17.25;
  ws.getRow(87).height = 18;
  ws.getRow(88).height = 18;
  m("H86:M87");
  s("H86","Resumen",
    { font:{name:"Calibri",size:12,bold:true,color:{argb:"FFFFFFFF"}},
      fill: BLUE_HDR, align: aC, border: allT });
  const rh2 = { font:{name:"Calibri",size:9,bold:true,color:{argb:"FFFFFFFF"}}, fill:BLUE_COL, border:allT, align:aW };
  s("H88","Tipo",rh2);
  s("I88","Cuenta",rh2);
  m("J88:K88"); s("J88","Partida",rh2);
  s("L88","Clasificación",rh2);
  s("M88","Monto",rh2);

  const grouped = new Map();
  for (const it of sorted) {
    const k = [
      codeName(it.crCodigo,it.crNombre)||"",
      codeName(it.ctaCodigo,it.ctaNombre)||"",
      codeName(it.partidaCodigo,it.partidaNombre)||"",
      codeName(it.clasificacionCodigo,it.clasificacionNombre)||"",
    ].join("|");
    grouped.set(k, (grouped.get(k)||0) + Number(it.monto||0));
  }
  let rr = 89;
  for (const [k, monto] of grouped) {
    const [tipo,cuenta,partida,clasif] = k.split("|");
    m(`J${rr}:K${rr}`);
    s(`H${rr}`,tipo,   {font:F(),border:allT,align:aL});
    s(`I${rr}`,cuenta, {font:F(),border:allT,align:aL});
    s(`J${rr}`,partida,{font:F(),border:allT,align:aL});
    s(`L${rr}`,clasif, {font:F(),border:allT,align:aL});
    s(`M${rr}`,monto,  {font:F(),border:allT,numFmt,align:aR});
    ws.getRow(rr).height = 17.25;
    rr++;
  }
  m(`H${rr}:L${rr}`);
  s(`H${rr}`,"Total",
    {font:F({bold:true,size:11}),fill:ORANGE,border:allT,align:aC});
  s(`M${rr}`,
    {formula:`SUM(M89:M${rr-1})`,result:sumTotal},
    {font:F({bold:true,size:11}),fill:ORANGE,border:allT,numFmt,align:aR});
  ws.getRow(rr).height = 18;

  // ── Page break entre fila 48 y 49 ─────────────────────────────────────────
  try { ws.addPageBreak(48); } catch {}

  // ── Hoja 2: Resumen externo ───────────────────────────────────────────────────
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
