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

    // Labels en A3..A6 / Values en B3..B6
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
    let r = tableStartRow + 1;

    safeItems.forEach((it) => {
      ws.getCell(r, 1).value = it.docTipo ?? "";
      ws.getCell(r, 2).value = it.fechaISO ?? "";
      ws.getCell(r, 3).value = it.docNumero ?? "";
      ws.getCell(r, 4).value = it.detalle ?? "";
      ws.getCell(r, 5).value = it.crCodigo ?? "";
      ws.getCell(r, 6).value = it.ctaCodigo ?? "";
      ws.getCell(r, 7).value = it.partidaCodigo ?? "";
      ws.getCell(r, 8).value = it.clasificacionCodigo ?? "";
      ws.getCell(r, 9).value = Number(it.monto ?? 0);
      ws.getCell(r, 9).numFmt = '"$"#,##0';
      r++;
    });

    const firstDataRow = tableStartRow + 1;
    const lastDataRow = Math.max(firstDataRow, r - 1);
    const sumFormula = `SUM(I${firstDataRow}:I${lastDataRow})`;

    // Total Rendición
    ws.getCell("B6").value = { formula: sumFormula };
    ws.getCell("B6").numFmt = '"$"#,##0';
    ws.getCell("B6").font = { bold: true };

    // Total General al final
    const totalRow = r + 1;
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
      { width: 24 },
      { width: 20 },
      { width: 16 },
      { width: 18 },
      { width: 14 },
    ];

    ws.autoFilter = {
      from: { row: tableStartRow, column: 1 },
      to: { row: tableStartRow, column: 9 },
    };

    // Freeze panes
    ws.views = [{ state: "frozen", ySplit: tableStartRow }];

    // IMPORTANT: writeBuffer returns ArrayBuffer, we must wrap it in Blob
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

export async function buildExportItems(gastoIds) {
  const db = await getDB();
  const [expenses, concepts] = await Promise.all([
    Promise.all(gastoIds.map((id) => db.get("expenses", id))),
    db.getAll("concepts"),
  ]);

  const byId = new Map(concepts.map((c) => [c.id, c]));

  return expenses
    .filter(Boolean)
    .map((e) => {
      const concept = e.conceptId ? byId.get(e.conceptId) : null;
      return {
        id: e.id,
        docTipo: e.docTipo ?? e.tipoDoc ?? "",
        fechaISO: e.fechaISO ?? e.fecha ?? "",
        docNumero: e.docNumero ?? e.numeroDoc ?? e.numeroDocumento ?? "",
        detalle: e.detalle ?? e.glosa ?? "",
        crCodigo: concept?.crCodigo ?? e.crCodigo ?? e.cr ?? "",
        ctaCodigo: concept?.ctaCodigo ?? e.ctaCodigo ?? e.cuenta ?? e.cuentaContable ?? "",
        partidaCodigo: concept?.partidaCodigo ?? e.partidaCodigo ?? e.partida ?? "",
        clasificacionCodigo: concept?.clasificacionCodigo ?? e.clasificacionCodigo ?? e.clasificacion ?? "",
        monto: Number(e.monto ?? 0),
      };
    });
}
