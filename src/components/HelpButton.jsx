import { useState, useEffect, useCallback } from "react";
import { HELP_CONTENT, getHelpPageId } from "./helpContent.js";

// ── Estilos inline para no tocar styles.css ──────────────────────────────────
const S = {
  // Botón flotante
  fab: {
    position: "fixed",
    bottom: 80,
    right: 16,
    width: 38,
    height: 38,
    borderRadius: "50%",
    background: "rgba(14,165,233,0.18)",
    border: "1.5px solid rgba(14,165,233,0.45)",
    color: "#7dd3fc",
    fontSize: 17,
    fontWeight: 700,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1100,
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    boxShadow: "0 2px 12px rgba(0,0,0,0.35)",
    transition: "background 0.15s, transform 0.15s",
    userSelect: "none",
  },
  fabHover: {
    background: "rgba(14,165,233,0.32)",
    transform: "scale(1.08)",
  },
  // Overlay oscuro
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.55)",
    zIndex: 1200,
    animation: "cc-fadeIn 0.18s ease",
  },
  // Sheet (drawer desde abajo)
  sheet: {
    position: "fixed",
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: "82vh",
    background: "var(--bg2)",
    borderTop: "1px solid var(--sep)",
    borderRadius: "18px 18px 0 0",
    zIndex: 1300,
    display: "flex",
    flexDirection: "column",
    animation: "cc-slideUp 0.22s cubic-bezier(0.32,0.72,0,1)",
    boxShadow: "0 -8px 40px rgba(0,0,0,0.5)",
  },
  // Handle drag visual
  handle: {
    width: 36,
    height: 4,
    background: "var(--bg4)",
    borderRadius: 2,
    margin: "12px auto 0",
    flexShrink: 0,
  },
  // Header del sheet
  sheetHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 18px 10px",
    borderBottom: "1px solid var(--sep)",
    flexShrink: 0,
  },
  sheetTitle: {
    margin: 0,
    fontSize: 16,
    fontWeight: 700,
    color: "var(--text)",
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  closeBtn: {
    background: "var(--sep)",
    border: "none",
    color: "var(--text3)",
    fontSize: 18,
    width: 30,
    height: 30,
    borderRadius: "50%",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
    flexShrink: 0,
  },
  // Cuerpo scrollable
  sheetBody: {
    overflowY: "auto",
    padding: "4px 18px 32px",
    WebkitOverflowScrolling: "touch",
  },
  // Sección de ayuda
  section: {
    marginTop: 18,
  },
  sectionHeading: {
    fontSize: 12,
    fontWeight: 700,
    color: "#0ea5e9",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    margin: "0 0 6px",
  },
  sectionText: {
    fontSize: 14,
    color: "var(--text2)",
    lineHeight: 1.6,
    margin: 0,
    whiteSpace: "pre-line",
  },
  divider: {
    border: 0,
    borderTop: "1px solid var(--sep)",
    margin: "16px 0 0",
  },
  noHelp: {
    padding: "24px 0",
    textAlign: "center",
    color: "var(--text3)",
    fontSize: 14,
  },
};

// Inyectar keyframes solo una vez
let _keyframesInjected = false;
function injectKeyframes() {
  if (_keyframesInjected) return;
  _keyframesInjected = true;
  const style = document.createElement("style");
  style.textContent = `
    @keyframes cc-fadeIn  { from { opacity:0 } to { opacity:1 } }
    @keyframes cc-slideUp { from { transform:translateY(100%) } to { transform:translateY(0) } }
  `;
  document.head.appendChild(style);
}

export default function HelpButton({ pathname }) {
  const [open, setOpen] = useState(false);
  const [fabHover, setFabHover] = useState(false);

  injectKeyframes();

  const pageId = getHelpPageId(pathname);
  const content = pageId ? HELP_CONTENT[pageId] : null;

  // Cerrar con Escape
  const handleKey = useCallback((e) => {
    if (e.key === "Escape") setOpen(false);
  }, []);

  useEffect(() => {
    if (open) {
      document.addEventListener("keydown", handleKey);
      // Bloquear scroll del body
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
    };
  }, [open, handleKey]);

  // Cerrar al cambiar de página
  useEffect(() => { setOpen(false); }, [pathname]);

  if (!content) return null;

  return (
    <>
      {/* Botón flotante */}
      <button
        style={{ ...S.fab, ...(fabHover ? S.fabHover : {}) }}
        onMouseEnter={() => setFabHover(true)}
        onMouseLeave={() => setFabHover(false)}
        onClick={() => setOpen(true)}
        aria-label="Ayuda"
        title="Ayuda"
      >
        ?
      </button>

      {/* Overlay + Sheet */}
      {open && (
        <>
          <div style={S.overlay} onClick={() => setOpen(false)} />
          <div style={S.sheet} role="dialog" aria-modal="true" aria-label="Ayuda">
            {/* Handle visual */}
            <div style={S.handle} />

            {/* Header */}
            <div style={S.sheetHeader}>
              <h2 style={S.sheetTitle}>
                <span style={{ fontSize: 18 }}>💡</span>
                {content.title}
              </h2>
              <button
                style={S.closeBtn}
                onClick={() => setOpen(false)}
                aria-label="Cerrar ayuda"
              >
                ✕
              </button>
            </div>

            {/* Contenido scrollable */}
            <div style={S.sheetBody}>
              {content.sections.map((sec, i) => (
                <div key={i} style={S.section}>
                  {i > 0 && <hr style={S.divider} />}
                  <p style={S.sectionHeading}>{sec.heading}</p>
                  <p style={S.sectionText}>{sec.text}</p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}
