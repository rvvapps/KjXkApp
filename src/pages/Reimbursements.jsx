import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { listReimbursements } from "../db.js";

const ESTADOS = ["todos", "borrador", "enviada", "devuelta", "aprobada", "pagada"];

const ESTADO_LABEL = {
  todos: "Todos",
  borrador: "Borrador",
  enviada: "Enviada",
  devuelta: "Devuelta",
  aprobada: "Aprobada",
  pagada: "Pagada",
};

const ESTADO_COLOR = {
  borrador: "rgba(148,163,184,.08)",
  enviada:  "rgba(14,165,233,.10)",
  devuelta: "rgba(239,68,68,.10)",
  aprobada: "rgba(99,102,241,.10)",
  pagada:   "rgba(34,197,94,.10)",
};

export default function Reimbursements() {
  const [reims, setReims] = useState([]);
  const [filtro, setFiltro] = useState("todos");

  useEffect(() => {
    listReimbursements().then(setReims);
  }, []);

  const filtered = useMemo(() => {
    const list = filtro === "todos" ? reims : reims.filter((r) => r.estado === filtro);
    return list.slice().sort((a, b) => (b.fechaCreacion || "").localeCompare(a.fechaCreacion || ""));
  }, [reims, filtro]);

  // Conteos por estado para las pills del filtro
  const counts = useMemo(() => {
    const c = { todos: reims.length };
    for (const r of reims) c[r.estado] = (c[r.estado] || 0) + 1;
    return c;
  }, [reims]);

  return (
    <div>
      {/* Filtros */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {ESTADOS.map((e) => (
              <button
                key={e}
                onClick={() => setFiltro(e)}
                className="btn"
                style={{
                  background: filtro === e ? "rgba(255,255,255,.18)" : "rgba(255,255,255,.05)",
                  border: filtro === e ? "1px solid rgba(255,255,255,.5)" : "1px solid rgba(255,255,255,.18)",
                  color: filtro === e ? "#fff" : "rgba(255,255,255,.75)",
                  fontWeight: filtro === e ? 800 : 500,
                  opacity: counts[e] || e === "todos" ? 1 : 0.35,
                  fontSize: 13,
                }}
              >
                {ESTADO_LABEL[e]}
                {counts[e] ? <span style={{ marginLeft: 6, opacity: 0.7 }}>({counts[e]})</span> : null}
              </button>
            ))}
        </div>
      </div>

      {/* Lista */}
      <div className="card">
        {filtered.length === 0 ? (
          <div className="small">
            {filtro === "todos"
              ? "Aún no hay rendiciones."
              : `No hay rendiciones con estado "${ESTADO_LABEL[filtro]}".`}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {filtered.map((r) => {
              const total = r.total ?? 0;
              return (
                <Link
                  key={r.rendicionId}
                  to={`/rendiciones/${r.rendicionId}`}
                  style={{ textDecoration: "none", color: "inherit" }}
                >
                  <div style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "10px 14px",
                    background: ESTADO_COLOR[r.estado] || "rgba(255,255,255,.04)",
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,.08)",
                  }}>
                    <div>
                      <div style={{ fontWeight: 900 }}>{r.correlativo}</div>
                      <div className="small">
                        {new Date(r.fechaCreacion).toLocaleDateString("es-CL")}
                        {total > 0 && ` · $${Number(total).toLocaleString("es-CL")}`}
                        {r.motivoDevuelta && ` · "${r.motivoDevuelta}"`}
                      </div>
                    </div>
                    <div className="row" style={{ gap: 8, alignItems: "center" }}>
                      <span style={{
                        padding: "3px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700,
                        background: ESTADO_COLOR[r.estado] || "rgba(255,255,255,.06)",
                        border: "1px solid rgba(255,255,255,.15)",
                        color: "#e5e7eb",
                      }}>{ESTADO_LABEL[r.estado] || r.estado}</span>
                      <span style={{ opacity: 0.5, fontSize: 16 }}>›</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
