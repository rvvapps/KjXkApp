import React from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App.jsx";
import "./styles.css";

function registerGlobalErrorHandlers() {
  const saveError = (message, stack) => {
    try {
      sessionStorage.setItem("cc_last_error", JSON.stringify({ message, stack }));
      window.dispatchEvent(new Event("cc:error"));
    } catch {}
  };

  window.addEventListener("error", (e) => {
    const err = e?.error;
    if (err?.name === "AbortError") return;
    const msg = err?.message || e?.message || "";
    if (msg.includes("sw.js") || msg.includes("ServiceWorker")) return;
    if (!msg) return;
    saveError(msg, err?.stack || "");
  });

  window.addEventListener("unhandledrejection", (e) => {
    const reason = e?.reason;
    if (reason?.name === "AbortError") return;
    const msg = reason?.message || String(reason || "");
    if (msg.includes("sw.js") || msg.includes("ServiceWorker")) return;
    if (!msg || msg === "undefined") return;
    saveError(msg, reason?.stack || "");
  });
}

registerGlobalErrorHandlers();

window.__swPendingReg = null;

function notifyUpdate(reg) {
  window.__swPendingReg = reg;
  window.dispatchEvent(new CustomEvent("cc:swUpdate", { detail: { reg } }));
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const reg = await navigator.serviceWorker.register("/KjXkApp/sw.js", { scope: "/KjXkApp/" });

      if (reg.waiting) notifyUpdate(reg);

      reg.addEventListener("updatefound", () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            notifyUpdate(reg);
          }
        });
      });

      navigator.serviceWorker.addEventListener("controllerchange", () => {
        window.location.reload();
      });

      document.addEventListener("visibilitychange", () => {
        if (!document.hidden) reg.update();
      });

      setInterval(() => reg.update(), 5 * 60 * 1000);
    } catch (e) {
      console.warn("SW registration failed:", e);
    }
  });
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
);
