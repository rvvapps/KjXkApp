import React, { useEffect } from "react";
import { Routes, Route, Link, Navigate } from "react-router-dom";
import Dashboard from "./pages/Dashboard.jsx";
import NewExpense from "./pages/NewExpense.jsx";
import Reimbursements from "./pages/Reimbursements.jsx";
import ReimbursementDetail from "./pages/ReimbursementDetail.jsx";
import Settings from "./pages/Settings.jsx";
import Catalogs from "./pages/Catalogs.jsx";
import Concepts from "./pages/Concepts.jsx";
import EditExpense from "./pages/EditExpense.jsx";
import Transfers from "./pages/Transfers.jsx";
import { ensureSeedData } from "./db.js";

export default function App() {
  const [openMenu, setOpenMenu] = React.useState(false);

  useEffect(() => {
    ensureSeedData();
  }, []);

  return (
    <div className="container">
      <header className="row" style={{ alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ margin: 0 }}>Caja Chica</h1>
          <div className="small">Offline-first · Exporta Excel (template) + PDF respaldos</div>
        </div>

        <nav className="row" style={{ position: "relative" }}>
          <Link className="btn secondary" to="/">Inicio</Link>

          {/* ✅ Traslados fuera de Maestros */}
          <Link className="btn secondary" to="/traslados">Traslados</Link>

          <Link className="btn secondary" to="/gastos/nuevo">+ Gasto</Link>
          <Link className="btn secondary" to="/rendiciones">Rendiciones</Link>

          {/* Dropdown Maestros */}
          <div style={{ position: "relative" }}>
            <button
              className="btn secondary"
              onClick={() => setOpenMenu((v) => !v)}
            >
              Maestros ▼
            </button>

            {openMenu && (
              <div
                style={{
                  position: "absolute",
                  top: "110%",
                  left: 0,
                  background: "#111",
                  border: "1px solid rgba(255,255,255,.15)",
                  borderRadius: 12,
                  padding: 8,
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  minWidth: 160,
                  zIndex: 1000,
                }}
              >
                <Link className="btn secondary" to="/maestros" onClick={() => setOpenMenu(false)}>
                  Catálogos
                </Link>

                <Link className="btn secondary" to="/maestros/conceptos" onClick={() => setOpenMenu(false)}>
                  Conceptos
                </Link>
              </div>
            )}
          </div>

          <Link className="btn secondary" to="/ajustes">Ajustes</Link>
        </nav>
      </header>

      <main style={{ marginTop: 16 }}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/traslados" element={<Transfers />} />
          <Route path="/gastos/nuevo" element={<NewExpense />} />
          <Route path="/gastos/:gastoId" element={<EditExpense />} />
          <Route path="/rendiciones/:rendicionId" element={<ReimbursementDetail />} />
          <Route path="/rendiciones" element={<Reimbursements />} />
          <Route path="/maestros" element={<Catalogs />} />
          <Route path="/maestros/conceptos" element={<Concepts />} />
          <Route path="/ajustes" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
