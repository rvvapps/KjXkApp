import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  getReimbursement, listReimbursementItems, getExpense,
  cancelReimbursement, sendReimbursement, returnReimbursement,
  approveReimbursement, markReimbursementPagada, setReimbursementSnapshot,
  listAttachmentsForExpense, listConcepts, removeExpenseFromReimbursement,
  addExpenseToReimbursement, deleteExpense, listPendingExpenses,
} from "../db.js";
import AttachmentGallery from "../components/AttachmentGallery.jsx";
import { buildExportItems, exportBatchXlsx, splitIntoBatches, generateBatchXlsxBlob } from "../services/excelExport.js";
import { exportReceiptsPdf, generateReceiptsPdfBlob } from "../services/pdfExport.js";

// ── Íconos ──────────────────────────────────────────────────────────────────
const IconBack    = () => <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 4L6 10l6 6"/></svg>;
const IconHome    = () => <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 9.5L10 3l7 6.5V17a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"/><path d="M8 18v-6h4v6"/></svg>;
const IconExcel   = () => <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="14" height="14" rx="2"/><path d="M7 7l6 6M13 7l-6 6"/></svg>;
const IconPdf     = () => <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="4" y="2" width="12" height="16" rx="2"/><path d="M8 6h4M8 10h4M8 14h2"/></svg>;
const IconSend    = () => <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17 10L3 3l4 7-4 7L17 10z"/></svg>;
const IconReturn  = () => <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 14l-5-4 5-4"/><path d="M4 10h12a3 3 0 000-6h-2"/></svg>;
const IconApprove = () => <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M4 10l5 5L16 6"/></svg>;
const IconPaid    = () => <span style={{fontSize:15}}>💰</span>;
const IconEdit    = () => <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14.7 2.3a1 1 0 011.4 1.4l-9.9 9.9L3 15l1.4-3.2 9.9-9.9z"/></svg>;
const IconTrash   = () => <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 5h14M8 5V3h4v2M6 5l1 12h6l1-12"/></svg>;
const IconRemove  = () => <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 10h10"/></svg>;

// ── Estado → pill color ──────────────────────────────────────────────────────
const ESTADO_COLOR = {
  borrador: "var(--bg3)",
  enviada:  "#1d4ed8",
  devuelta: "#b91c1c",
  aprobada: "#4f46e5",
  pagada:   "#15803d",
};

function EstadoPill({ estado }) {
  return (
    <span style={{
      padding: "2px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700,
      background: ESTADO_COLOR[estado] || "var(--bg3)",
      color: "#fff", letterSpacing: ".3px",
    }}>{estado}</span>
  );
}

// ── Banner legible ───────────────────────────────────────────────────────────
function Banner({ type = "info", children }) {
  const colors = {
    info:    { bg: "rgba(99,102,241,.15)",  border: "rgba(99,102,241,.35)",  icon: "🔒" },
    success: { bg: "rgba(34,197,94,.12)",   border: "rgba(34,197,94,.35)",   icon: "✅" },
    error:   { bg: "rgba(239,68,68,.12)",   border: "rgba(239,68,68,.35)",   icon: "❌" },
    warning: { bg: "rgba(250,204,21,.12)",  border: "rgba(250,204,21,.35)",  icon: "⚠️" },
  };
  const s = colors[type] || colors.info;
  return (
    <div style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: 10, padding: "8px 12px", marginTop: 10 }}>
      <div className="small" style={{ whiteSpace: "pre-wrap", color: "var(--text)" }}>{children}</div>
    </div>
  );
}

// ── Botón con ícono ──────────────────────────────────────────────────────────
function IconBtn({ icon, label, onClick, disabled, variant = "secondary", title, style = {} }) {
  const base = {
    display: "inline-flex", alignItems: "center", gap: 5,
    padding: "7px 12px", borderRadius: 10, fontWeight: 600, fontSize: 13,
    cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1,
    border: "1px solid var(--sep)", background: "transparent", color: "var(--text)",
    ...style,
  };
  if (variant === "primary") { base.background = "#0ea5e9"; base.color = "#001018"; base.border = "none"; }
  if (variant === "success")  { base.background = "#22c55e"; base.color = "#001a0a"; base.border = "none"; }
  if (variant === "danger")   { base.background = "transparent"; base.border = "1px solid rgba(239,68,68,.4)"; base.color = "#f87171"; }
  return (
    <button style={base} onClick={onClick} disabled={disabled} title={title || label}>
      {icon}{label && <span>{label}</span>}
    </button>
  );
}

