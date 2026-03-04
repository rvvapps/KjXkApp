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
