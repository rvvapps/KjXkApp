import { PDFDocument, StandardFonts } from "pdf-lib";
import { saveAs } from "./saveAs.js";
import { getDB } from "../db.js";

async function blobToUint8(blob) {
  const ab = await blob.arrayBuffer();
  return new Uint8Array(ab);
}

export async function exportReceiptsPdf({ correlativo, orderedGastoIds }) {
  const db = await getDB();
  const concepts = await db.getAll("concepts");
  const conceptById = new Map(concepts.map(c => [c.conceptId, c]));

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  for (const gastoId of orderedGastoIds) {
    const e = await db.get("expenses", gastoId);
    if (!e) continue;
    const atts = await db.getAllFromIndex("attachments", "gastoId", gastoId);

    const conceptName = conceptById.get(e.conceptId)?.nombre || "Gasto";
    const header = `${conceptName} | ${e.docTipo || ""} ${e.docNumero || ""} | $${e.monto} | CR ${e.crCodigo} | CTA ${e.ctaCodigo}`;

    if (atts.length === 0) {
      const page = pdf.addPage([595, 842]);
      page.drawText(header, { x: 40, y: 800, size: 10, font });
      page.drawText("SIN RESPALDO ADJUNTO", { x: 40, y: 760, size: 14, font });
      continue;
    }

    for (const att of atts) {
      const page = pdf.addPage([595, 842]);
      page.drawText(header, { x: 40, y: 800, size: 10, font });

      const bytes = await blobToUint8(att.blob);
      let img;
      try {
        if ((att.mimeType || "").toLowerCase().includes("png")) {
          img = await pdf.embedPng(bytes);
        } else {
          img = await pdf.embedJpg(bytes);
        }
      } catch {
        page.drawText("No se pudo incrustar la imagen (formato no soportado).", { x: 40, y: 760, size: 12, font });
        continue;
      }
      const { width, height } = img.size();
      const maxW = 515;
      const maxH = 740;
      const scale = Math.min(maxW / width, maxH / height);
      const w = width * scale;
      const h = height * scale;
      const x = (595 - w) / 2;
      const y = (800 - h) / 2;
      page.drawImage(img, { x, y, width: w, height: h });
    }
  }

  const out = await pdf.save();
  const blob = new Blob([out], { type: "application/pdf" });
  saveAs(blob, `Respaldos_${correlativo}.pdf`);
}