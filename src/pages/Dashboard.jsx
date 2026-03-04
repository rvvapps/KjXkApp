import React, { useEffect, useMemo, useState } from "react";
import { listPendingExpenses, listReimbursements } from "../db.js";
import { Link } from "react-router-dom";

export default function Dashboard() {
  const [pending, setPending] = useState([]);
  const [reims, setReims] = useState([]);

  useEffect(() => {
    (async () => {
      setPending(await listPendingExpenses());
      setReims(await listReimbursements());
    })();
  }, []);

  const incomplete = useMemo(() => pending.filter((e) => !Number(e.monto)), [pending]);
  const complete = useMemo(() => pending.filter((e) => Number(e.monto) > 0), [pending]);
  const totalPending = useMemo(
    () => complete.reduce((s, e) => s + Number(e.monto), 0),
    [complete]
  );

  const lastReims = reims.slice(0, 4);

  return (
    <div className="grid2">
      {/* KPIs */}
      <div className="card">
        <h2>Resumen</h2>
        <div className="row">
          <div style={{ flex: 1 }}>
            <div className="small">Gastos pendientes</div>
            <div className="kpi">{complete.length}</div>
          </div>
          <div style={{ flex: 1 }}>
            <div className="small">Monto pendiente</div>
            <div className="kpi">${totalPending.toLocaleString("es-CL")}</div>
          </div>
          <div style={{ flex: 1 }}>
            <div className="small">Rendiciones</div>
            <div className="kpi">{reims.length}</div>
          </div>
        </div>

        {incomplete.length > 0 && (
          <div style={{
            background: "rgba(250,204,21,.08)", border: "1px solid rgba(250,204,21,.25)",
            borderRadius: 12, padding: "8px 12px", marginTop: 12,
          }}>
            <div className="small">
              ⚠️ <b>{incomplete.length} gasto{incomplete.length !== 1 ? "s" : ""} incompleto{incomplete.length !== 1 ? "s" : ""}</b> — ve a Gastos para completarlos.
            </div>
          </div>
        )}

        <hr />

        <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
          <Link className="btn" to="/gastos/nuevo">+ Nuevo gasto</Link>
          <Link className="btn secondary" to="/traslados">Traslados</Link>
          <Link className="btn secondary" to="/gastos">Ver gastos</Link>
          <Link className="btn secondary" to="/rendiciones">Rendiciones</Link>
        </div>
      </div>

      {/* Últimas rendiciones */}
      <div className="card">
        <h2>Últimas rendiciones</h2>
        {lastReims.length === 0 ? (
          <div className="small">Aún no hay rendiciones.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {lastReims.map((r) => (
              <Link
                key={r.rendicionId}
                to={`/rendiciones/${r.rendicionId}`}
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <div className="row" style={{
                  justifyContent: "space-between", alignItems: "center",
                  paddingTop: 8, borderTop: "1px solid rgba(255,255,255,.08)",
                }}>
                  <div>
                    <div style={{ fontWeight: 800 }}>{r.correlativo}</div>
                    <div className="small">{new Date(r.fechaCreacion).toLocaleDateString("es-CL")}</div>
                  </div>
                  <span className="pill">{r.estado}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
        <hr />
        <Link className="btn secondary" to="/rendiciones">Ver todas</Link>
      </div>
    </div>
  );
}
