import React, { useEffect, useMemo, useState } from "react";
import { listPendingExpenses, listReimbursements, deleteExpense } from "../db.js";
import { Link, useNavigate } from "react-router-dom";

export default function Dashboard() {
  const nav = useNavigate();
  const [pending, setPending] = useState([]);
  const [reims, setReims] = useState([]);

  async function refresh() {
    setPending(await listPendingExpenses());
    setReims(await listReimbursements());
  }

  useEffect(() => { refresh(); }, []);

  const totalPending = useMemo(
    () => pending.filter((e) => Number(e.monto) > 0).reduce((s, e) => s + Number(e.monto), 0),
    [pending]
  );

  const incomplete = useMemo(() => pending.filter((e) => !Number(e.monto)), [pending]);
  const complete = useMemo(() => pending.filter((e) => Number(e.monto) > 0), [pending]);

  async function handleDelete(gastoId) {
    if (!confirm("¿Eliminar este gasto? Esta acción no se puede deshacer.")) return;
    try {
      await deleteExpense(gastoId);
      await refresh();
    } catch (e) {
      alert(e?.message || "Error al eliminar.");
    }
  }

  function ExpenseRow({ e }) {
    const isIncomplete = !Number(e.monto);
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          paddingTop: 8,
          borderTop: "1px solid rgba(255,255,255,.08)",
          gap: 8,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, display: "flex", alignItems: "center", gap: 6 }}>
            {isIncomplete && (
              <span title="Gasto incompleto — falta monto" style={{ color: "#facc15" }}>⚠️</span>
            )}
            {e.detalle
              ? String(e.detalle).split("\n")[0].slice(0, 40)
              : e.conceptId
              ? `Concepto: ${e.conceptId.slice(0, 8)}…`
              : "Sin detalle"}
          </div>
          <div className="small">
            {new Date(e.fecha).toLocaleDateString("es-CL")}
            {isIncomplete
              ? " · Sin monto — pendiente de completar"
              : ` · $${Number(e.monto).toLocaleString("es-CL")}`}
          </div>
        </div>
        <div className="row" style={{ gap: 6 }}>
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
      <div className="card">
        <h2>Estado</h2>
        <div className="row">
          <div style={{ flex: 1, minWidth: 220 }}>
            <div className="small">Gastos pendientes</div>
            <div className="kpi">{pending.length}</div>
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div className="small">Monto pendiente</div>
            <div className="kpi">${totalPending.toLocaleString("es-CL")}</div>
          </div>
        </div>

        {incomplete.length > 0 && (
          <div
            style={{
              background: "rgba(250,204,21,.1)",
              border: "1px solid rgba(250,204,21,.3)",
              borderRadius: 12,
              padding: "8px 12px",
              marginTop: 10,
            }}
          >
            <div className="small">
              ⚠️ <b>{incomplete.length} gasto{incomplete.length > 1 ? "s" : ""} incompleto{incomplete.length > 1 ? "s" : ""}</b> — falta completar monto y documento.
            </div>
          </div>
        )}

        <hr />
        <div className="row">
          <Link className="btn" to="/gastos/nuevo">Registrar gasto</Link>
          <Link className="btn secondary" to="/rendiciones">Crear rendición</Link>
        </div>
      </div>

      <div className="card">
        <h2>Últimas rendiciones</h2>
        {reims.length === 0 ? (
          <div className="small">Aún no tienes rendiciones.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {reims.slice(0, 5).map((r) => (
              <div
                key={r.rendicionId}
                className="row"
                style={{ justifyContent: "space-between", alignItems: "center", paddingTop: 8, borderTop: "1px solid rgba(255,255,255,.08)" }}
              >
                <div>
                  <div style={{ fontWeight: 800 }}>{r.correlativo}</div>
                  <div className="small">{new Date(r.fechaCreacion).toLocaleString("es-CL")}</div>
                </div>
                <span className="pill">{r.estado}</span>
              </div>
            ))}
          </div>
        )}
        <hr />
        <Link className="btn secondary" to="/rendiciones">Ver todas</Link>
      </div>

      {/* Gastos incompletos */}
      {incomplete.length > 0 && (
        <div className="card">
          <h2>⚠️ Pendientes de completar</h2>
          <div className="small" style={{ marginBottom: 10 }}>
            Estos gastos fueron pre-creados desde Traslados. Completa monto y documento antes de rendir.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {incomplete.map((e) => <ExpenseRow key={e.gastoId} e={e} />)}
          </div>
        </div>
      )}

      {/* Gastos completos pendientes */}
      {complete.length > 0 && (
        <div className="card">
          <h2>Gastos pendientes de rendir</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {complete.map((e) => <ExpenseRow key={e.gastoId} e={e} />)}
          </div>
        </div>
      )}
    </div>
  );
}
