import React from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App.jsx";
import "./styles.css";
import { handleOneDriveRedirectCallback } from "./services/onedriveAuth.js";

// Capture runtime errors so we can show them inside the app UI (helps debugging on iOS too).
(function initErrorCapture(){
  const save = (e) => {
    try{
      const payload = {
        message: e?.message || (typeof e === "string" ? e : "Unknown error"),
        stack: e?.error?.stack || e?.stack || ""
      };
      sessionStorage.setItem("cc_last_error", JSON.stringify(payload));
      window.dispatchEvent(new Event("cc:error"));
    }catch{}
  };
  window.addEventListener("error", (ev) => save(ev));
  window.addEventListener("unhandledrejection", (ev) => save(ev?.reason || ev));
})();


// If we come back from Microsoft login, exchange code -> tokens and clean URL.
(async () => {
  try {
    await handleOneDriveRedirectCallback();
  } catch (e) {
    // Ignore; user can reconnect from Settings.
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
