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

function normDocTipo(t) {
  return String(t ?? "").trim().toLowerCase();
}

// Soporta YYYY-MM-DD, YYYY/MM/DD, DD-MM-YYYY, DD/MM/YYYY
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
  return null;
}

async function downscaleToJpegBytes(blob, { maxSide = 1400, quality = 0.8 } = {}) {
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

function sortExpensesForExports(expenses) {
  const boletas = [];
  const facturas = [];
  const otros = [];

  for (const e of expenses) {
    const tipo = normDocTipo(e.docTipo || e.tipoDoc || e.tipoDocumento);
    if (tipo === "boleta") boletas.push(e);
    else if (tipo === "factura") facturas.push(e);
    else otros.push(e);
  }

  const byFecha = (a, b) => {
    const da = parseDateFlexible(a.fechaISO || a.fechaDocumento || a.fecha) ?? new Date(0);
    const db = parseDateFlexible(b.fechaISO || b.fechaDocumento || b.fecha) ?? new Date(0);
    return da.getTime() - db.getTime();
  };

  boletas.sort(byFecha);
  facturas.sort(byFecha);
  otros.sort((a, b) => {
    const ta = normDocTipo(a.docTipo || a.tipoDoc || a.tipoDocumento);
    const tb = normDocTipo(b.docTipo || b.tipoDoc || b.tipoDocumento);
    if (ta !== tb) return ta.localeCompare(tb, "es");
    return byFecha(a, b);
  });

  return { boletas, facturas, otros };
}

/**
 * PDF:
 * - Carta vertical (612x792)
 * - Boletas: 2x2 por página
 * - Facturas: 1 por página (full page)
 * - Orden: Boletas (fecha) -> Facturas (fecha) -> Otros (full page)
 */
export async function exportReceiptsPdf({ correlativo, orderedGastoIds }) {
  const db = await getDB();

  const expenses = [];
  for (const gastoId of orderedGastoIds) {
    const e = await db.get("expenses", gastoId);
    if (e) expenses.push({ ...e, _gastoId: gastoId });
  }

  const { boletas, facturas, otros } = sortExpensesForExports(expenses);

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  const PAGE_W = 612;
  const PAGE_H = 792;
  const MARGIN = 36;
  const GUTTER = 12;

  // ====== BOLETAS 2x2 ======
  const gridCols = 2;
  const gridRows = 2;
  const availW = PAGE_W - MARGIN * 2;
  const availH = PAGE_H - MARGIN * 2;
  const cellW = (availW - GUTTER) / gridCols;
  const cellH = (availH - GUTTER) / gridRows;
  const headerH = 22;
  const innerPad = 6;

  const boletaTiles = [];
  for (const e of boletas) {
    const atts = await db.getAllFromIndex("attachments", "gastoId", e._gastoId);
    const header = clampText(
      `${e.docTipo || e.tipoDoc || ""} ${e.docNumero || e.numeroDoc || ""} | $${e.monto ?? ""} | ${e.detalle || e.glosa || ""}`,
      120
    );

    if (!atts || atts.length === 0) {
      boletaTiles.push({ kind: "placeholder", header, text: "SIN RESPALDO ADJUNTO" });
      continue;
    }

    for (const att of atts) {
      boletaTiles.push({ kind: "image", header, blob: att.blob, mimeType: att.mimeType || "" });
    }
  }

  const perPage = gridCols * gridRows;
  const boletaPages = Math.ceil(boletaTiles.length / perPage);

  for (let p = 0; p < boletaPages; p++) {
    const page = pdf.addPage([PAGE_W, PAGE_H]);
    const start = p * perPage;
    const chunk = boletaTiles.slice(start, start + perPage);

    page.drawText(clampText(`Boletas — Rendición ${correlativo ?? ""}`, 80), {
      x: MARGIN,
      y: PAGE_H - MARGIN + 6,
      size: 9,
      font,
    });

    for (let i = 0; i < chunk.length; i++) {
      const tile = chunk[i];
      const col = i % gridCols;
      const row = Math.floor(i / gridCols);

      const x0 = MARGIN + col * (cellW + GUTTER);
      const yTop = PAGE_H - MARGIN - row * (cellH + GUTTER);
      const y0 = yTop - cellH;

      page.drawText(clampText(tile.header, 75), {
        x: x0 + innerPad,
        y: yTop - innerPad - 9,
        size: 8,
        font,
      });

      const imgX = x0 + innerPad;
      const imgY = y0 + innerPad;
      const imgW = cellW - innerPad * 2;
      const imgH = cellH - headerH - innerPad * 2;

      if (tile.kind === "placeholder") {
        page.drawText(tile.text, { x: imgX, y: imgY + imgH / 2, size: 11, font });
        continue;
      }

      const bytes = await downscaleToJpegBytes(tile.blob, { maxSide: 1200, quality: 0.78 });

      let img;
      try {
        if ((tile.mimeType || "").toLowerCase().includes("png")) {
          try { img = await pdf.embedPng(bytes); } catch { img = await pdf.embedJpg(bytes); }
        } else {
          try { img = await pdf.embedJpg(bytes); } catch { img = await pdf.embedPng(bytes); }
        }
      } catch {
        page.drawText("No se pudo incrustar la imagen.", { x: imgX, y: imgY + imgH / 2, size: 10, font });
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

  // ====== FACTURAS FULL PAGE ======
  async function addFullPageForExpense(e, titlePrefix) {
    const atts = await db.getAllFromIndex("attachments", "gastoId", e._gastoId);
    const header = clampText(
      `${titlePrefix} ${e.docTipo || e.tipoDoc || ""} ${e.docNumero || e.numeroDoc || ""} | $${e.monto ?? ""} | ${e.detalle || e.glosa || ""}`,
      140
    );

    // Si no hay adjuntos, igual deja una página de placeholder
    if (!atts || atts.length === 0) {
      const page = pdf.addPage([PAGE_W, PAGE_H]);
      page.drawText(clampText(header, 95), { x: MARGIN, y: PAGE_H - MARGIN, size: 10, font });
      page.drawText("SIN RESPALDO ADJUNTO", { x: MARGIN, y: PAGE_H / 2, size: 14, font });
      return;
    }

    // Cada adjunto a página completa (más seguro para facturas)
    for (const att of atts) {
      const page = pdf.addPage([PAGE_W, PAGE_H]);
      page.drawText(clampText(header, 95), { x: MARGIN, y: PAGE_H - MARGIN, size: 10, font });

      const bytes = await downscaleToJpegBytes(att.blob, { maxSide: 1800, quality: 0.82 });

      let img;
      try {
        if ((att.mimeType || "").toLowerCase().includes("png")) {
          try { img = await pdf.embedPng(bytes); } catch { img = await pdf.embedJpg(bytes); }
        } else {
          try { img = await pdf.embedJpg(bytes); } catch { img = await pdf.embedPng(bytes); }
        }
      } catch {
        page.drawText("No se pudo incrustar la imagen.", { x: MARGIN, y: PAGE_H / 2, size: 12, font });
        continue;
      }

      const topPad = 54;
      const imgX = MARGIN;
      const imgY = MARGIN;
      const imgW = PAGE_W - MARGIN * 2;
      const imgH = PAGE_H - MARGIN * 2 - topPad;

      const { width, height } = img.size();
      const scale = Math.min(imgW / width, imgH / height);
      const w = width * scale;
      const h = height * scale;
      const x = imgX + (imgW - w) / 2;
      const y = imgY + (imgH - h) / 2;
      page.drawImage(img, { x, y, width: w, height: h });
    }
  }

  for (const e of facturas) {
    await addFullPageForExpense(e, "Factura:");
  }
  for (const e of otros) {
    await addFullPageForExpense(e, "Documento:");
  }

  const out = await pdf.save();
  const blob = new Blob([out], { type: "application/pdf" });
  saveAs(blob, `Respaldos_${correlativo}.pdf`);
}
