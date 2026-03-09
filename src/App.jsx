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
import { ensureSeedData } from "./db.js";
import { syncOnce } from "./services/syncEngine.js";

// Sync silencioso en background — se llama al abrir la app
async function backgroundSync() {
  try {
    const { getSyncState } = await import("./db.js");
    const st = await getSyncState();
    if (!st?.auth?.connectedAt || !st?.token) return; // no conectado
    await syncOnce();
  } catch (e) {
    console.warn("backgroundSync error:", e);
  }
}

// Sync con debounce — se llama al guardar datos, espera 3s antes de subir
let _syncDebounceTimer = null;
function scheduleSyncAfterSave() {
  if (_syncDebounceTimer) clearTimeout(_syncDebounceTimer);
  _syncDebounceTimer = setTimeout(() => {
    backgroundSync();
    _syncDebounceTimer = null;
  }, 3000);
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
  return "Caja Chica";
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

function AppContent() {
  const location = useLocation();
  const [openHamburger, setOpenHamburger] = React.useState(false);
  const pageTitle = getPageTitle(location.pathname);

  useEffect(() => {
    if (!openHamburger) return;
    const handler = (e) => {
      if (!e.target.closest("[data-menu='hamburger']")) setOpenHamburger(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [openHamburger]);

  // Cerrar hamburguesa al navegar
  useEffect(() => { setOpenHamburger(false); }, [location.pathname]);

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
        {/* Marca — pequeña, siempre visible */}
        <Link to="/" style={{ textDecoration: "none", flexShrink: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: "rgba(255,255,255,.5)", letterSpacing: ".5px" }}>
            CAJA CHICA
          </span>
        </Link>

        {/* Nav desktop */}
        <nav className="nav-desktop" style={{ display: "flex", gap: 4, alignItems: "center" }}>
          {navLinks.map((n) => (
            <NavItem key={n.to} to={n.to} label={n.label} currentPath={location.pathname} />
          ))}
        </nav>

        {/* Hamburguesa móvil */}
        <div className="nav-mobile" style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <Link to="/" style={{ display:"flex", alignItems:"center", padding:"6px 10px", borderRadius:10, border:"1px solid rgba(255,255,255,.2)", color:"#e5e7eb", fontSize:16, lineHeight:1 }} title="Inicio">🏠</Link>
        <div data-menu="hamburger" style={{ position: "relative" }}>
          <button
            onClick={() => setOpenHamburger((v) => !v)}
            style={{
              background: "transparent", border: "1px solid rgba(255,255,255,.2)",
              borderRadius: 10, color: "#e5e7eb", fontSize: 18,
              padding: "5px 12px", cursor: "pointer",
            }}
          >
            {openHamburger ? "✕" : "☰"}
          </button>

          {openHamburger && (
            <div style={{
              position: "absolute", top: "110%", right: 0,
              background: "#0f172a", border: "1px solid rgba(255,255,255,.12)",
              borderRadius: 14, padding: 10,
              display: "flex", flexDirection: "column", gap: 4,
              minWidth: 190, zIndex: 1000,
              boxShadow: "0 8px 32px rgba(0,0,0,.6)",
            }}>
              {navLinks.map((n) => (
                <NavItem
                  key={n.to} to={n.to} label={n.label}
                  currentPath={location.pathname}
                  onClick={() => setOpenHamburger(false)}
                />
              ))}
            </div>
          )}
        </div>
        </div>
      </header>

      {/* ── Título de página ── */}
      <div style={{ marginTop: 16, marginBottom: 4 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>{pageTitle}</h1>
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
    </div>
  );
}

export default function App() {
  useEffect(() => {
    ensureSeedData();
    // Sync automático al abrir la app
    backgroundSync();
    // Sync automático al guardar (con debounce de 3s)
    window.addEventListener("cc:dataChanged", scheduleSyncAfterSave);
    return () => window.removeEventListener("cc:dataChanged", scheduleSyncAfterSave);
  }, []);
  return <AppContent />;
}

function UpdateBanner() {
  const [pending, setPending] = useState(null);

  useEffect(() => {
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
          pending.waiting?.postMessage("skipWaiting");
          // Esperar que el nuevo SW tome control antes de recargar
          navigator.serviceWorker.addEventListener("controllerchange", () => {
            window.location.reload();
          }, { once: true });
          // Fallback: si no hay controllerchange en 3s, recargar igual
          setTimeout(() => window.location.reload(), 3000);
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
