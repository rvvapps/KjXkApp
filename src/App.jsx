import React, { useEffect, useState } from "react";
import { Routes, Route, Link, Navigate, useLocation } from "react-router-dom";
import Dashboard from "./pages/Dashboard.jsx";
import NewExpense from "./pages/NewExpense.jsx";
import Reimbursements from "./pages/Reimbursements.jsx";
import ReimbursementDetail from "./pages/ReimbursementDetail.jsx";
import Settings from "./pages/Settings.jsx";
import EditExpense from "./pages/EditExpense.jsx";
import Transfers from "./pages/Transfers.jsx";
import Expenses from "./pages/Expenses.jsx";
import ErrorBanner from "./components/ErrorBanner.jsx";
import HelpButton from "./components/HelpButton.jsx";
import { ensureSeedData } from "./db.js";
import { syncOnce } from "./services/syncEngine.js";

// Autosync guard: evita dos syncs en paralelo. Si hay uno en vuelo,
// el siguiente queda pendiente y se ejecuta al terminar el actual.
let _syncInFlight = false;
let _syncQueued   = false;

// Notificar a la UI cuando el sync empieza/termina
function notifySyncStart() { window.dispatchEvent(new Event("cc:syncStart")); }
function notifySyncEnd()   { window.dispatchEvent(new Event("cc:syncEnd")); }

async function backgroundSync() {
  if (_syncInFlight) { _syncQueued = true; return; }
  _syncInFlight = true;
  notifySyncStart();
  try {
    const { getSyncState } = await import("./db.js");
    const st = await getSyncState();
    if (!st?.auth?.connectedAt || !st?.token) return;
    const r = await syncOnce();
    if (r.ok) {
      if (r.appliedEvents > 0 || r.uploadedEvents > 0) {
        window.dispatchEvent(new CustomEvent("cc:syncCompleted", { detail: r }));
      }
    } else {
      const authErrors = ["invalid_grant", "refresh_failed", "no_refresh_token"];
      if (authErrors.includes(r.error) || authErrors.includes(r.detail?.json?.error)) {
        try { sessionStorage.setItem("cc_sync_auth_error", "1"); } catch {}
        window.dispatchEvent(new Event("cc:syncAuthError"));
      }
    }
  } catch (e) {
    console.warn("backgroundSync error:", e);
  } finally {
    _syncInFlight = false;
    notifySyncEnd();
    if (_syncQueued) {
      _syncQueued = false;
      setTimeout(backgroundSync, 100);
    }
  }
}

// Sync con debounce 1s al guardar datos localmente
let _syncDebounceTimer = null;
function scheduleSyncAfterSave() {
  if (_syncDebounceTimer) clearTimeout(_syncDebounceTimer);
  _syncDebounceTimer = setTimeout(() => {
    backgroundSync();
    _syncDebounceTimer = null;
  }, 1000);
}

// Sync al volver al foco (visibilitychange / window focus), debounce 2s
let _focusSyncTimer = null;
function scheduleSyncOnFocus() {
  if (_focusSyncTimer) clearTimeout(_focusSyncTimer);
  _focusSyncTimer = setTimeout(() => {
    backgroundSync();
    _focusSyncTimer = null;
  }, 2000);
}

const PAGE_TITLES = {
  "/":            "Inicio",
  "/traslados":   "Traslados",
  "/gastos":      "Gastos",
  "/gastos/nuevo":"Nuevo gasto",
  "/rendiciones": "Rendiciones",
  "/ajustes":     "Ajustes",
};

function getPageTitle(pathname) {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  if (pathname.startsWith("/gastos/")) return "Editar gasto";
  if (pathname.startsWith("/rendiciones/")) return "Detalle rendición";
  return "Rendicion";
}

function NavItem({ to, label, currentPath, onClick }) {
  const active = currentPath === to || (to !== "/" && currentPath.startsWith(to));
  return (
    <Link
      to={to}
      onClick={onClick}
      style={{
        padding: "6px 14px",
        borderRadius: 10,
        border: active ? "1px solid rgba(255,255,255,.35)" : "1px solid transparent",
        background: active ? "rgba(255,255,255,.10)" : "transparent",
        color: active ? "#fff" : "rgba(255,255,255,.6)",
        fontWeight: active ? 700 : 400,
        fontSize: 14,
        textDecoration: "none",
        whiteSpace: "nowrap",
        transition: "all .15s",
      }}
    >
      {label}
    </Link>
  );
}

function SyncIndicator() {
  const [syncing, setSyncing] = useState(false);
  useEffect(() => {
    const onStart = () => setSyncing(true);
    const onEnd   = () => setSyncing(false);
    window.addEventListener("cc:syncStart", onStart);
    window.addEventListener("cc:syncEnd",   onEnd);
    return () => {
      window.removeEventListener("cc:syncStart", onStart);
      window.removeEventListener("cc:syncEnd",   onEnd);
    };
  }, []);
  if (!syncing) return null;
  return (
    <span title="Sincronizando…" style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      fontSize: 18, color: "rgba(255,255,255,.7)", flexShrink: 0,
    }}>
      <span style={{ animation: "cc-spin 1s linear infinite", display: "inline-block" }}>⟳</span>
    </span>
  );
}

