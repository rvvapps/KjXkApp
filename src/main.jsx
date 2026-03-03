import React from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App.jsx";
import "./styles.css";
import { handleOneDriveRedirectCallback } from "./services/onedriveAuth.js";
import { restoreFromEncryptedBackupFile } from "./services/backupEngine.js";
import { readStagedRestoreBlob, clearStagedRestore } from "./services/restoreStaging.js";


async function maybeBootstrapRestore() {
  const pending = sessionStorage.getItem("cc_restore_pending");
  if (!pending) return { didRestore: false };

  const root = document.getElementById("root");
  const setText = (t) => {
    if (!root) return;
    root.innerHTML = `<div style="max-width:720px;margin:40px auto;padding:16px;border:1px solid rgba(255,255,255,.12);border-radius:16px;background:#0b1220;color:#e5e7eb;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
      <h2 style="margin:0 0 8px 0;">Restaurando respaldo…</h2>
      <div style="opacity:.95;white-space:pre-wrap">${t}</div>
    </div>`;
  };

  const pass = sessionStorage.getItem("cc_restore_pass") || "";
  const blob = await readStagedRestoreBlob();
  if (!blob) {
    setText("❌ No se encontró el archivo de restore staged. Vuelve a Ajustes y selecciona el .cczip nuevamente.");
    sessionStorage.removeItem("cc_restore_pending");
    sessionStorage.removeItem("cc_restore_pass");
    return { didRestore: false, error: "missing_staged_blob" };
  }

  const phaseMap = {
    decrypt: "Descifrando…",
    unzip: "Abriendo ZIP…",
    parse: "Leyendo data.json…",
    open_db: "Abriendo base local…",
    clear_stores: "Vaciando base local…",
    insert_begin: "Restaurando registros…",
    insert_store: null,
    done: "Finalizando…",
  };

  setText("Iniciando…");
  try {
    await restoreFromEncryptedBackupFile(blob, pass, {
      timeoutMs: 180000,
      onProgress: (p) => {
        const phase = p?.phase || "working";
        if (phase === "insert_store") {
          setText(`Restaurando ${p.store} (${p.count})…`);
        } else {
          setText(phaseMap[phase] || `Restaurando… (${phase})`);
        }
      },
    });

    // Clear staged artifacts and proceed to render the app.
    await clearStagedRestore();
    sessionStorage.removeItem("cc_restore_pending");
    sessionStorage.removeItem("cc_restore_pass");
    setText("✅ Restauración completa. Cargando aplicación…");
    return { didRestore: true };
  } catch (e) {
    const code = e?.code || e?.message || "restore_failed";
    setText(`❌ Restauración fallida: ${code}

Vuelve a Ajustes y reintenta.`);
    // Keep staged blob for retry, but clear pending to avoid loop.
    sessionStorage.removeItem("cc_restore_pending");
    // keep pass? no.
    sessionStorage.removeItem("cc_restore_pass");
    return { didRestore: false, error: code };
  }
}

// If we come back from Microsoft login, exchange code -> tokens and clean URL.
(async () => {
  await maybeBootstrapRestore();
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
