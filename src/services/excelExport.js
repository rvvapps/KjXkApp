import ExcelJS from "exceljs";
import { getSettings, getDB } from "../db.js";

// Mantener la misma capacidad histórica (42) para que calce con el slicing en Reimbursements.jsx
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

// Soporta YYYY-MM-DD, YYYY/MM/DD, DD-MM-YYYY, DD/MM/YYYY
function parseDateFlexible(s) {
  const str = String(s ?? "").trim();
  if (!str) return null;
  const parts = str.split(/[\/\-\.]/).map((p) => p.trim());
  if (parts.length < 3) return null;

  // YYYY-MM-DD
  if (parts[0].length === 4) {
    const [y, m, d] = parts;
    const dt = new Date(Number(y), Number(m) - 1, Number(d));
    return isNaN(dt.getTime()) ? null : dt;
  }

  // DD-MM-YYYY
  if (parts[2].length === 4) {
    const [d, m, y] = parts;
    const dt = new Date(Number(y), Number(m) - 1, Number(d));
    return isNaN(dt.getTime()) ? null : dt;
  }

  return null;
}

function sortByFechaISO(a, b) {
  const da = parseDateFlexible(a.fechaISO) ?? new Date(0);
  const db = parseDateFlexible(b.fechaISO) ?? new Date(0);
  return da.getTime() - db.getTime();
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

/**
 * items: array of enriched expense rows:
 * {
 *   docTipo, fechaISO, docNumero, detalle,
 *   crCodigo, crNombre, ctaCodigo, ctaNombre, partidaCodigo, partidaNombre,
 *   clasificacionCodigo, clasificacionNombre,
 *   monto
 * }
 */
export async function exportBatchXlsx({ correlativo, headerOverrides = {}, items }) {
  try {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Rendicion");

    // --- Header settings (responsable está en Settings)
    const settings = await getSettings();
    const header = { ...settings, ...headerOverrides };

    // =============================
    // ENCABEZADO
    // =============================
    ws.mergeCells("A1:I1");
    ws.getCell("A1").value = "Rendición Fondo Reembolso Gastos";
    ws.getCell("A1").font = { size: 16, bold: true };
    ws.getCell("A1").alignment = { horizontal: "center" };

    ws.getCell("A3").value = "N° Rendición";
    ws.getCell("A4").value = "Responsable";
    ws.getCell("A5").value = "Fecha Generación";
    ws.getCell("A6").value = "Total Rendición";
    ["A3", "A4", "A5", "A6"].forEach((addr) => {
      ws.getCell(addr).font = { bold: true };
    });

    ws.getCell("B3").value = correlativo ?? "";
    ws.getCell("B4").value = header?.responsableNombre ?? header?.nombreResponsable ?? "";
    ws.getCell("B5").value = fmtDateDDMMYYYY(new Date());
    // B6 se setea después con fórmula

    // =============================
    // TABLA DE GASTOS
    // =============================
    const tableStartRow = 8;

    const columns = [
      "Tipo Doc",
      "Fecha",
      "N° Doc",
      "Detalle / Glosa",
      "Centro Responsabilidad",
      "Cuenta Contable",
      "Partida",
      "Clasificación",
      "Monto",
    ];

    columns.forEach((col, i) => {
      const cell = ws.getCell(tableStartRow, i + 1);
      cell.value = col;
      cell.font = { bold: true };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFEFEFEF" },
      };
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
    });

    const safeItems = Array.isArray(items) ? items : [];
    const { noFactura, facturas } = groupAndSortForExports(safeItems);

    let r = tableStartRow + 1;

    function writeGroupLabel(label) {
      ws.mergeCells(`A${r}:I${r}`);
      const c = ws.getCell(`A${r}`);
      c.value = label;
      c.font = { bold: true };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
      r += 1;
    }

    function writeItem(it) {
      ws.getCell(r, 1).value = it.docTipo ?? "";
      ws.getCell(r, 2).value = it.fechaISO ?? "";
      ws.getCell(r, 3).value = it.docNumero ?? "";
      ws.getCell(r, 4).value = it.detalle ?? "";

      ws.getCell(r, 5).value = codeName(it.crCodigo, it.crNombre);
      ws.getCell(r, 6).value = codeName(it.ctaCodigo, it.ctaNombre);
      ws.getCell(r, 7).value = codeName(it.partidaCodigo, it.partidaNombre);
      ws.getCell(r, 8).value = codeName(it.clasificacionCodigo, it.clasificacionNombre);

      ws.getCell(r, 9).value = Number(it.monto ?? 0);
      ws.getCell(r, 9).numFmt = '"$"#,##0';
      r += 1;
    }

    // ✅ Bloques: No Factura (mezclado por fecha) -> Facturas (por fecha)
    if (noFactura.length) {
      writeGroupLabel("DOCUMENTOS (NO FACTURA) — ordenados por fecha");
      noFactura.forEach(writeItem);
      r += 1; // línea en blanco
    }

    if (facturas.length) {
      writeGroupLabel("FACTURAS — ordenadas por fecha");
      facturas.forEach(writeItem);
      r += 1;
    }

    const firstDataRow = tableStartRow + 1; // incluye labels, pero SUM igual suma bien solo columna I con números
    const lastDataRow = Math.max(firstDataRow, r - 2);
    const sumFormula = `SUM(I${firstDataRow}:I${lastDataRow})`;

    // Total Rendición
    ws.getCell("B6").value = { formula: sumFormula };
    ws.getCell("B6").numFmt = '"$"#,##0';
    ws.getCell("B6").font = { bold: true };

    // Total General al final
    const totalRow = r;
    ws.getCell(totalRow, 8).value = "Total General";
    ws.getCell(totalRow, 8).font = { bold: true };
    ws.getCell(totalRow, 9).value = { formula: sumFormula };
    ws.getCell(totalRow, 9).numFmt = '"$"#,##0';
    ws.getCell(totalRow, 9).font = { bold: true };

    // Column widths
    ws.columns = [
      { width: 14 },
      { width: 12 },
      { width: 14 },
      { width: 34 },
      { width: 28 },
      { width: 28 },
      { width: 28 },
      { width: 26 },
      { width: 14 },
    ];

    ws.autoFilter = {
      from: { row: tableStartRow, column: 1 },
      to: { row: tableStartRow, column: 9 },
    };

    ws.views = [{ state: "frozen", ySplit: tableStartRow }];

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    downloadBlob(blob, `Rendicion_${correlativo || "SinNumero"}.xlsx`);
  } catch (err) {
    console.error("Error generando Excel:", err);
    throw err;
  }
}

