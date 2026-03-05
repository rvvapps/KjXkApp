import React, { useEffect, useMemo, useState } from "react";
import { listPendingExpenses, listReimbursements, listTransfersByEstado, listAttachmentsForExpense, listConcepts } from "../db.js";
import { Link } from "react-router-dom";

const ESTADO_STYLE = {
  borrador:  { bg: "rgba(255,255,255,.06)",    border: "rgba(255,255,255,.15)",  color: "#e5e7eb",  label: "Borrador" },
  enviada:   { bg: "rgba(14,165,233,.10)",     border: "rgba(14,165,233,.35)",   color: "#7dd3fc",  label: "Enviada" },
  devuelta:  { bg: "rgba(239,68,68,.10)",      border: "rgba(239,68,68,.35)",    color: "#fca5a5",  label: "Devuelta" },
  aprobada:  { bg: "rgba(99,102,241,.10)",     border: "rgba(99,102,241,.35)",   color: "#a5b4fc",  label: "Aprobada" },
  pagada:    { bg: "rgba(34,197,94,.10)",      border: "rgba(34,197,94,.35)",    color: "#86efac",  label: "Pagada" },
};

function StatePill({ estado }) {
  const s = ESTADO_STYLE[estado] || ESTADO_STYLE.borrador;
  return (
    <span style={{
      padding: "2px 8px", borderRadius: 999,
      background: s.bg, border: `1px solid ${s.border}`, color: s.color,
      fontSize: 11, fontWeight: 700,
    }}>{s.label}</span>
  );
}

