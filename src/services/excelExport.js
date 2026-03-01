
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";

/**
 * Genera Excel programáticamente sin template.
 * Estructura robusta Fase A.
 */
export async function exportBatchXlsx(batch, allExpenses) {
  try {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Rendicion");

    // =============================
    // ENCABEZADO
    // =============================
    ws.mergeCells("A1:I1");
    ws.getCell("A1").value = "Rendición Fondo Reembolso Gastos";
    ws.getCell("A1").font = { size: 16, bold: true };
    ws.getCell("A1").alignment = { horizontal: "center" };

    const headerData = [
      ["N° Rendición", batch?.numero ?? ""],
      ["Responsable", batch?.responsable ?? ""],
      ["Fecha Generación", new Date().toLocaleDateString("es-CL")],
      ["Total Rendición", null],
    ];

    let rowIndex = 3;

    headerData.forEach(([label, value]) => {
      ws.getCell(`A${rowIndex}`).value = label;
      ws.getCell(`A${rowIndex}`).font = { bold: true };
      ws.getCell(`B${rowIndex}`).value = value;
      rowIndex++;
    });

    rowIndex += 1;

    // =============================
    // TABLA DE GASTOS
    // =============================
    const tableStartRow = rowIndex;

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

    const expenses = allExpenses.filter(e => e.batchId === batch.id);

    let currentRow = tableStartRow + 1;

    expenses.forEach(exp => {
      ws.getCell(currentRow, 1).value = exp.tipoDoc ?? "";
      ws.getCell(currentRow, 2).value = exp.fecha ?? "";
      ws.getCell(currentRow, 3).value = exp.numeroDoc ?? "";
      ws.getCell(currentRow, 4).value = exp.detalle ?? "";
      ws.getCell(currentRow, 5).value = exp.centroResponsabilidad ?? exp.cr ?? "";
      ws.getCell(currentRow, 6).value = exp.cuenta ?? "";
      ws.getCell(currentRow, 7).value = exp.partida ?? "";
      ws.getCell(currentRow, 8).value = exp.clasificacion ?? "";
      ws.getCell(currentRow, 9).value = exp.monto ?? 0;

      ws.getCell(currentRow, 9).numFmt = '"$"#,##0';

      currentRow++;
    });

    const totalRow = currentRow;

    ws.getCell(totalRow, 8).value = "Total General";
    ws.getCell(totalRow, 8).font = { bold: true };

    ws.getCell(totalRow, 9).value = {
      formula: `SUM(I${tableStartRow + 1}:I${currentRow - 1})`
    };
    ws.getCell(totalRow, 9).numFmt = '"$"#,##0';
    ws.getCell(totalRow, 9).font = { bold: true };

    ws.getCell("B6").value = {
      formula: `SUM(I${tableStartRow + 1}:I${currentRow - 1})`
    };
    ws.getCell("B6").numFmt = '"$"#,##0';
    ws.getCell("B6").font = { bold: true };

    ws.columns = [
      { width: 14 },
      { width: 12 },
      { width: 14 },
      { width: 30 },
      { width: 20 },
      { width: 20 },
      { width: 18 },
      { width: 18 },
      { width: 14 },
    ];

    ws.autoFilter = {
      from: { row: tableStartRow, column: 1 },
      to: { row: tableStartRow, column: 9 },
    };

    const buffer = await wb.xlsx.writeBuffer();
    saveAs(
      new Blob([buffer]),
      `Rendicion_${batch?.numero ?? "SinNumero"}.xlsx`
    );

  } catch (err) {
    console.error("Error generando Excel:", err);
    throw err;
  }
}
