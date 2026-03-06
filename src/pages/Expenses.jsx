import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import {
  listPendingExpenses, deleteExpense, listConcepts,
  listAttachmentsForExpense, getSettings, saveSettings,
  createReimbursement, addReimbursementItems, markExpensesReimbursed,
  getExpense,
} from "../db.js";
import { buildExportItems, exportBatchXlsx, splitIntoBatches } from "../services/excelExport.js";
import AttachmentGallery from "../components/AttachmentGallery.jsx";
import { exportReceiptsPdf } from "../services/pdfExport.js";

function pad(n, width = 4) { return String(n).padStart(width, "0"); }

// Íconos SVG inline simples
const IconEdit = () => (
  <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M14.7 2.3a1 1 0 011.4 1.4l-9.9 9.9L3 15l1.4-3.2 9.9-9.9z"/>
  </svg>
);
const IconTrash = () => (
  <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M3 5h14M8 5V3h4v2M6 5l1 12h6l1-12"/>
  </svg>
);

export default function Expenses() {
  const nav = useNavigate();
  const location = useLocation();

  const [expenses, setExpenses] = useState([]);
  const [concepts, setConcepts] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [attachData, setAttachData] = useState({});
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const [exps, concs] = await Promise.all([listPendingExpenses(), listConcepts()]);
    setExpenses(exps);
    setConcepts(concs);
    setAttachData((prev) => {
      const next = { ...prev };
      for (const id of Object.keys(next)) {
        if (!exps.find((e) => e.gastoId === id)) delete next[id];
      }
      return next;
    });
  }

  async function loadAtts(gastoId) {
    if (attachData[gastoId]) return;
    const atts = await listAttachmentsForExpense(gastoId).catch(() => []);
    setAttachData((prev) => ({ ...prev, [gastoId]: atts }));
  }

  useEffect(() => {
    refresh();
    if (location.state?.flashMsg) {
      setMsg(location.state.flashMsg);
      window.history.replaceState({}, "");
    }
  }, [location.pathname]);

  const conceptById = useMemo(() => new Map(concepts.map((c) => [c.conceptId, c])), [concepts]);
  const incomplete = useMemo(() => expenses.filter((e) => !Number(e.monto)), [expenses]);
  const complete   = useMemo(() => expenses.filter((e) => Number(e.monto) > 0), [expenses]);
  const totalSelected = useMemo(
    () => expenses.filter((e) => selected.has(e.gastoId)).reduce((s, e) => s + Number(e.monto || 0), 0),
    [expenses, selected]
  );

  function toggle(id) {
    const e = expenses.find((x) => x.gastoId === id);
    if (!e || !Number(e.monto)) return;
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  }

  function selectAll() { setSelected(new Set(complete.map((e) => e.gastoId))); }

  async function handleDelete(gastoId) {
    if (!confirm("¿Eliminar este gasto y sus adjuntos?")) return;
    try {
      await deleteExpense(gastoId);
      setSelected((prev) => { const n = new Set(prev); n.delete(gastoId); return n; });
      await refresh();
    } catch (e) { setMsg(e?.message || "Error al eliminar."); }
  }

  async function validateGastos(gastoIds) {
    const problems = [];
    for (const id of gastoIds) {
      const exp = await getExpense(id);
      if (!exp) continue;
      const concept = conceptById.get(exp.conceptId);
      const label = exp.docNumero ? `${exp.docTipo} ${exp.docNumero}` : (exp.detalle || "Gasto");
      if (!exp.monto || Number(exp.monto) <= 0) problems.push(`Monto inválido en: "${label}"`);
      if (!exp.fecha) problems.push(`Falta fecha en: "${label}"`);
      if (!String(exp.docTipo || "").trim()) problems.push(`Falta tipo doc en: "${label}"`);
      if (!String(exp.crCodigo || "").trim()) problems.push(`Falta CR en: "${label}"`);
      if (!String(exp.ctaCodigo || "").trim()) problems.push(`Falta cuenta contable en: "${label}"`);
      if (!String(exp.partidaCodigo || "").trim()) problems.push(`Falta partida en: "${label}"`);
      if (concept?.requiereDoc && exp.docTipo !== "SinDoc" && !String(exp.docNumero || "").trim())
        problems.push(`Falta N° doc en: "${label}"`);
      const attsForValidation = attachData[id] ?? await listAttachmentsForExpense(id).catch(() => []);
      if (concept?.requiereRespaldo && attsForValidation.length === 0)
        problems.push(`Falta respaldo (foto) en: "${label}"`);
    }
    return problems;
  }

  async function createAndExport() {
    setMsg("");
    const gastoIds = Array.from(selected);
    if (gastoIds.length === 0) return setMsg("Selecciona al menos un gasto.");
    setBusy(true);
    try {
      const problems = await validateGastos(gastoIds);
      if (problems.length > 0) {
        const lines = problems.slice(0, 6).map((p) => `• ${p}`).join("\n");
        const more = problems.length > 6 ? `\n…y ${problems.length - 6} más.` : "";
        setMsg(`❌ Corrige estos puntos antes de rendir:\n${lines}${more}`);
        return;
      }

      const settings = await getSettings();
      const prefix = settings?.correlativoPrefix || "RC";
      const num = settings?.correlativoNextNumber || 1;
      const correlativo = `${prefix}-${new Date().getFullYear()}-${pad(num, 4)}`;

      const rendicionId = await createReimbursement({ correlativo });
      await addReimbursementItems({ rendicionId, gastoIds });
      await markExpensesReimbursed({ gastoIds, rendicionId });
      await saveSettings({ correlativoNextNumber: num + 1 });
      const { updateReimbursementTotal } = await import("../db.js");
      await updateReimbursementTotal({ rendicionId, total: totalSelected });

      // Export Excel
      const exportItems = await buildExportItems(gastoIds);
      const batches = splitIntoBatches(exportItems);
      for (let i = 0; i < batches.length; i++) {
        const corr = batches.length === 1 ? correlativo : `${correlativo}_P${i + 1}`;
        await exportBatchXlsx({ correlativo: corr, items: batches[i] });
      }

      // Export PDF — separado para capturar error sin bloquear
      try {
        for (let i = 0; i < batches.length; i++) {
          const corr = batches.length === 1 ? correlativo : `${correlativo}_P${i + 1}`;
          await exportReceiptsPdf({ correlativo: corr, orderedGastoIds: gastoIds.slice(i * 42, i * 42 + 42) });
        }
        setMsg(`✅ Rendición ${correlativo} creada. Excel y PDF exportados.`);
      } catch (pdfErr) {
        console.error("PDF error:", pdfErr);
        setMsg(`✅ Rendición ${correlativo} creada. Excel exportado.\n⚠️ PDF falló: ${pdfErr?.message || "error desconocido"}`);
      }

      setSelected(new Set());
      await refresh();
    } catch (e) {
      console.error(e);
      setMsg(`❌ Error al crear rendición: ${e?.message || "error desconocido"}`);
      await refresh();
    } finally { setBusy(false); }
  }

  // ── Fila de gasto ──────────────────────────────────────────────────────
  function ExpenseRow({ e }) {
    const isIncomplete = !Number(e.monto);
    const concept = conceptById.get(e.conceptId);
    const label = concept?.nombre || e.detalle?.split("\\n")[0]?.slice(0, 40) || "Sin detalle";

    return (
      <div style={{ paddingTop: 10, paddingBottom: 6, borderTop: "1px solid rgba(255,255,255,.07)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              {isIncomplete && <span title="Falta monto" style={{ color: "#facc15" }}>⚠️</span>}
              <AttachmentGallery atts={attachData[e.gastoId] || []} locked={true} onExpand={() => loadAtts(e.gastoId)} />
              {label}
            </div>
            <div className="small" style={{ marginTop: 2 }}>
              {new Date(e.fecha).toLocaleDateString("es-CL")}
              {" · "}{e.docTipo || "—"}{e.docNumero ? ` ${e.docNumero}` : " S/n"}
              {" · CR "}{e.crCodigo || "—"}
              {" · "}{isIncomplete ? <span style={{ color: "#facc15" }}>sin monto</span> : `$${Number(e.monto).toLocaleString("es-CL")}`}
            </div>
          </div>

          {/* Acciones */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            {!isIncomplete && (
              <input
                type="checkbox"
                checked={selected.has(e.gastoId)}
                onChange={() => toggle(e.gastoId)}
                style={{ width: 18, height: 18, cursor: "pointer" }}
                title="Incluir en rendición"
              />
            )}
            <button
              title={isIncomplete ? "Completar" : "Editar"}
              onClick={() => nav(`/gastos/${e.gastoId}`)}
              style={{ background: "transparent", border: "1px solid rgba(255,255,255,.2)", borderRadius: 8, color: "#e5e7eb", padding: "6px 8px", cursor: "pointer", display: "flex", alignItems: "center" }}
            >
              <IconEdit />
            </button>
            <button
              title="Eliminar"
              onClick={() => handleDelete(e.gastoId)}
              style={{ background: "transparent", border: "1px solid rgba(239,68,68,.4)", borderRadius: 8, color: "#f87171", padding: "6px 8px", cursor: "pointer", display: "flex", alignItems: "center" }}
            >
              <IconTrash />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

      {/* Header compacto con KPIs + botón nuevo */}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div>
            <div className="small" style={{ opacity: 0.6 }}>Gastos pendientes</div>
            <div style={{ display: "flex", gap: 20, marginTop: 4 }}>
              <div><div className="kpi" style={{ fontSize: 22 }}>{expenses.length}</div><div className="small">total</div></div>
              <div><div className="kpi" style={{ fontSize: 22, color: selected.size > 0 ? "#e5e7eb" : "inherit" }}>{selected.size}</div><div className="small">selec.</div></div>
              <div><div className="kpi" style={{ fontSize: 22, color: totalSelected > 0 ? "#86efac" : "inherit" }}>${totalSelected.toLocaleString("es-CL")}</div><div className="small">monto</div></div>
            </div>
          </div>
          <Link className="btn" to="/gastos/nuevo" style={{ flexShrink: 0 }}>+ Nuevo</Link>
        </div>

        {/* Acciones de selección */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {complete.length > 0 && selected.size < complete.length && (
            <button className="btn secondary" style={{ fontSize: 13 }} onClick={selectAll}>
              Selec. todos ({complete.length})
            </button>
          )}
          {selected.size > 0 && (
            <button className="btn secondary" style={{ fontSize: 13 }} onClick={() => setSelected(new Set())}>
              Limpiar selección
            </button>
          )}
          <Link className="btn secondary" style={{ fontSize: 13 }} to="/rendiciones">Ver rendiciones →</Link>
        </div>

        {msg && (
          <div className="small" style={{ padding: "8px 12px", border: "1px solid rgba(255,255,255,.12)", borderRadius: 10, marginTop: 10, whiteSpace: "pre-line" }}>
            {msg}
          </div>
        )}
      </div>

      {/* Lista de gastos */}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontWeight: 700 }}>Detalle</div>
          <div className="small" style={{ opacity: 0.5 }}>📎 = imagen</div>
        </div>

        {expenses.length === 0 ? (
          <div className="small" style={{ opacity: 0.6 }}>No hay gastos pendientes 🎉</div>
        ) : (
          <div>
            {incomplete.length > 0 && (
              <>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#facc15", marginBottom: 4 }}>Incompletos ({incomplete.length})</div>
                {incomplete.map((e) => <ExpenseRow key={e.gastoId} e={e} />)}
                <div style={{ fontSize: 12, fontWeight: 700, marginTop: 12, marginBottom: 4, opacity: 0.7 }}>Listos ({complete.length})</div>
              </>
            )}
            {complete.map((e) => <ExpenseRow key={e.gastoId} e={e} />)}
          </div>
        )}
      </div>

      {/* Crear rendición — DEBAJO de la lista */}
      {selected.size > 0 && (
        <div style={{ padding: "14px 16px", background: "rgba(99,102,241,.1)", border: "1px solid rgba(99,102,241,.3)", borderRadius: 14 }}>
          <div style={{ fontWeight: 800, marginBottom: 4 }}>
            Crear rendición · {selected.size} gasto{selected.size !== 1 ? "s" : ""} · ${totalSelected.toLocaleString("es-CL")}
          </div>
          <div className="small" style={{ marginBottom: 10, opacity: 0.7 }}>Se exportará Excel + PDF automáticamente.</div>
          <button className="btn" disabled={busy} onClick={createAndExport}>
            {busy ? "Exportando..." : "Crear rendición + Exportar"}
          </button>
        </div>
      )}
    </div>
  );
}
