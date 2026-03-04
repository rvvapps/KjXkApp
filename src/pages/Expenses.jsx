import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { listPendingExpenses, deleteExpense, listConcepts } from "../db.js";

export default function Expenses() {
  const nav = useNavigate();
  const location = useLocation();
  const [expenses, setExpenses] = useState([]);
  const [concepts, setConcepts] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [msg, setMsg] = useState("");

  async function refresh() {
    const [exps, concs] = await Promise.all([listPendingExpenses(), listConcepts()]);
    setExpenses(exps);
    setConcepts(concs);
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
    // Solo gastos completos pueden seleccionarse para rendir
    const e = expenses.find((x) => x.gastoId === id);
    if (!e || !Number(e.monto)) return;
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  function selectAll() {
    setSelected(new Set(complete.map((e) => e.gastoId)));
  }

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

  function goToRendicion() {
    if (selected.size === 0) return setMsg("Selecciona al menos un gasto para rendir.");
    nav("/rendiciones", { state: { selectedIds: Array.from(selected) } });
  }

  function ExpenseRow({ e }) {
    const isIncomplete = !Number(e.monto);
    const concept = conceptById.get(e.conceptId);
    const label = concept?.nombre || e.detalle?.split("\n")[0]?.slice(0, 40) || "Sin detalle";

    return (
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        paddingTop: 10, borderTop: "1px solid rgba(255,255,255,.08)", gap: 8,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, display: "flex", alignItems: "center", gap: 6 }}>
            {isIncomplete && <span title="Falta completar monto" style={{ color: "#facc15" }}>⚠️</span>}
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
    );
  }

  return (
    <div className="grid2">
      {/* Panel izquierdo: acciones */}
      <div className="card">
        <h2>Gastos pendientes</h2>

        <div className="row">
          <div style={{ flex: 1 }}>
            <div className="small">Total pendientes</div>
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
          {complete.length > 0 && (
            <button className="btn secondary" onClick={selectAll}>
              Seleccionar todos ({complete.length})
            </button>
          )}
          {selected.size > 0 && (
            <button className="btn" onClick={goToRendicion}>
              Crear rendición ({selected.size}) →
            </button>
          )}
        </div>
      </div>

      {/* Panel derecho: lista */}
      <div className="card">
        <h2>Detalle</h2>

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