function KpiCard({ label, value, sub, color }) {
  return (
    <div style={{ flex: 1, minWidth: 80 }}>
      <div className="small" style={{ opacity: 0.7 }}>{label}</div>
      <div className="kpi" style={{ color: color || "inherit", fontSize: 22, lineHeight: 1.2 }}>{value}</div>
      {sub && <div className="small" style={{ opacity: 0.6, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function AlertBanner({ color, icon, children }) {
  const colors = {
    yellow: { bg: "rgba(250,204,21,.08)", border: "rgba(250,204,21,.25)", text: "#fde047" },
    red:    { bg: "rgba(239,68,68,.08)",  border: "rgba(239,68,68,.25)",  text: "#fca5a5" },
    blue:   { bg: "rgba(14,165,233,.08)", border: "rgba(14,165,233,.25)", text: "#7dd3fc" },
  };
  const s = colors[color] || colors.yellow;
  return (
    <div style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: 12, padding: "8px 12px", marginBottom: 8 }}>
      <div className="small" style={{ color: s.text }}>{icon} {children}</div>
    </div>
  );
}

export default function Dashboard() {
  const [pending, setPending] = useState([]);
  const [reims, setReims] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [attachCounts, setAttachCounts] = useState({});
  const [concepts, setConcepts] = useState([]);
  const [balanceYear, setBalanceYear] = useState("todos");

  useEffect(() => {
    (async () => {
      const [pend, rms, trns, concs] = await Promise.all([
        listPendingExpenses(),
        listReimbursements(),
        listTransfersByEstado("pendiente").catch(() => []),
        listConcepts(),
      ]);
      setPending(pend);
      setReims(rms);
      setTransfers(trns);
      setConcepts(concs);

      // Contar adjuntos solo para gastos completos (lazy: solo contamos, no cargamos blobs)
      const counts = {};
      await Promise.all(pend.filter(e => Number(e.monto) > 0).map(async (e) => {
        const atts = await listAttachmentsForExpense(e.gastoId).catch(() => []);
        counts[e.gastoId] = atts.length;
      }));
      setAttachCounts(counts);
    })();
  }, []);

  const conceptMap = useMemo(() => new Map(concepts.map((c) => [c.conceptId, c])), [concepts]);

  // Gastos
  const incomplete = useMemo(() => pending.filter((e) => !Number(e.monto)), [pending]);
  const complete   = useMemo(() => pending.filter((e) => Number(e.monto) > 0), [pending]);
  const sinImagen  = useMemo(() => complete.filter((e) => {
    const concept = conceptMap.get(e.conceptId);
    return concept?.requiereRespaldo && (attachCounts[e.gastoId] ?? 0) === 0;
  }), [complete, conceptMap, attachCounts]);
  const totalPending = useMemo(() => complete.reduce((s, e) => s + Number(e.monto), 0), [complete]);

  // Rendiciones por estado
  const reimsByEstado = useMemo(() => {
    const map = { borrador: [], enviada: [], devuelta: [], aprobada: [], pagada: [] };
    reims.forEach((r) => { if (map[r.estado]) map[r.estado].push(r); });
    return map;
  }, [reims]);

  const totalByEstado = (estado) => reimsByEstado[estado].reduce((s, r) => s + Number(r.total || 0), 0);

  // Años disponibles en rendiciones
  const availableYears = useMemo(() => {
    const years = new Set(reims.map((r) => (r.fechaCreacion || "").slice(0, 4)).filter(Boolean));
    return Array.from(years).sort((a, b) => b.localeCompare(a));
  }, [reims]);

  // Balance — histórico o filtrado por año
  const reimsBalance = useMemo(() => {
    if (balanceYear === "todos") return reims;
    return reims.filter((r) => (r.fechaCreacion || "").startsWith(balanceYear));
  }, [reims, balanceYear]);
  const totalGastadoAnio = useMemo(() => reimsBalance.filter((r) => ["enviada", "aprobada", "pagada"].includes(r.estado)).reduce((s, r) => s + Number(r.total || 0), 0), [reimsBalance]);
  const totalCobradoAnio = useMemo(() => reimsBalance.filter((r) => r.estado === "pagada").reduce((s, r) => s + Number(r.total || 0), 0), [reimsBalance]);
  const totalPorCobrar   = useMemo(() => reimsBalance.filter((r) => ["enviada", "aprobada"].includes(r.estado)).reduce((s, r) => s + Number(r.total || 0), 0), [reimsBalance]);

  // Últimas rendiciones activas (no pagadas ni borrador vacío)
  const lastReims = reims.slice(0, 5);

  const fmt = (n) => `$${Number(n).toLocaleString("es-CL")}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* ── ALERTAS ── */}
      {(transfers.length > 0 || incomplete.length > 0 || sinImagen.length > 0 || reimsByEstado.devuelta.length > 0) && (
        <div>
          {reimsByEstado.devuelta.length > 0 && (
            <AlertBanner color="red" icon="↩️">
              <b>{reimsByEstado.devuelta.length} rendición{reimsByEstado.devuelta.length !== 1 ? "es" : ""} devuelta{reimsByEstado.devuelta.length !== 1 ? "s" : ""}</b> — requieren corrección.{" "}
              <Link to="/rendiciones" style={{ color: "inherit", textDecoration: "underline" }}>Ver rendiciones</Link>
            </AlertBanner>
          )}
          {transfers.length > 0 && (
            <AlertBanner color="blue" icon="🚗">
              <b>{transfers.length} trayecto{transfers.length !== 1 ? "s" : ""}</b> sin generar gasto.{" "}
              <Link to="/traslados" style={{ color: "inherit", textDecoration: "underline" }}>Ir a Traslados</Link>
            </AlertBanner>
          )}
          {incomplete.length > 0 && (
            <AlertBanner color="yellow" icon="⚠️">
              <b>{incomplete.length} gasto{incomplete.length !== 1 ? "s" : ""} incompleto{incomplete.length !== 1 ? "s" : ""}</b> — falta monto.{" "}
              <Link to="/gastos" style={{ color: "inherit", textDecoration: "underline" }}>Completar</Link>
            </AlertBanner>
          )}
          {sinImagen.length > 0 && (
            <AlertBanner color="yellow" icon="📎">
              <b>{sinImagen.length} gasto{sinImagen.length !== 1 ? "s" : ""} sin imagen</b> — requieren respaldo.{" "}
              <Link to="/gastos" style={{ color: "inherit", textDecoration: "underline" }}>Agregar</Link>
            </AlertBanner>
          )}
        </div>
      )}

      <div className="grid2">

        {/* ── GASTOS PENDIENTES ── */}
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h2 style={{ margin: 0 }}>Pendiente</h2>
            <Link className="btn" to="/gastos/nuevo" style={{ fontSize: 13 }}>+ Nuevo gasto</Link>
          </div>

          <div className="row" style={{ gap: 0, flexWrap: "wrap" }}>
            <KpiCard label="Listos para rendir" value={complete.length} sub={complete.length > 0 ? fmt(totalPending) : "sin gastos"} color={complete.length > 0 ? "#e5e7eb" : undefined} />
            <KpiCard label="Incompletos" value={incomplete.length} color={incomplete.length > 0 ? "#fde047" : undefined} />
            <KpiCard label="Trayectos" value={transfers.length} sub="sin gasto" color={transfers.length > 0 ? "#7dd3fc" : undefined} />
          </div>

          <hr />
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <Link className="btn secondary" to="/gastos" style={{ fontSize: 13 }}>Ver gastos</Link>
            <Link className="btn secondary" to="/traslados" style={{ fontSize: 13 }}>Traslados</Link>
          </div>
        </div>

        {/* ── RENDICIONES ── */}
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h2 style={{ margin: 0 }}>Rendiciones</h2>
            <Link className="btn secondary" to="/rendiciones" style={{ fontSize: 13 }}>Ver todas</Link>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {["borrador", "enviada", "devuelta", "aprobada", "pagada"].map((estado) => {
              const items = reimsByEstado[estado];
              const total = totalByEstado(estado);
              const s = ESTADO_STYLE[estado];
              if (items.length === 0) return null;
              return (
                <div key={estado} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  background: s.bg, border: `1px solid ${s.border}`,
                  borderRadius: 10, padding: "6px 12px",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <StatePill estado={estado} />
                    <span style={{ fontWeight: 700 }}>{items.length}</span>
                  </div>
                  <span className="small" style={{ color: s.color, fontWeight: 700 }}>{fmt(total)}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── BALANCE ── */}
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h2 style={{ margin: 0 }}>
              Balance {balanceYear === "todos" ? "histórico" : balanceYear}
            </h2>
            {availableYears.length > 0 && (
              <select
                value={balanceYear}
                onChange={(e) => setBalanceYear(e.target.value)}
                style={{
                  background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.15)",
                  borderRadius: 8, color: "#e5e7eb", padding: "4px 8px", fontSize: 12, cursor: "pointer",
                }}
              >
                <option value="todos">Histórico</option>
                {availableYears.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            )}
          </div>

          <div className="row" style={{ gap: 0, flexWrap: "wrap", marginBottom: 16 }}>
            <KpiCard label="Gastado" value={fmt(totalGastadoAnio)} sub="enviadas+aprobadas+pagadas" />
            <KpiCard label="Cobrado" value={fmt(totalCobradoAnio)} color="#86efac" sub="pagadas" />
            <KpiCard label="Por cobrar" value={fmt(totalPorCobrar)} color={totalPorCobrar > 0 ? "#7dd3fc" : undefined} sub="enviadas+aprobadas" />
          </div>

          {totalGastadoAnio > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div className="small" style={{ marginBottom: 4, opacity: 0.7 }}>
                Cobrado {Math.round(totalCobradoAnio / totalGastadoAnio * 100)}% del total gastado
              </div>
              <div style={{ height: 8, borderRadius: 99, background: "rgba(255,255,255,.08)", overflow: "hidden" }}>
                <div style={{
                  height: "100%", borderRadius: 99,
                  background: "linear-gradient(90deg, #22c55e, #86efac)",
                  width: `${Math.min(100, Math.round(totalCobradoAnio / totalGastadoAnio * 100))}%`,
                  transition: "width .4s ease",
                }} />
              </div>
              {totalPorCobrar > 0 && (
                <div style={{ height: 4, borderRadius: 99, background: "rgba(255,255,255,.04)", overflow: "hidden", marginTop: 3 }}>
                  <div style={{
                    height: "100%", borderRadius: 99, background: "rgba(14,165,233,.5)",
                    width: `${Math.min(100, Math.round(totalPorCobrar / totalGastadoAnio * 100))}%`,
                  }} />
                </div>
              )}
            </div>
          )}

          {totalGastadoAnio === 0 && (
            <div className="small" style={{ opacity: 0.5 }}>Sin rendiciones {balanceYear !== "todos" ? `en ${balanceYear}` : "registradas"}.</div>
          )}
        </div>

        {/* ── ÚLTIMAS RENDICIONES ── */}
        <div className="card">
          <h2>Últimas rendiciones</h2>
          {lastReims.length === 0 ? (
            <div className="small" style={{ opacity: 0.6 }}>Aún no hay rendiciones.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {lastReims.map((r) => (
                <Link key={r.rendicionId} to={`/rendiciones/${r.rendicionId}`} style={{ textDecoration: "none", color: "inherit" }}>
                  <div style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    paddingTop: 8, borderTop: "1px solid rgba(255,255,255,.08)",
                  }}>
                    <div>
                      <div style={{ fontWeight: 800 }}>{r.correlativo}</div>
                      <div className="small" style={{ opacity: 0.6 }}>
                        {new Date(r.fechaCreacion).toLocaleDateString("es-CL")}
                        {r.total ? ` · ${fmt(r.total)}` : ""}
                      </div>
                    </div>
                    <StatePill estado={r.estado} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
