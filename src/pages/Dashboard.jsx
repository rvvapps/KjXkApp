import React, { useEffect, useMemo, useState } from "react";
import { listPendingExpenses, listReimbursements, listTransfersByEstado, listAttachmentsForExpense, listConcepts, getSettings, getSyncState } from "../db.js";
import { Link } from "react-router-dom";

const ESTADO_STYLE = {
  borrador:  { bg: "var(--bg3)", border: "var(--sep)",  color: "var(--text)",  label: "Borrador" },
  enviada:   { bg: "rgba(14,165,233,.10)",     border: "rgba(14,165,233,.35)",   color: "var(--accent)",  label: "Enviada" },
  devuelta:  { bg: "rgba(239,68,68,.10)",      border: "rgba(239,68,68,.35)",    color: "#fca5a5",  label: "Devuelta" },
  aprobada:  { bg: "rgba(99,102,241,.10)",     border: "rgba(99,102,241,.35)",   color: "#a5b4fc",  label: "Aprobada" },
  pagada:    { bg: "rgba(34,197,94,.10)",      border: "rgba(34,197,94,.35)",    color: "var(--success)",  label: "Pagada" },
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
    yellow: { bg: "rgba(250,204,21,.08)", border: "rgba(250,204,21,.25)", text: "var(--warning)" },
    red:    { bg: "rgba(239,68,68,.08)",  border: "rgba(239,68,68,.25)",  text: "#fca5a5" },
    blue:   { bg: "rgba(14,165,233,.08)", border: "rgba(14,165,233,.25)", text: "var(--accent)" },
  };
  const s = colors[color] || colors.yellow;
  return (
    <div style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: 12, padding: "8px 12px", marginBottom: 8 }}>
      <div className="small" style={{ color: s.text }}>{icon} {children}</div>
    </div>
  );
}


