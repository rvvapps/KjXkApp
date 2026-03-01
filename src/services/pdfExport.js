import { PDFDocument, StandardFonts } from "pdf-lib";
import { saveAs } from "./saveAs.js";
import { getDB } from "../db.js";

async function blobToUint8(blob) {
  const ab = await blob.arrayBuffer();
  return new Uint8Array(ab);
}

function clampText(s, maxLen = 110) {
  const str = String(s ?? "");
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + "…";
}

/**
 * Reduce resolución y (cuando sea posible) convertir a JPEG para PDFs más livianos.
 * - maxSide: máximo del lado mayor en px
 * - quality: calidad JPEG 0..1
 */
async function downscaleToJpegBytes(blob, { maxSide = 1200, quality = 0.78 } = {}) {
  // En algunos navegadores createImageBitmap puede fallar con ciertos blobs.
  // Si falla, se hace fallback a bytes originales.
  try {
    const bmp = await createImageBitmap(blob);
    const { width, height } = bmp;

    const scale = Math.min(1, maxSide / Math.max(width, height));
    const tw = Math.max(1, Math.round(width * scale));
    const th = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No canvas context");

    // Fondo blanco (importante si venía de PNG con transparencia)
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, tw, th);
    ctx.drawImage(bmp, 0, 0, tw, th);

    const outBlob = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", quality)
    );

    if (!outBlob) throw new Error("canvas.toBlob returned null");

    return await blobToUint8(outBlob);
  } catch {
    return await blobToUint8(blob);
  }
}

/**
 * Exporta un PDF de respaldos:
 * - Tamaño Carta vertical (612x792 pt)
 * - Layout 2x2 por página (4 imágenes por hoja)
 * - Reduce resolución para bajar número de páginas y peso
 * - Respeta el orden recibido (orderedGastoIds)
 */
export async function exportReceiptsPdf({ correlativo, orderedGastoIds }) {
  const db = await getDB();
  const concepts = await db.getAll("concepts");
  const conceptById = new Map(concepts.map((c) => [c.conceptId, c]));

  // 1) Construir lista de "tiles" (imagen + header) en el orden correcto
  const tiles = [];
  for (const gastoId of orderedGastoIds) {
    const e = await db.get("expenses", gastoId);
    if (!e) continue;

    const atts = await db.getAllFromIndex("attachments", "gastoId", gastoId);
    const conceptName = conceptById.get(e.conceptId)?.nombre || "Gasto";

    const header = clampText(
      `${conceptName} | ${e.docTipo || ""} ${e.docNumero || ""} | $${e.monto ?? ""} | CR ${e.crCodigo ?? ""} | CTA ${e.ctaCodigo ?? ""}`,
      140
    );

    if (!atts || atts.length === 0) {
      tiles.push({
        header,
        kind: "placeholder",
        text: "SIN RESPALDO ADJUNTO",
      });
      continue;
    }

    for (const att of atts) {
      tiles.push({
        header,
        kind: "image",
        blob: att.blob,
        mimeType: att.mimeType || "",
      });
    }
  }

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  // 2) Config página Carta vertical
  const PAGE_W = 612; // Letter width in points
  const PAGE_H = 792; // Letter height in points

  const MARGIN = 36;
  const GUTTER = 12;

  const gridCols = 2;
  const gridRows = 2;

  const availW = PAGE_W - MARGIN * 2;
  const availH = PAGE_H - MARGIN * 2;

  const cellW = (availW - GUTTER) / gridCols;
  const cellH = (availH - GUTTER) / gridRows;

  const headerH = 22; // espacio para texto sobre la foto dentro de cada celda
  const innerPad = 6;

  const perPage = gridCols * gridRows;
  const totalPages = Math.max(1, Math.ceil(tiles.length / perPage));

  // 3) Paginar tiles en 2x2
  for (let p = 0; p < totalPages; p++) {
    const page = pdf.addPage([PAGE_W, PAGE_H]);

    // Header de página (ligero)
    const pageTitle = `Respaldos Rendición ${correlativo ?? ""} — Página ${p + 1}/${totalPages}`;
    page.drawText(clampText(pageTitle, 90), {
      x: MARGIN,
      y: PAGE_H - MARGIN + 6,
      size: 9,
      font,
    });

    const start = p * perPage;
    const chunk = tiles.slice(start, start + perPage);

    for (let i = 0; i < chunk.length; i++) {
      const tile = chunk[i];
      const col = i % gridCols;
      const row = Math.floor(i / gridCols);

      // Coordenadas de celda (desde arriba)
      const x0 = MARGIN + col * (cellW + GUTTER);
      const yTop = PAGE_H - MARGIN - row * (cellH + GUTTER);
      const y0 = yTop - cellH;

      // Header dentro de celda
      page.drawText(clampText(tile.header, 75), {
        x: x0 + innerPad,
        y: yTop - innerPad - 9,
        size: 8,
        font,
      });

      // Área imagen
      const imgX = x0 + innerPad;
      const imgY = y0 + innerPad;
      const imgW = cellW - innerPad * 2;
      const imgH = cellH - headerH - innerPad * 2;

      if (tile.kind === "placeholder") {
        page.drawText(tile.text, {
          x: imgX,
          y: imgY + imgH / 2,
          size: 11,
          font,
        });
        continue;
      }

      // Downscale/convert (reduce peso)
      const bytes = await downscaleToJpegBytes(tile.blob, {
        maxSide: 1200,
        quality: 0.78,
      });

      let img;
      try {
        // Preferimos JPG (porque downscale devuelve jpg), pero si el fallback fue PNG original,
        // intentamos png primero si el mime dice png.
        if ((tile.mimeType || "").toLowerCase().includes("png")) {
          try {
            img = await pdf.embedPng(bytes);
          } catch {
            img = await pdf.embedJpg(bytes);
          }
        } else {
          try {
            img = await pdf.embedJpg(bytes);
          } catch {
            img = await pdf.embedPng(bytes);
          }
        }
      } catch {
        page.drawText("No se pudo incrustar la imagen (formato no soportado).", {
          x: imgX,
          y: imgY + imgH / 2,
          size: 10,
          font,
        });
        continue;
      }

      const { width, height } = img.size();
      const scale = Math.min(imgW / width, imgH / height);
      const w = width * scale;
      const h = height * scale;
      const x = imgX + (imgW - w) / 2;
      const y = imgY + (imgH - h) / 2;

      page.drawImage(img, { x, y, width: w, height: h });
    }
  }

  const out = await pdf.save();
  const blob = new Blob([out], { type: "application/pdf" });
  saveAs(blob, `Respaldos_${correlativo}.pdf`);
}