// Descarga en PC / Web Share API en iOS (única forma confiable en Safari)
async function shareOrDownload(blob, filename) {
  const file = new File([blob], filename, { type: blob.type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return;
    } catch (e) {
      // Si el usuario canceló (AbortError) no hacer nada; si es otro error, caer a download
      if (e?.name === "AbortError") return;
    }
  }
  // Fallback: download directo
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

function downloadSnapshotBlob(blob, filename) {
  shareOrDownload(blob, filename).catch(() => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  });
}

export default function ReimbursementDetail() {
  const { rendicionId } = useParams();
  const nav = useNavigate();

  const [reim, setReim] = useState(null);
  const [items, setItems] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [concepts, setConcepts] = useState([]);
  const [msg, setMsg] = useState({ text: "", type: "info" });
  const [busy, setBusy] = useState(false);
  const [pendingExpenses, setPendingExpenses] = useState([]);
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [expAtts, setExpAtts] = useState({});
  const [pdfViewer, setPdfViewer] = useState(null); // { url, filename }

  function setOk(text)  { setMsg({ text, type: "success" }); }
  function setErr(text) { setMsg({ text, type: "error" }); }
  function clearMsg()   { setMsg({ text: "", type: "info" }); }

  async function reloadAll() {
    const r = await getReimbursement(rendicionId);
    setReim(r);
    const its = await listReimbursementItems(rendicionId);
    setItems(its);
    const rawExps = await Promise.all(its.map((it) => getExpense(it.gastoId)));
    const exps = rawExps
      .map((e, i) => e ? { ...e, _orden: its[i].orden ?? 0 } : null)
      .filter(Boolean).sort((a, b) => (a._orden ?? 0) - (b._orden ?? 0));
    setExpenses(exps);
    setPendingExpenses(await listPendingExpenses());
    setConcepts(await listConcepts());
    const map = {};
    await Promise.all(exps.map(async (e) => {
      map[e.gastoId] = await listAttachmentsForExpense(e.gastoId).catch(() => []);
    }));
    setExpAtts(map);
  }

  useEffect(() => { reloadAll(); }, [rendicionId]);

  // Auto-refresh al llegar sync desde otro dispositivo
  useEffect(() => {
    function onSync() { reloadAll(); }
    window.addEventListener("cc:syncCompleted", onSync);
    return () => window.removeEventListener("cc:syncCompleted", onSync);
  }, [rendicionId]);

  const total = useMemo(() => expenses.reduce((s, e) => s + (Number(e.monto) || 0), 0), [expenses]);

  // Desglose por concepto
  const desglose = useMemo(() => {
    const conceptById = new Map(concepts.map((c) => [c.conceptId, c]));
    const map = new Map();
    for (const e of expenses) {
      const nombre = conceptById.get(e.conceptId)?.nombre || e.detalle?.split("\n")[0]?.slice(0, 30) || "Otro";
      map.set(nombre, (map.get(nombre) || 0) + (Number(e.monto) || 0));
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [expenses, concepts]);

  // ── Validación ──────────────────────────────────────────────────────────────
  async function validateBeforeStateChange(gastoIds) {
    const concepts = await listConcepts();
    const byId = new Map(concepts.map((c) => [c.conceptId, c]));
    const problems = [];
    for (const id of gastoIds) {
      const exp = await getExpense(id);
      if (!exp) continue;
      const lbl = exp.docNumero ? `${exp.docTipo} ${exp.docNumero}` : (exp.detalle || "Gasto");
      if (!exp.monto || Number(exp.monto) <= 0) problems.push(`Monto inválido en "${lbl}"`);
      if (!exp.fecha) problems.push(`Falta fecha en "${lbl}"`);
      if (!String(exp.docTipo || "").trim()) problems.push(`Falta tipo doc en "${lbl}"`);
      if (!String(exp.crCodigo || "").trim()) problems.push(`Falta CR en "${lbl}"`);
      if (!String(exp.ctaCodigo || "").trim()) problems.push(`Falta cuenta contable en "${lbl}"`);
      const c = byId.get(exp.conceptId);
      if (c?.requiereDoc && exp.docTipo !== "SinDoc" && !String(exp.docNumero || "").trim())
        problems.push(`Falta N° doc en "${lbl}"`);
      if (c?.requiereRespaldo) {
        const atts = await listAttachmentsForExpense(id);
        if (!atts?.length) problems.push(`Falta foto en "${lbl}"`);
      }
    }
    return problems;
  }

  function gastoIdsOrdered() {
    return (items || []).slice().sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0)).map((it) => it.gastoId);
  }

  // ── Re-export ───────────────────────────────────────────────────────────────
  async function reExportExcel() {
    if (!reim) return;
    clearMsg(); setBusy(true);
    try {
      const gastoIds = gastoIdsOrdered();
      const exportItems = await buildExportItems(gastoIds);
      const corr = reim.correlativo;
      const blob = await generateBatchXlsxBlob({ correlativo: corr, items: exportItems, tipoRendicion: "caja chica" });
      const filename = `Rendicion_${corr}.xlsx`;
      await shareOrDownload(blob, filename);
    } catch (e) {
      setErr(`Error Excel: ${e?.message || "desconocido"}`);
    } finally { setBusy(false); }
  }

  async function reExportPdf() {
    if (!reim) return;
    clearMsg(); setBusy(true);
    try {
      const gastoIds = gastoIdsOrdered();
      // Generar blob sin descargar automáticamente
      const { generateReceiptsPdfBlob: genBlob } = await import("../services/pdfExport.js");
      const corr = reim.correlativo;
      const blob = await genBlob({ correlativo: corr, orderedGastoIds: gastoIds.slice(0, 42) });
      const url = URL.createObjectURL(blob);
      setPdfViewer({ url, filename: `Respaldos_${corr}.pdf` });
    } catch (e) {
      const detail = [e?.message, e?.stack?.split("\n")?.[1]?.trim()].filter(Boolean).join(" — ");
      setErr(`Error PDF: ${detail || "desconocido"}`);
    } finally { setBusy(false); }
  }

  function closePdfViewer() {
    if (pdfViewer?.url) URL.revokeObjectURL(pdfViewer.url);
    setPdfViewer(null);
  }

  // ── Cancelar borrador ────────────────────────────────────────────────────────
  async function onCancelDraft() {
    if (!reim) return;
    if (!confirm("¿Cancelar este borrador?\nLos gastos volverán a estar pendientes.")) return;
    setBusy(true); clearMsg();
    try {
      await cancelReimbursement({ rendicionId: reim.rendicionId });
      nav("/rendiciones");
    } catch (e) { setErr(e?.message || "No se pudo cancelar."); } finally { setBusy(false); }
  }

  // ── Enviar ──────────────────────────────────────────────────────────────────
  async function onSend() {
    setBusy(true); clearMsg();
    try {
      const ids = gastoIdsOrdered();
      const problems = await validateBeforeStateChange(ids);
      if (problems.length > 0) {
        setErr("Corrige antes de enviar:\n" + problems.slice(0, 5).map(p => `• ${p}`).join("\n"));
        return;
      }
      await sendReimbursement({ rendicionId: reim.rendicionId });
      setOk("Rendición ENVIADA · gastos congelados");
      await reloadAll();
    } catch (e) { setErr(e?.message || "Error al enviar."); } finally { setBusy(false); }
  }

  // ── Devolver ────────────────────────────────────────────────────────────────
  async function onReturn() {
    const motivo = window.prompt("Motivo de devolución (opcional):", "") ?? "";
    setBusy(true); clearMsg();
    try {
      await returnReimbursement({ rendicionId: reim.rendicionId, motivo });
      setOk("Rendición DEVUELTA · ya se puede editar");
      await reloadAll();
    } catch (e) { setErr(e?.message || "Error."); } finally { setBusy(false); }
  }

  // ── Aprobar ─────────────────────────────────────────────────────────────────
  async function onApprove() {
    if (!confirm("¿Aprobar esta rendición?\nSe guardará un snapshot Excel+PDF.")) return;
    setBusy(true); clearMsg();
    try {
      const ids = gastoIdsOrdered();
      const problems = await validateBeforeStateChange(ids);
      if (problems.length > 0) {
        setErr("Corrige antes de aprobar:\n" + problems.slice(0, 5).map(p => `• ${p}`).join("\n"));
        return;
      }
      if (!reim.snapshotExcelBlob || !reim.snapshotPdfBlob) {
        const exportItems = await buildExportItems(ids);
        const batches = splitIntoBatches(exportItems);
        const xlsxBlob = await generateBatchXlsxBlob({ correlativo: reim.correlativo, items: batches[0] || [], tipoRendicion: "caja chica" });
        let pdfBlob = null;
        try { pdfBlob = await generateReceiptsPdfBlob({ correlativo: reim.correlativo, orderedGastoIds: ids.slice(0, 42) }); }
        catch (pe) { 
          const det = [pe?.message, pe?.stack?.split("\n")?.[1]?.trim()].filter(Boolean).join(" — ");
          console.warn("PDF snapshot failed:", det);
          setMsg({ text: `⚠️ PDF no generado: ${det}`, type: "warning" });
        }
        await setReimbursementSnapshot({ rendicionId: reim.rendicionId, excelBlob: xlsxBlob, pdfBlob, exportedAt: new Date().toISOString() });
      }
      await approveReimbursement({ rendicionId: reim.rendicionId });
      setOk("Rendición APROBADA · descarga Excel/PDF cuando quieras");
      await reloadAll();
    } catch (e) { setErr(e?.message || "Error al aprobar."); } finally { setBusy(false); }
  }

  // ── Marcar pagada ───────────────────────────────────────────────────────────
  async function onMarkPagada() {
    if (!confirm("¿Confirmar que recibiste el depósito?\nSe marcará la rendición como PAGADA.")) return;
    setBusy(true); clearMsg();
    try {
      await markReimbursementPagada({ rendicionId: reim.rendicionId });
      setOk("Rendición PAGADA ✓");
      await reloadAll();
    } catch (e) { setErr(e?.message || "Error."); } finally { setBusy(false); }
  }

  // ── Re-enviar (devuelta → enviada) ──────────────────────────────────────────
  async function onReSend() {
    setBusy(true); clearMsg();
    try {
      const ids = gastoIdsOrdered();
      const problems = await validateBeforeStateChange(ids);
      if (problems.length > 0) {
        setErr("Corrige antes de re-enviar:\n" + problems.slice(0, 5).map(p => `• ${p}`).join("\n"));
        return;
      }
      await sendReimbursement({ rendicionId: reim.rendicionId });
      setOk("Rendición RE-ENVIADA · gastos congelados");
      await reloadAll();
    } catch (e) { setErr(e?.message || "Error al re-enviar."); } finally { setBusy(false); }
  }

  async function handleRemoveExpense(gastoId) {
    if (!confirm("¿Quitar este gasto? Volverá a estar pendiente.")) return;
    setBusy(true); clearMsg();
    try { await removeExpenseFromReimbursement({ rendicionId, gastoId }); await reloadAll(); setOk("Gasto quitado."); }
    catch (e) { setErr(e?.message || "Error."); } finally { setBusy(false); }
  }

  async function handleDeleteExpense(gastoId) {
    if (!confirm("¿Eliminar este gasto definitivamente?")) return;
    setBusy(true); clearMsg();
    try { await deleteExpense(gastoId); await reloadAll(); setOk("Gasto eliminado."); }
    catch (e) { setErr(e?.message || "Error."); } finally { setBusy(false); }
  }

  async function handleAddExpense(gastoId) {
    setBusy(true); clearMsg();
    try { await addExpenseToReimbursement({ rendicionId, gastoId }); await reloadAll(); setShowAddPanel(false); setOk("Gasto incorporado."); }
    catch (e) { setErr(e?.message || "Error."); } finally { setBusy(false); }
  }

  if (!reim) return <div className="card"><div className="small">Cargando...</div></div>;

  // ── Visor PDF ─────────────────────────────────────────────────────────────
  if (pdfViewer) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100dvh", background: "#0f1117" }}>
        {/* Barra superior */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "10px 16px", background: "#1a1d2e",
          borderBottom: "1px solid var(--sep)", flexShrink: 0,
        }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: "var(--text)" }}>
            📄 {pdfViewer.filename}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <a
              href={pdfViewer.url}
              download={pdfViewer.filename}
              style={{
                padding: "6px 14px", borderRadius: 8, background: "#0ea5e9",
                color: "#001018", fontWeight: 700, fontSize: 13,
                textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6,
              }}
            >⬇ Descargar</a>
            <button
              onClick={closePdfViewer}
              style={{
                padding: "6px 14px", borderRadius: 8,
                border: "1px solid var(--sep)",
                background: "transparent", color: "var(--text)",
                fontWeight: 700, fontSize: 13, cursor: "pointer",
              }}
            >✕ Cerrar</button>
          </div>
        </div>
        {/* Visor */}
        <iframe
          src={pdfViewer.url}
          title="Vista previa PDF"
          style={{ flex: 1, border: "none", width: "100%", background: "#fff" }}
        />
      </div>
    );
  }

  const frozen = reim.estado === "enviada" || reim.estado === "aprobada" || reim.estado === "pagada";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="card">
        {/* Navegación */}
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <IconBtn icon={<IconHome />} label="Inicio" onClick={() => nav("/")} />
          <IconBtn icon={<IconBack />} label="Rendiciones" onClick={() => nav("/rendiciones")} />
        </div>

        {/* Info rendición */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 4 }}>{reim.correlativo}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <EstadoPill estado={reim.estado} />
            <span className="small" style={{ color: "var(--text3)" }}>
              {reim.fechaCreacion ? new Date(reim.fechaCreacion).toLocaleDateString("es-CL") : "—"}
            </span>
            <span style={{ fontWeight: 800 }}>${total.toLocaleString("es-CL")}</span>
            {reim.pagadaAt && <span className="small" style={{ color: "var(--text3)" }}>Pagada {new Date(reim.pagadaAt).toLocaleDateString("es-CL")}</span>}
          </div>
          {desglose.length > 0 && (
            <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: "4px 12px" }}>
              {desglose.map(([nombre, monto]) => (
                <span key={nombre} className="small" style={{ opacity: 0.7 }}>
                  {nombre}: <b>${monto.toLocaleString("es-CL")}</b>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* ── Acciones según estado ─────────────────────────────────────────── */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>

          {/* Exportar Excel y PDF por separado */}
          {reim.estado !== "pagada" && (
            <IconBtn icon={<IconExcel />} label="Excel" onClick={reExportExcel} disabled={busy} title="Excel" />
          )}
          {reim.estado !== "pagada" && (
            <IconBtn icon={<IconPdf />} label="PDF" onClick={reExportPdf} disabled={busy} title="Descargar PDF de respaldos" />
          )}

          {/* BORRADOR */}
          {reim.estado === "borrador" && <>
            <IconBtn icon={<IconSend />} label="Enviar" onClick={onSend} disabled={busy} variant="primary" />
            <IconBtn icon={<IconTrash />} onClick={onCancelDraft} disabled={busy} variant="danger" />
          </>}

          {/* ENVIADA */}
          {reim.estado === "enviada" && <>
            <IconBtn icon={<IconReturn />} label="Devolver" onClick={onReturn} disabled={busy} />
            <IconBtn icon={<IconApprove />} label="Aprobar" onClick={onApprove} disabled={busy} variant="primary" />
          </>}

          {/* APROBADA — descargas + marcar pagada */}
          {reim.estado === "aprobada" && <>
            {reim.snapshotExcelBlob && (
              <IconBtn icon={<IconExcel />} label="Excel" onClick={() => downloadSnapshotBlob(reim.snapshotExcelBlob, `Rendicion_${reim.correlativo}.xlsx`)} disabled={busy} title="Descargar Excel guardado" />
            )}
            {reim.snapshotPdfBlob && (
              <IconBtn icon={<IconPdf />} label="PDF" onClick={() => downloadSnapshotBlob(reim.snapshotPdfBlob, `Respaldos_${reim.correlativo}.pdf`)} disabled={busy} title="Descargar PDF guardado" />
            )}
            <IconBtn icon={<IconPaid />} label="Pagada" onClick={onMarkPagada} disabled={busy} variant="success" title="Marcar como pagada al recibir depósito" />
          </>}

          {/* PAGADA — solo descargas */}
          {reim.estado === "pagada" && <>
            {reim.snapshotExcelBlob && (
              <IconBtn icon={<IconExcel />} label="Excel" onClick={() => downloadSnapshotBlob(reim.snapshotExcelBlob, `Rendicion_${reim.correlativo}.xlsx`)} title="Descargar Excel" />
            )}
            {reim.snapshotPdfBlob && (
              <IconBtn icon={<IconPdf />} label="PDF" onClick={() => downloadSnapshotBlob(reim.snapshotPdfBlob, `Respaldos_${reim.correlativo}.pdf`)} title="Descargar PDF" />
            )}
          </>}

          {/* DEVUELTA */}
          {reim.estado === "devuelta" && <>
            <IconBtn icon={<IconSend />} label="Re-enviar" onClick={onReSend} disabled={busy} variant="primary" />
            <IconBtn icon={<IconTrash />} onClick={onCancelDraft} disabled={busy} variant="danger" />
          </>}
        </div>

        {/* Banner estado congelado */}
        {frozen && reim.estado !== "pagada" && (
          <Banner type="info">🔒 {reim.estado.toUpperCase()} · gastos congelados{reim.estado !== "enviada" ? "" : " hasta DEVUELTA"}</Banner>
        )}

        {/* Mensaje operación */}
        {msg.text && <Banner type={msg.type}>{msg.text}</Banner>}
      </div>

      {/* ── Lista de gastos ─────────────────────────────────────────────────── */}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontWeight: 700 }}>Gastos incluidos ({expenses.length})</div>
          {reim.estado === "devuelta" && (
            <button className="btn secondary" style={{ fontSize: 13 }} onClick={() => setShowAddPanel((v) => !v)}>
              {showAddPanel ? "Cancelar" : "+ Agregar"}
            </button>
          )}
        </div>

        {/* Panel agregar */}
        {showAddPanel && reim.estado === "devuelta" && (
          <div style={{ marginBottom: 12, padding: "10px 12px", background: "rgba(99,102,241,.1)", border: "1px solid rgba(99,102,241,.25)", borderRadius: 10 }}>
            <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 13 }}>Selecciona un gasto pendiente:</div>
            {pendingExpenses.filter((p) => Number(p.monto) > 0).length === 0 ? (
              <div className="small">No hay gastos pendientes disponibles.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {pendingExpenses.filter((p) => Number(p.monto) > 0).map((p) => (
                  <div key={p.gastoId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{p.detalle?.split("\n")[0]?.slice(0, 50) || "Sin detalle"}</div>
                      <div className="small">{new Date(p.fecha).toLocaleDateString("es-CL")} · ${Number(p.monto).toLocaleString("es-CL")}</div>
                    </div>
                    <button className="btn" style={{ fontSize: 12, padding: "5px 10px" }} disabled={busy} onClick={() => handleAddExpense(p.gastoId)}>Agregar</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {expenses.length === 0 ? (
          <div className="small" style={{ color: "var(--text3)" }}>No hay gastos en esta rendición.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {expenses.map((e) => {
              const atts = expAtts[e.gastoId] || [];
              return (
                <div key={e.gastoId} style={{ padding: "10px 0", borderTop: "1px solid var(--sep)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 6, cursor: frozen ? "default" : "pointer" }}
                        onClick={() => !frozen && nav(`/gastos/${e.gastoId}`)}
                        title={frozen ? undefined : "Editar gasto"}
                      >
                        <AttachmentGallery atts={atts} locked={frozen} />
                        {e.docTipo || "Doc"} {e.docNumero || "S/n"} · ${Number(e.monto || 0).toLocaleString("es-CL")}
                        {!frozen && <span style={{ opacity: 0.35, fontSize: 12 }}>›</span>}
                      </div>
                      <div className="small" style={{ marginTop: 2 }}>
                        {e.detalle?.split("\n")[0]?.slice(0, 55) || "—"} · {new Date(e.fecha).toLocaleDateString("es-CL")}
                      </div>
                      <div className="small" style={{ color: "var(--text3)" }}>
                        CR {e.crCodigo || "—"} · CTA {e.ctaCodigo || "—"} · Part {e.partidaCodigo || "—"}
                      </div>
                    </div>
                    {/* Acciones por gasto */}
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      {frozen ? (
                        <span style={{ fontSize: 12, opacity: 0.4, padding: "6px 8px" }}>🔒</span>
                      ) : (
                        <>
                          <IconBtn icon={<IconEdit />} onClick={() => nav(`/gastos/${e.gastoId}`)} title="Editar gasto" />
                          {reim.estado === "devuelta" && <>
                            <IconBtn icon={<IconRemove />} onClick={() => handleRemoveExpense(e.gastoId)} disabled={busy} title="Quitar de rendición" />
                            <IconBtn icon={<IconTrash />} onClick={() => handleDeleteExpense(e.gastoId)} disabled={busy} variant="danger" title="Eliminar gasto" />
                          </>}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