function BalanceSection({ totalGastado, totalCobrado, totalPorCobrar, availableYears, balanceYear, setBalanceYear, fmt }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div style={{ marginTop: 10, borderTop: "1px solid var(--sep)", paddingTop: 10 }}>
      <div
        onClick={() => setOpen((v) => !v)}
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", userSelect: "none" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 13, opacity: 0.8 }}>Balance</span>
          {!open && totalPorCobrar > 0 && (
            <span style={{ fontSize: 13, fontWeight: 800, color: "var(--accent)" }}>{fmt(totalPorCobrar)} por cobrar</span>
          )}
        </div>
        <span style={{ fontSize: 12, opacity: 0.5 }}>{open ? "▲" : "▼"}</span>
      </div>

      {open && (
        <div style={{ marginTop: 10 }}>
          {availableYears.length > 0 && (
            <select
              value={balanceYear}
              onChange={(e) => setBalanceYear(e.target.value)}
              style={{ background: "var(--bg3)", border: "1px solid var(--sep)", borderRadius: 8, color: "var(--text)", padding: "4px 8px", fontSize: 12, marginBottom: 10 }}
            >
              <option value="todos">Histórico</option>
              {availableYears.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { label: "Gastado",    value: fmt(totalGastado),    color: "var(--text)" },
              { label: "Cobrado",    value: fmt(totalCobrado),    color: "var(--success)" },
              { label: "Por cobrar", value: fmt(totalPorCobrar),  color: totalPorCobrar > 0 ? "#7dd3fc" : "#e5e7eb" },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 13, opacity: 0.8 }}>{label}</span>
                <span style={{ fontWeight: 800, fontSize: 15, color }}>{value}</span>
              </div>
            ))}
          </div>
          {totalGastado > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ height: 6, borderRadius: 99, background: "var(--bg3)", overflow: "hidden" }}>
                <div style={{ height: "100%", borderRadius: 99, background: "linear-gradient(90deg,#22c55e,#86efac)", width: `${Math.min(100, Math.round(totalCobrado / totalGastado * 100))}%`, transition: "width .4s" }} />
              </div>
              <div className="small" style={{ color: "var(--text3)", marginTop: 4 }}>Cobrado {Math.round(totalCobrado / totalGastado * 100)}%</div>
            </div>
          )}
          {totalGastado === 0 && <div className="small" style={{ color: "var(--text3)" }}>Sin rendiciones {balanceYear !== "todos" ? `en ${balanceYear}` : "registradas"}.</div>}
        </div>
      )}
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
  const [syncInfo, setSyncInfo] = useState({ connected: false, lastSync: null });

  async function loadSyncInfo() {
    try {
      const [st, s] = await Promise.all([getSyncState(), getSettings()]);
      setSyncInfo({
        connected: !!(st?.auth?.connectedAt && st?.rootFolderItemId),
        lastSync: s?.lastSyncAt || null,
      });
    } catch {}
  }

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
      await loadSyncInfo();

      // Contar adjuntos solo para gastos completos (lazy: solo contamos, no cargamos blobs)
      const counts = {};
      await Promise.all(pend.filter(e => Number(e.monto) > 0).map(async (e) => {
        const atts = await listAttachmentsForExpense(e.gastoId).catch(() => []);
        counts[e.gastoId] = atts.length;
      }));
      setAttachCounts(counts);
    })();
  }, []);

  // Auto-refresh al completar sync
  useEffect(() => {
    async function onSync() {
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
      await loadSyncInfo();
    }
    window.addEventListener("cc:syncCompleted", onSync);
    return () => window.removeEventListener("cc:syncCompleted", onSync);
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

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

        {/* ── ESTADO SYNC ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12, opacity: 0.65, paddingLeft: 2 }}>
          <span>
            {syncInfo.connected
              ? <span style={{ color: "var(--success)" }}>● OneDrive conectado</span>
              : <span style={{ color: "var(--danger)" }}>● OneDrive desconectado</span>
            }
          </span>
          {syncInfo.lastSync && (
            <span>Último sync: {new Date(syncInfo.lastSync).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}</span>
          )}
        </div>

        {/* ── PENDIENTE ── */}
        <div className="card">
          <div style={{ marginBottom: 10 }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: "var(--text3)" }}>Gastos Pendientes</span>
          </div>
          <div className="row" style={{ gap: 0, flexWrap: "wrap", marginBottom: 10 }}>
            <KpiCard label="Listos" value={complete.length} sub={complete.length > 0 ? fmt(totalPending) : "sin gastos"} color={complete.length > 0 ? "#e5e7eb" : undefined} />
            <KpiCard label="Incompletos" value={incomplete.length} color={incomplete.length > 0 ? "#fde047" : undefined} />
            <KpiCard label="Trayectos" value={transfers.length} sub="sin gasto" color={transfers.length > 0 ? "#7dd3fc" : undefined} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Link className="btn secondary" to="/gastos" style={{ fontSize: 13 }}>Ver gastos</Link>
            <Link className="btn secondary" to="/traslados" style={{ fontSize: 13 }}>Traslados</Link>
          </div>
        </div>

        {/* ── RENDICIONES + BALANCE (unificado) ── */}
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontWeight: 700, fontSize: 14, opacity: 0.8 }}>Rendiciones</span>
            <Link className="btn secondary" to="/rendiciones" style={{ fontSize: 13 }}>Ver todas</Link>
          </div>

          {/* Por estado */}
          {["devuelta", "enviada", "aprobada", "borrador", "pagada"].map((estado) => {
            const its = reimsByEstado[estado];
            const tot = totalByEstado(estado);
            const s = ESTADO_STYLE[estado];
            if (its.length === 0) return null;
            return (
              <div key={estado} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                background: s.bg, border: `1px solid ${s.border}`,
                borderRadius: 8, padding: "5px 10px", marginBottom: 4,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <StatePill estado={estado} />
                  <span style={{ fontWeight: 700, fontSize: 13 }}>{its.length}</span>
                </div>
                <span style={{ fontSize: 13, color: s.color, fontWeight: 700 }}>{fmt(tot)}</span>
              </div>
            );
          })}

          {reims.length === 0 && <div className="small" style={{ color: "var(--text3)" }}>Sin rendiciones aún.</div>}

          {/* Balance colapsable */}
          <BalanceSection
            totalGastado={totalGastadoAnio}
            totalCobrado={totalCobradoAnio}
            totalPorCobrar={totalPorCobrar}
            availableYears={availableYears}
            balanceYear={balanceYear}
            setBalanceYear={setBalanceYear}
            fmt={fmt}
          />
        </div>

        {/* ── ÚLTIMAS RENDICIONES ── */}
        {lastReims.length > 0 && (
          <div className="card">
            <span style={{ fontWeight: 700, fontSize: 14, color: "var(--text3)", display: "block", marginBottom: 8 }}>Recientes</span>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {lastReims.map((r) => (
                <Link key={r.rendicionId} to={`/rendiciones/${r.rendicionId}`} style={{ textDecoration: "none", color: "inherit" }}>
                  <div style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "10px 0", borderTop: "1px solid var(--sep)",
                  }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{r.correlativo}</div>
                      <div className="small" style={{ color: "var(--text3)", marginTop: 2 }}>
                        {new Date(r.fechaCreacion).toLocaleDateString("es-CL")}
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                      <span style={{ fontWeight: 700, fontSize: 15 }}>{fmt(r.total ?? 0)}</span>
                      <StatePill estado={r.estado} />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