function AppContent() {
  const location = useLocation();
  const pageTitle = getPageTitle(location.pathname);

  const navLinks = [
    { to: "/",           label: "Inicio" },
    { to: "/traslados",  label: "Traslados" },
    { to: "/gastos",     label: "Gastos" },
    { to: "/rendiciones",label: "Rendiciones" },
    { to: "/ajustes",    label: "Ajustes" },
  ];

  return (
    <div className="container">
      {/* ── Top bar ── */}
      <header style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 12, paddingBottom: 8,
        borderBottom: "1px solid rgba(255,255,255,.07)",
      }}>
        {/* Marca */}
        <Link to="/" style={{ textDecoration: "none", flexShrink: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: "var(--brand)", letterSpacing: "1px" }}>
            RENDICION
          </span>
        </Link>

        <SyncIndicator />

        {/* Nav desktop */}
        <nav className="nav-desktop" style={{ display: "flex", gap: 4, alignItems: "center" }}>
          {navLinks.map((n) => (
            <NavItem key={n.to} to={n.to} label={n.label} currentPath={location.pathname} />
          ))}
        </nav>
      </header>

      {/* ── Título de página ── */}
      <div style={{ marginTop: 16, marginBottom: 4, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>{pageTitle}</h1>
        {location.pathname === "/" && (
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <Link className="btn secondary" to="/traslados" state={{ openForm: true }} style={{ fontSize: 13, padding: "8px 12px" }}>+ Trayecto</Link>
            <Link className="btn" to="/gastos/nuevo" style={{ fontSize: 13, padding: "8px 12px" }}>+ Gasto</Link>
          </div>
        )}
      </div>

      <ErrorBanner />
      <UpdateBanner />

      <main style={{ marginTop: 12 }}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/traslados" element={<Transfers />} />
          <Route path="/gastos" element={<Expenses />} />
          <Route path="/gastos/nuevo" element={<NewExpense />} />
          <Route path="/gastos/:gastoId" element={<EditExpense />} />
          <Route path="/rendiciones/:rendicionId" element={<ReimbursementDetail />} />
          <Route path="/rendiciones" element={<Reimbursements />} />
          <Route path="/ajustes" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <HelpButton pathname={location.pathname} />

      {/* ── Tab bar iOS (solo móvil) ── */}
      <nav className="tab-bar nav-mobile">
        {[
          { to: "/",            icon: "🏠", label: "Inicio" },
          { to: "/traslados",   icon: "🚗", label: "Traslados" },
          { to: "/gastos",      icon: "💸", label: "Gastos" },
          { to: "/rendiciones", icon: "📋", label: "Rendiciones" },
          { to: "/ajustes",     icon: "⚙️", label: "Ajustes" },
        ].map((t) => {
          const active = location.pathname === t.to ||
            (t.to !== "/" && location.pathname.startsWith(t.to));
          return (
            <Link key={t.to} to={t.to} className={`tab-item${active ? " active" : ""}`}>
              <span className="tab-icon">{t.icon}</span>
              <span>{t.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export default function App() {
  useEffect(() => {
    ensureSeedData();
    // Sync al arrancar
    backgroundSync();
    // Sync al guardar datos localmente (debounce 3s)
    window.addEventListener("cc:dataChanged", scheduleSyncAfterSave);
    // Sync al volver al foco: cubre alt-tab en PC y volver desde otra app en iOS
    const onVisibility = () => { if (!document.hidden) scheduleSyncOnFocus(); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", scheduleSyncOnFocus);
    // Polling cada 30s — solo corre si la pestaña está visible
    const pollInterval = setInterval(() => {
      if (!document.hidden) backgroundSync();
    }, 30_000);
    return () => {
      window.removeEventListener("cc:dataChanged", scheduleSyncAfterSave);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", scheduleSyncOnFocus);
      clearInterval(pollInterval);
    };
  }, []);
  return <AppContent />;
}

function UpdateBanner() {
  const [pending, setPending] = useState(null);

  useEffect(() => {
    // Leer singleton al montar — resuelve race condition si cc:swUpdate
    // se disparó antes de que este componente estuviera escuchando
    if (window.__swPendingReg) setPending(window.__swPendingReg);

    const handler = (e) => setPending(e.detail?.reg);
    window.addEventListener("cc:swUpdate", handler);
    return () => window.removeEventListener("cc:swUpdate", handler);
  }, []);

  if (!pending) return null;

  return (
    <div style={{
      position: "fixed", bottom: 16, left: "50%", transform: "translateX(-50%)",
      zIndex: 9999, background: "#0ea5e9", color: "#fff",
      borderRadius: 14, padding: "10px 18px",
      display: "flex", alignItems: "center", gap: 12,
      boxShadow: "0 4px 24px rgba(0,0,0,.4)", maxWidth: "90vw",
    }}>
      <span style={{ fontWeight: 700, fontSize: 14 }}>🔄 Nueva versión disponible</span>
      <button
        style={{ background: "#fff", color: "#0ea5e9", border: "none", borderRadius: 8, padding: "5px 14px", fontWeight: 800, cursor: "pointer", fontSize: 13 }}
        onClick={() => {
          const reg = window.__swPendingReg || pending;
          if (reg?.waiting) {
            // skipWaiting → controllerchange → window.location.reload() (en main.jsx)
            reg.waiting.postMessage("skipWaiting");
          } else {
            // SW ya activó sin pasar por waiting (ej: iOS) — recargar directo
            window.location.reload();
          }
        }}
      >
        Actualizar
      </button>
      <button
        style={{ background: "transparent", color: "#fff", border: "none", cursor: "pointer", fontSize: 18, lineHeight: 1 }}
        onClick={() => setPending(null)}
      >×</button>
    </div>
  );
}