/**
 * buildExportItems(gastoIds)
 * Devuelve items enriquecidos con nombres desde catálogos para que Excel muestre:
 *  CR / Cuenta / Partida como "codigo - nombre".
 */
export async function buildExportItems(gastoIds) {
  const db = await getDB();

  const [expenses, concepts, crs, accounts, partidas] = await Promise.all([
    Promise.all(gastoIds.map((id) => db.get("expenses", id))),
    db.getAll("concepts"),
    db.getAll("catalog_cr"),
    db.getAll("catalog_accounts"),
    db.getAll("catalog_partidas"),
  ]);

  const conceptById = new Map(concepts.map((c) => [c.conceptId ?? c.id, c]));
  const crByCode = new Map(crs.map((c) => [c.crCodigo, c]));
  const accByCode = new Map(accounts.map((a) => [a.ctaCodigo, a]));
  const partidaByCode = new Map(partidas.map((p) => [p.partidaCodigo, p]));

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

      return {
        id: e.id,
        docTipo: e.docTipo ?? e.tipoDoc ?? e.tipoDocumento ?? "",
        fechaISO: e.fechaISO ?? e.fechaDocumento ?? e.fecha ?? "",
        docNumero: e.docNumero ?? e.numeroDoc ?? e.numeroDocumento ?? "",
        detalle: e.detalle ?? e.glosa ?? "",
        crCodigo,
        crNombre: cr?.crNombre ?? "",
        ctaCodigo,
        ctaNombre: acc?.ctaNombre ?? "",
        partidaCodigo,
        partidaNombre: part?.partidaNombre ?? "",
        clasificacionCodigo: e.clasificacionCodigo ?? e.clasificacion ?? "",
        clasificacionNombre: e.clasificacionNombre ?? "",
        monto: Number(e.monto ?? 0),
      };
    });
}
