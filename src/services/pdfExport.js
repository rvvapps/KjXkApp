import { PDFDocument, StandardFonts } from "pdf-lib";
import { saveAs } from "./saveAs.js";
import { getDB } from "../db.js";

const LETTER_W = 612; // 8.5 in * 72
const LETTER_H = 792; // 11 in * 72

function getExpenseId(e) {
  return e?.gastoId ?? e?.id ?? e?.expenseId ?? e?.key;
}

function normDocTipo(t) {
  const s = String(t ?? "").trim().toLowerCase();
  if (s === "factura" || s.includes("factura")) return "factura";
  if (s === "boleta" || s.includes("boleta")) return "boleta";
  return s || "otro";
}

// YYYY-MM-DD, YYYY/MM/DD, DD-MM-YYYY, DD/MM/YYYY
function parseDateFlexible(s) {
  const str = String(s ?? "").trim();
  if (!str) return null;
  const parts = str.split(/[\/\-\.\s]/).filter(Boolean);
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

function sortForPdf(expenses) {
  const facturas = [];
  const noFactura = [];

  for (const e of expenses) {
    const tipo = normDocTipo(e.docTipo || e.tipoDoc || e.tipoDocumento);
    if (tipo === "factura") facturas.push(e);
    else noFactura.push(e);
  }

  const byFecha = (a, b) => {
    const da = parseDateFlexible(a.fechaISO || a.fechaDocumento || a.fecha) ?? new Date(0);
    const db = parseDateFlexible(b.fechaISO || b.fechaDocumento || b.fecha) ?? new Date(0);
    const diff = da.getTime() - db.getTime();
    if (diff !== 0) return diff;

    const ta = normDocTipo(a.docTipo || a.tipoDoc || a.tipoDocumento);
    const tb = normDocTipo(b.docTipo || b.tipoDoc || b.tipoDocumento);
    if (ta !== tb) return ta.localeCompare(tb, "es");
    return String(a.docNumero || a.numeroDoc || "").localeCompare(String(b.docNumero || b.numeroDoc || ""), "es");
  };

  noFactura.sort(byFecha);
  facturas.sort(byFecha);
  return { noFactura, facturas };
}

function uniqueOrderedIds(ids) {
  const seen = new Set();
  const out = [];
  for (const id of Array.isArray(ids) ? ids : []) {
    const k = String(id);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(id);
  }
  return out;
}

function uniqueAttachments(atts) {
  const seen = new Set();
  const out = [];
  for (const a of Array.isArray(atts) ? atts : []) {
    const key = String(a?.id ?? a?.adjuntoId ?? `${a?.gastoId ?? ""}-${a?.createdAt ?? ""}`);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  return out;
}

async function blobToUint8(blob) {
  const ab = await blob.arrayBuffer();
  return new Uint8Array(ab);
}

async function compressImageBlob(blob, { maxSide = 1400, jpegQuality = 0.72 } = {}) {
  try {
    const imgUrl = URL.createObjectURL(blob);
    const img = new Image();
    img.decoding = "async";
    img.src = imgUrl;
    await new Promise((res, rej) => {
      img.onload = () => res();
      img.onerror = rej;
    });

    const w0 = img.naturalWidth || img.width;
    const h0 = img.naturalHeight || img.height;
    URL.revokeObjectURL(imgUrl);

    if (!w0 || !h0) return blob;

    const scale = Math.min(1, maxSide / Math.max(w0, h0));
    const w = Math.max(1, Math.round(w0 * scale));
    const h = Math.max(1, Math.round(h0 * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return blob;

    ctx.drawImage(img, 0, 0, w, h);

    const out = await new Promise((res) => canvas.toBlob(res, "image/jpeg", jpegQuality));
    return out || blob;
  } catch {
    return blob;
  }
}

async function embedImage(pdf, blob) {
  const b = await compressImageBlob(blob, { maxSide: 1400, jpegQuality: 0.72 });
  const bytes = await blobToUint8(b);

  try {
    return await pdf.embedJpg(bytes);
  } catch {
    const bytes2 = await blobToUint8(blob);
    return await pdf.embedPng(bytes2);
  }
}

function clampText(s, max = 90) {
  const str = String(s ?? "");
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + "…";
}

function drawHeader(page, font, title) {
  page.drawText(clampText(title, 90), {
    x: 36,
    y: LETTER_H - 36,
    size: 12,
    font,
  });
}

function drawTile(page, font, tile, box) {
  const { x, y, w, h } = box;

  const headerH = 28;
  page.drawText(clampText(tile.header, 85), {
    x: x + 6,
    y: y + h - 16,
    size: 8.5,
    font,
  });

  if (tile.kind === "placeholder") {
    page.drawText("SIN RESPALDO ADJUNTO", {
      x: x + 6,
      y: y + 10,
      size: 9,
      font,
    });
    return;
  }

  const img = tile.img;
  const maxW = w - 10;
  const maxH = h - headerH - 10;
  const scale = Math.min(maxW / img.width, maxH / img.height);
  const iw = img.width * scale;
  const ih = img.height * scale;
  const ix = x + (w - iw) / 2;
  const iy = y + 8 + (maxH - ih) / 2;
  page.drawImage(img, { x: ix, y: iy, width: iw, height: ih });
}

/**
 * Genera un PDF y devuelve Blob (para snapshot al aprobar).
 * Reglas:
 * - Facturas: 1 por página (full page)
 * - Todo lo no-factura (boletas + otros): 2x2 por página
 * - No-factura mezclado por fecha; facturas por fecha
 *
 * Fix: deduplicación de IDs y adjuntos (evita repetición masiva).
 */
export async function generateReceiptsPdfBlob({ correlativo, orderedGastoIds }) {
  const db = await getDB();

  // ✅ Evita duplicados en la lista de ids (a veces llegan repetidos desde UI/estado)
  const uniqueIds = uniqueOrderedIds(orderedGastoIds);

  const expenses = await Promise.all(uniqueIds.map((id) => db.get("expenses", id)));
  const list = (expenses || []).filter(Boolean);

  const { noFactura, facturas } = sortForPdf(list);

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  // ---- No factura tiles (2x2)
  const tiles = [];
  for (const e of noFactura) {
    let atts = await db.getAllFromIndex("attachments", "gastoId", getExpenseId(e));
    atts = uniqueAttachments(atts);

    const header = clampText(
      `${e.docTipo || e.tipoDoc || ""} ${e.docNumero || e.numeroDoc || ""} | $${e.monto ?? ""} | ${e.detalle || e.glosa || ""}`,
      120
    );

    if (!atts || atts.length === 0) {
      tiles.push({ kind: "placeholder", header });
      continue;
    }

    for (const att of atts) {
      if (!att?.blob) continue;
      tiles.push({ kind: "image", header, blob: att.blob });
    }
  }

  const perPage = 4;
  const marginX = 36;
  const marginTop = 64;
  const marginBottom = 36;
  const gap = 10;

  const gridW = LETTER_W - marginX * 2;
  const gridH = LETTER_H - marginTop - marginBottom;

  const cellW = (gridW - gap) / 2;
  const cellH = (gridH - gap) / 2;

  for (let i = 0; i < tiles.length; i += perPage) {
    const page = pdf.addPage([LETTER_W, LETTER_H]);
    drawHeader(page, font, `Documentos (No Factura) — Rendición ${correlativo ?? ""}`);

    const chunk = tiles.slice(i, i + perPage);

    // Pre-embed images for this page
    for (const t of chunk) {
      if (t.kind === "image") {
        t.img = await embedImage(pdf, t.blob);
      }
    }

    const baseY = marginBottom;
    const baseX = marginX;

    const positions = [
      { x: baseX, y: baseY + cellH + gap, w: cellW, h: cellH }, // top-left
      { x: baseX + cellW + gap, y: baseY + cellH + gap, w: cellW, h: cellH }, // top-right
      { x: baseX, y: baseY, w: cellW, h: cellH }, // bottom-left
      { x: baseX + cellW + gap, y: baseY, w: cellW, h: cellH }, // bottom-right
    ];

    chunk.forEach((t, idx) => drawTile(page, font, t, positions[idx]));
  }

  // ---- Facturas full page
  for (const e of facturas) {
    let atts = await db.getAllFromIndex("attachments", "gastoId", getExpenseId(e));
    atts = uniqueAttachments(atts);

    const title = `Factura ${e.docNumero || e.numeroDoc || ""} — $${e.monto ?? ""} — ${e.fechaISO || e.fechaDocumento || e.fecha || ""}`;

    if (!atts || atts.length === 0) {
      const page = pdf.addPage([LETTER_W, LETTER_H]);
      drawHeader(page, font, `Facturas — Rendición ${correlativo ?? ""}`);
      page.drawText(clampText(title, 100), { x: 36, y: LETTER_H - 56, size: 10, font });
      page.drawText("SIN RESPALDO ADJUNTO", { x: 36, y: LETTER_H - 76, size: 10, font });
      continue;
    }

    for (const att of atts) {
      if (!att?.blob) continue;

      const page = pdf.addPage([LETTER_W, LETTER_H]);
      drawHeader(page, font, `Facturas — Rendición ${correlativo ?? ""}`);
      page.drawText(clampText(title, 110), { x: 36, y: LETTER_H - 56, size: 10, font });

      const img = await embedImage(pdf, att.blob);
      const maxW = LETTER_W - 72;
      const maxH = LETTER_H - 120;
      const scale = Math.min(maxW / img.width, maxH / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      const x = (LETTER_W - w) / 2;
      const y = 44 + (maxH - h) / 2;
      page.drawImage(img, { x, y, width: w, height: h });
    }
  }

  const out = await pdf.save();
  return new Blob([out], { type: "application/pdf" });
}

export async function exportReceiptsPdf({ correlativo, orderedGastoIds }) {
  const blob = await generateReceiptsPdfBlob({ correlativo, orderedGastoIds });
  saveAs(blob, `Respaldos_${correlativo}.pdf`);
  return blob;
}
