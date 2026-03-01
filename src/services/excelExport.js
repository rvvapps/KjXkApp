import ExcelJS from "exceljs";
import { saveAs } from "./saveAs.js";
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

/**
 * items: array of enriched expense rows:
 * { docTipo, fechaISO, docNumero, detalle, crCodigo, ctaCodigo, partidaCodigo, clasificacionCodigo, monto }
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

    // Labels
    ws.getCell("A3").value = "N° Rendición";
    ws.getCell("A4").value = "Responsable";
    ws.getCell("A5").value = "Fecha Generación";
    ws.getCell("A6").value = "Total Rendición";
    ["A3","A4","A5","A6"].forEach(a => { ws.getCell(a).font = { bold: true }; });

    ws.getCell("B3").value = correlativo || "";
    ws.getCell("B4").value = header.responsableNombre || "";
    ws.getCell("B5").value = fmtDateDDMMYYYY(new Date());
    // B6 se setea luego con fórmula

    let row = 8; // deja 1 línea de aire

    // =============================
    // TABLA
    // =============================
    const tableStartRow = row;

    const cols = [
      "Tipo Doc",
      "Fecha",
      "N° Doc",
      "Detalle / Glosa",
      "Centro Responsabilidad (CR)",
      "Cuenta Contable",
      "Partida",
      "Clasificación",
      "Monto",
    ];

    cols.forEach((name, idx) => {
      const cell = ws.getCell(tableStartRow, idx + 1);
      cell.value = name;
      cell.font = { bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFEFEF" } };
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    });

    const dataStartRow = tableStartRow + 1;

    (items || []).forEach((it, i) => {
      const r = dataStartRow + i;

      ws.getCell(r, 1).value = it.docTipo || "";
      ws.getCell(r, 2).value = it.fechaISO ? fmtDateDDMMYYYY(new Date(it.fechaISO)) : "";
      ws.getCell(r, 3).value = it.docNumero || "";
      ws.getCell(r, 4).value = it.detalle || "";
      ws.getCell(r, 5).value = it.crCodigo || "";
      ws.getCell(r, 6).value = it.ctaCodigo || "";
      ws.getCell(r, 7).value = it.partidaCodigo || "";
      ws.getCell(r, 8).value = it.clasificacionCodigo || "";
      ws.getCell(r, 9).value = Number(it.monto || 0);

      // formato CLP
      ws.getCell(r, 9).numFmt = '"$"#,##0';
      // wrap detalle
      ws.getCell(r, 4).alignment = { wrapText: true, vertical: "top" };
    });

    const lastDataRow = dataStartRow + (items?.length || 0) - 1;
    const totalRow = lastDataRow + 1;

    // Total general
    ws.getCell(totalRow, 8).value = "Total General";
    ws.getCell(totalRow, 8).font = { bold: true };

    const sumFormula = items?.length
      ? `SUM(I${dataStartRow}:I${lastDataRow})`
      : "0";

    ws.getCell(totalRow, 9).value = { formula: sumFormula };
    ws.getCell(totalRow, 9).numFmt = '"$"#,##0';
    ws.getCell(totalRow, 9).font = { bold: true };

    // Total en encabezado (B6)
    ws.getCell("B6").value = { formula: sumFormula };
    ws.getCell("B6").numFmt = '"$"#,##0';
    ws.getCell("B6").font = { bold: true };

    // Auto filter
    ws.autoFilter = {
      from: { row: tableStartRow, column: 1 },
      to: { row: tableStartRow, column: 9 },
    };

    // Column widths
    ws.columns = [
      { width: 12 },
      { width: 12 },
      { width: 12 },
      { width: 34 },
      { width: 22 },
      { width: 18 },
      { width: 16 },
      { width: 16 },
      { width: 14 },
    ];

    // Freeze panes: keep header + table header
    ws.views = [{ state: "frozen", ySplit: tableStartRow }];

    const buffer = await wb.xlsx.writeBuffer();
    saveAs(buffer, `Rendicion_${correlativo || "SinNumero"}.xlsx`);
  } catch (err) {
    console.error("Error generando Excel:", err);
    throw err;
  }
}

export async function buildExportItems(gastoIds) {
  const db = await getDB();
  const [expenses, concepts] = await Promise.all([
    Promise.all(gastoIds.map((id) => db.get("expenses", id))),
    db.getAll("concepts"),
  ]);
  const conceptById = new Map(concepts.map((c) => [c.conceptId, c]));
  return expenses
    .filter(Boolean)
    .map((e) => {
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
        monto: e.monto,
      };
    });
}
