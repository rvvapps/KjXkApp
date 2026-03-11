import React from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App.jsx";
import "./styles.css";
import { handleOneDriveRedirectCallback } from "./services/onedriveAuth.js";

// Capturador global de errores no manejados → visible en ErrorBanner
function registerGlobalErrorHandlers() {
  const saveError = (message, stack) => {
    try {
      sessionStorage.setItem("cc_last_error", JSON.stringify({ message, stack }));
      window.dispatchEvent(new Event("cc:error"));
    } catch {}
  };

  window.addEventListener("error", (e) => {
    const msg = e?.error?.message || e?.message || "Error desconocido";
    const stack = e?.error?.stack || "";
    saveError(msg, stack);
  });

  window.addEventListener("unhandledrejection", (e) => {
    const msg = e?.reason?.message || String(e?.reason || "Promise rechazada sin manejar");
    const stack = e?.reason?.stack || "";
    saveError(msg, stack);
  });
}

registerGlobalErrorHandlers();

// ── Service Worker ────────────────────────────────────────────────────────
//
// Estado singleton: persiste aunque React desmonte/remonte componentes.
// Resuelve la race condition donde cc:swUpdate se disparaba antes de que
// UpdateBanner estuviera montado y escuchando.
//
window.__swPendingReg = null; // registration con .waiting listo para activar

function notifyUpdate(reg) {
  window.__swPendingReg = reg;
  // Disparar para cualquier listener ya montado
  window.dispatchEvent(new CustomEvent("cc:swUpdate", { detail: { reg } }));
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const reg = await navigator.serviceWorker.register("/KjXkApp/sw.js", { scope: "/KjXkApp/" });

      // Si ya hay un SW esperando al arrancar (ej: PC con pestaña que estaba abierta),
      // guardarlo en el singleton — UpdateBanner lo leerá al montar.
      if (reg.waiting) notifyUpdate(reg);

      // Nuevo SW encontrado durante esta sesión
      reg.addEventListener("updatefound", () => {
        const newWorker = reg.installing;
        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            // Solo notificar si ya había un SW activo (no es la primera instalación)
            notifyUpdate(reg);
          }
        });
      });

      // Cuando el SW nuevo toma el control (después de skipWaiting), recargar la página.
      // Esto cubre el caso iOS donde el SW activa directo sin pasar por waiting.
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        window.location.reload();
      });

      // Verificar actualizaciones cada vez que la app vuelve al foco
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden) reg.update();
      });
    } catch (e) {
      console.warn("SW registration failed:", e);
    }
  });
}

// Si venimos del redirect de Microsoft login, intercambiar code → tokens
(async () => {
  try {
    await handleOneDriveRedirectCallback();
  } catch (e) {
    // Ignorar — el usuario puede reconectar desde Ajustes
    console.warn("OneDrive auth callback failed", e);
  }

  createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <HashRouter>
        <App />
      </HashRouter>
    </React.StrictMode>
  );
})();
