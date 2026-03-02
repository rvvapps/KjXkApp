import React from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App.jsx";
import "./styles.css";
import { handleOneDriveRedirectCallback } from "./services/onedriveAuth.js";

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
