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

const PAGE_TITLES = {
  "/":             "Inicio",
  "/traslados":    "Traslados",
  "/gastos":       "Gastos",
  "/gastos/nuevo": "Nuevo gasto",
  "/rendiciones":  "Rendiciones",
  "/ajustes":      "Ajustes",
};

function getPageTitle(pathname) {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  if (pathname.startsWith("/gastos/")) return "Editar gasto";
  if (pathname.startsWith("/rendiciones/")) return "Detalle rendición";
  return "Rendicion";
}

function NavItem({ to, label, currentPath }) {
  const active = currentPath === to || (to !== "/" && currentPath.startsWith(to));
  return (
    <Link
      to={to}
      style={{
        padding: "6px 14px",
        borderRadius: 10,
        border: active ? "1px solid var(--accent)" : "1px solid transparent",
        background: active ? "color-mix(in srgb, var(--accent) 12%, transparent)" : "transparent",
        color: active ? "var(--accent)" : "var(--text3)",
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

function AppContent() {
  const location = useLocation();
  const pageTitle = getPageTitle(location.pathname);

  const navLinks = [
    { to: "/",            label: "Inicio" },
    { to: "/traslados",   label: "Traslados" },
    { to: "/gastos",      label: "Gastos" },
    { to: "/rendiciones", label: "Rendiciones" },
    { to: "/ajustes",     label: "Ajustes" },
  ];

  return (
    <div className="container">
      {/* ── Top bar ── */}
      <header style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 12, paddingBottom: 8,
        borderBottom: "1px solid var(--sep)",
      }}>
        <Link to="/" style={{ textDecoration: "none", flexShrink: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: "var(--brand)", letterSpacing: "1px" }}>
            RENDICION
          </span>
        </Link>

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
            <Link to="/traslados" state={{ openForm: true }} style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 44, height: 44, borderRadius: 22,
              background: "var(--bg3)", border: "1px solid var(--sep)",
              fontSize: 24, textDecoration: "none",
            }} title="+ Trayecto">🚗</Link>
            <Link to="/gastos/nuevo" style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 44, height: 44, borderRadius: 22,
              background: "var(--accent)",
              fontSize: 24, textDecoration: "none",
            }} title="+ Gasto">💸</Link>
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
  }, []);
  return <AppContent />;
}

function UpdateBanner() {
  const [pending, setPending] = useState(null);

  useEffect(() => {
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
            reg.waiting.postMessage("skipWaiting");
          } else {
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
