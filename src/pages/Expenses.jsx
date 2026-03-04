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

export default function Expenses() {
  const nav = useNavigate();
  const location = useLocation();

  const [expenses, setExpenses] = useState([]);
  const [concepts, setConcepts] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [attachCounts, setAttachCounts] = useState({}); // gastoId -> count
  const [attachData, setAttachData] = useState({});    // gastoId -> atts[]
  const [expandedAtts, setExpandedAtts] = useState(new Set());
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [showRendicion, setShowRendicion] = useState(false);

  async function refresh() {
    const [exps, concs] = await Promise.all([listPendingExpenses(), listConcepts()]);
    setExpenses(exps);
    setConcepts(concs);

    // Cargar adjuntos por gasto
    const counts = {};
    const data = {};
    await Promise.all(exps.map(async (e) => {
      const atts = await listAttachmentsForExpense(e.gastoId).catch(() => []);
      counts[e.gastoId] = atts.length;
      data[e.gastoId] = atts;
    }));
    setAttachCounts(counts);
    setAttachData(data);
  }

  useEffect(() => { refresh(); }, [location.pathname]);

  const conceptById = useMemo(() => new Map(concepts.map((c) => [c.conceptId, c])), [concepts]);
  const incomplete = useMemo(() => expenses.filter((e) => !Number(e.monto)), [expenses]);
  const complete = useMemo(() => expenses.filter((e) => Number(e.monto) > 0), [expenses]);
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
    if (!confirm("¿Eliminar este gasto y sus adjuntos? Esta acción no se puede deshacer.")) return;
    try {
      await deleteExpense(gastoId);
      setSelected((prev) => { const n = new Set(prev); n.delete(gastoId); return n; });
      await refresh();
    } catch (e) {
      setMsg(e?.message || "Error al eliminar.");
    }
  }

  // ── Validación antes de rendir ───────────────────────────────────────────
  async function validateGastos(gastoIds) {
    const problems = [];
    for (const id of gastoIds) {
      const exp = await getExpense(id);
      if (!exp) continue;
      const concept = conceptById.get(exp.conceptId);
      const label = exp.docNumero ? `${exp.docTipo} ${exp.docNumero}` : (exp.detalle || "Gasto");

      if (!exp.monto || Number(exp.monto) <= 0)
        problems.push(`Monto inválido en: "${label}"`);
      if (!exp.fecha)
        problems.push(`Falta fecha en: "${label}"`);
      if (!String(exp.docTipo || "").trim())
        problems.push(`Falta tipo doc en: "${label}"`);
      if (!String(exp.crCodigo || "").trim())
        problems.push(`Falta CR en: "${label}"`);
      if (!String(exp.ctaCodigo || "").trim())
        problems.push(`Falta cuenta contable en: "${label}"`);
      if (!String(exp.partidaCodigo || "").trim())
        problems.push(`Falta partida en: "${label}"`);
      if (concept?.requiereDoc && exp.docTipo !== "SinDoc" && !String(exp.docNumero || "").trim())
        problems.push(`Falta N° doc en: "${label}"`);
      if (concept?.requiereRespaldo && (attachCounts[id] ?? 0) === 0)
        problems.push(`Falta respaldo (foto) en: "${label}"`);
    }
    return problems;
  }

  // ── Crear rendición ──────────────────────────────────────────────────────
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
      // Actualizar total en la rendición para que aparezca en el historial
      const { updateReimbursementTotal } = await import("../db.js");
      await updateReimbursementTotal({ rendicionId, total: totalSelected });

      const exportItems = await buildExportItems(gastoIds);
      const batches = splitIntoBatches(exportItems);
      for (let i = 0; i < batches.length; i++) {
        const corr = batches.length === 1 ? correlativo : `${correlativo}_P${i + 1}`;
        await exportBatchXlsx({ correlativo: corr, items: batches[i] });
        await exportReceiptsPdf({ correlativo: corr, orderedGastoIds: gastoIds.slice(i * 42, i * 42 + 42) });
      }

      setMsg(`✅ Rendición ${correlativo} creada y exportada.`);
      setSelected(new Set());
      setShowRendicion(false);
      await refresh();
    } catch (e) {
      console.error(e);
      setMsg("❌ Error al crear rendición. Revisa la consola (F12).");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  // ── Fila de gasto ────────────────────────────────────────────────────────
  function ExpenseRow({ e }) {
    const isIncomplete = !Number(e.monto);
    const concept = conceptById.get(e.conceptId);
    const label = concept?.nombre || e.detalle?.split("\\n")[0]?.slice(0, 40) || "Sin detalle";
    const hasImage = (attachCounts[e.gastoId] ?? 0) > 0;
    const expanded = expandedAtts.has(e.gastoId);

    function toggleAtts() {
      setExpandedAtts((prev) => {
        const next = new Set(prev);
        if (next.has(e.gastoId)) next.delete(e.gastoId); else next.add(e.gastoId);
        return next;
      });
    }

    return (
      <div style={{
        paddingTop: 10, borderTop: "1px solid rgba(255,255,255,.08)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, display: "flex", alignItems: "center", gap: 6 }}>
              {isIncomplete && <span title="Falta completar monto" style={{ color: "#facc15" }}>⚠️</span>}
              <span
                title={hasImage ? `${attachCounts[e.gastoId]} adjunto(s) — click para ver` : "Sin imagen adjunta"}
                onClick={hasImage ? toggleAtts : undefined}
                style={{ fontSize: 15, opacity: hasImage ? 1 : 0.25, cursor: hasImage ? "pointer" : "default" }}
              >📎</span>
              {label}
            </div>
            <div className="small">
              {new Date(e.fecha).toLocaleDateString("es-CL")}
              {" · "}{e.docTipo || "—"}{e.docNumero ? ` ${e.docNumero}` : ""}
              {" · CR "}{e.crCodigo || "—"}
              {isIncomplete
                ? " · Sin monto — completar"
                : ` · $${Number(e.monto).toLocaleString("es-CL")}`}
            </div>
          </div>

          <div className="row" style={{ gap: 6, flexShrink: 0 }}>
            {!isIncomplete && (
              <label style={{ display: "inline-flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={selected.has(e.gastoId)}
                  onChange={() => toggle(e.gastoId)}
                />
                <span className="small">Incluir</span>
              </label>
            )}
            <button className="btn secondary" onClick={() => nav(`/gastos/${e.gastoId}`)}>
              {isIncomplete ? "Completar" : "Editar"}
            </button>
            <button className="btn danger" onClick={() => handleDelete(e.gastoId)}>
              Eliminar
            </button>
          </div>
        </div>

        {expanded && hasImage && (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,.06)" }}>
            <AttachmentGallery atts={attachData[e.gastoId] || []} locked={true} />
          </div>
        )}
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="grid2">
      {/* Panel izquierdo: acciones + rendición */}
      <div className="card">
        <h2>Gastos pendientes</h2>

        <div className="row">
          <div style={{ flex: 1 }}>
            <div className="small">Pendientes</div>
            <div className="kpi">{expenses.length}</div>
          </div>
          <div style={{ flex: 1 }}>
            <div className="small">Seleccionados</div>
            <div className="kpi">{selected.size}</div>
          </div>
          <div style={{ flex: 1 }}>
            <div className="small">Monto selec.</div>
            <div className="kpi">${totalSelected.toLocaleString("es-CL")}</div>
          </div>
        </div>

        {msg && (
          <div className="small" style={{
            padding: 10, border: "1px solid rgba(255,255,255,.12)",
            borderRadius: 12, marginTop: 10, whiteSpace: "pre-line",
          }}>
            {msg}
          </div>
        )}

        {incomplete.length > 0 && (
          <div style={{
            background: "rgba(250,204,21,.08)", border: "1px solid rgba(250,204,21,.25)",
            borderRadius: 12, padding: "8px 12px", marginTop: 10,
          }}>
            <div className="small">
              ⚠️ <b>{incomplete.length} gasto{incomplete.length !== 1 ? "s" : ""} incompleto{incomplete.length !== 1 ? "s" : ""}</b> — completa monto y documento antes de rendir.
            </div>
          </div>
        )}

        <hr />

        <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
          <Link className="btn" to="/gastos/nuevo">+ Nuevo gasto</Link>
          {complete.length > 0 && selected.size < complete.length && (
            <button className="btn secondary" onClick={selectAll}>
              Seleccionar todos ({complete.length})
            </button>
          )}
          {selected.size > 0 && (
            <button className="btn secondary" onClick={() => setSelected(new Set())}>
              Limpiar selección
            </button>
          )}
        </div>

        {/* Panel crear rendición */}
        {selected.size > 0 && (
          <div style={{
            marginTop: 14, padding: "14px 16px",
            background: "rgba(99,102,241,.1)", border: "1px solid rgba(99,102,241,.3)",
            borderRadius: 14,
          }}>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>
              Crear rendición con {selected.size} gasto{selected.size !== 1 ? "s" : ""}
            </div>
            <div className="small" style={{ marginBottom: 12 }}>
              Total: <b>${totalSelected.toLocaleString("es-CL")}</b>
              {" · "}Se exportará Excel + PDF automáticamente.
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn" disabled={busy} onClick={createAndExport}>
                {busy ? "Exportando..." : "Crear rendición + Exportar"}
              </button>
            </div>
          </div>
        )}

        <hr />
        <Link className="btn secondary" to="/rendiciones">Ver rendiciones →</Link>
      </div>

      {/* Panel derecho: lista de gastos */}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <h2 style={{ margin: 0 }}>Detalle</h2>
          <div className="small" style={{ opacity: 0.6 }}>📎 = imagen adjunta</div>
        </div>

        {expenses.length === 0 ? (
          <div className="small">No hay gastos pendientes 🎉</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {incomplete.length > 0 && (
              <>
                <div style={{ fontWeight: 700, marginBottom: 6, color: "#facc15" }}>
                  Incompletos ({incomplete.length})
                </div>
                {incomplete.map((e) => <ExpenseRow key={e.gastoId} e={e} />)}
                <div style={{ marginTop: 16, marginBottom: 6, fontWeight: 700 }}>
                  Listos para rendir ({complete.length})
                </div>
              </>
            )}
            {complete.map((e) => <ExpenseRow key={e.gastoId} e={e} />)}
          </div>
        )}
      </div>
    </div>
  );
}
