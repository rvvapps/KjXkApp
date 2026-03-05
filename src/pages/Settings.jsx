import React, { useEffect, useState } from "react";
import { getSettings, saveSettings, listActiveCR, getSyncState, saveSyncState } from "../db.js";
import TextField from "../components/TextField.jsx";
import SelectField from "../components/SelectField.jsx";
import { startOneDriveLogin, disconnectOneDrive } from "../services/onedriveAuth.js";
import { syncOnce } from "../services/syncEngine.js";
import { putFileByPath } from "../services/onedriveApi.js";
import { generateEncryptedBackupBlob, restoreFromEncryptedBackupFile } from "../services/backupEngine.js";

const TABS = ["Cuenta", "General", "Respaldo", "Sync"];

const TIPO_CUENTA_OPTIONS = [
  { value: "", label: "Seleccione..." },
  { value: "Cuenta Corriente", label: "Cuenta Corriente" },
  { value: "Cuenta Vista", label: "Cuenta Vista" },
  { value: "Cuenta RUT", label: "Cuenta RUT" },
  { value: "Cuenta de Ahorro", label: "Cuenta de Ahorro" },
];

function formatProgress(p) {
  if (p == null) return "";
  if (typeof p === "string") return p;
  try {
    if (typeof p === "object") {
      if (p.text) return String(p.text);
      const phase = p.phase || p.kind || "progress";
      if (phase === "clear_store") return `Vaciando ${p.store || "store"}...`;
      if (phase === "clear_stores") return `Vaciando base local (${p.stores ?? "?"} stores)...`;
      if (phase === "insert_store") return `Restaurando ${p.store || "store"}... (${p.count ?? "?"})`;
      if (phase === "insert_progress") return `Insertando ${p.store || "store"}: ${p.i}/${p.total}`;
      if (phase === "insert_begin") return `Iniciando restauración (${p.stores ?? "?"} stores)...`;
      if (phase === "decrypt") return "Descifrando...";
      if (phase === "unzip") return "Abriendo ZIP...";
      if (phase === "hydrate") return "Preparando boletas...";
      if (phase === "hydrate_store") return `Preparando boletas (${p.count ?? "?"})...`;
      if (phase === "parse") return "Procesando datos...";
      if (phase === "open_db") return "Abriendo base local...";
      if (phase === "read") return "Leyendo datos...";
      if (phase === "zip_build") return "Construyendo ZIP...";
      if (phase === "encrypt") return "Cifrando...";
      if (phase === "done") return "Listo.";
      return `Restaurando… (${phase})`;
    }
    return String(p);
  } catch (e) { return String(p); }
}

function MsgBox({ msg }) {
  if (!msg) return null;
  return (
    <div className="small" style={{ padding: 10, border: "1px solid rgba(255,255,255,.12)", borderRadius: 12, marginTop: 10, whiteSpace: "pre-line" }}>
      {msg}
    </div>
  );
}

function SaveBtn({ busy, onClick }) {
  return (
    <div className="row" style={{ marginTop: 16 }}>
      <button className="btn" disabled={busy} onClick={onClick}>
        {busy ? "Guardando..." : "Guardar"}
      </button>
    </div>
  );
}

export default function Settings() {
  const [tab, setTab] = useState("Cuenta");
  const [s, setS] = useState(null);
  const [crs, setCrs] = useState([]);
  const [sync, setSync] = useState(null);

  // Mensajes por sección
  const [msgCuenta, setMsgCuenta] = useState("");
  const [msgGeneral, setMsgGeneral] = useState("");
  const [syncMsg, setSyncMsg] = useState("");
  const [backupMsg, setBackupMsg] = useState("");
  const [restoreMsg, setRestoreMsg] = useState("");
  const [backupBusy, setBackupBusy] = useState(false);

  // Campos backup/restore
  const [backupPass, setBackupPass] = useState("");
  const [restorePass, setRestorePass] = useState("");
  const [restoreFile, setRestoreFile] = useState(null);

  useEffect(() => {
    (async () => {
      setS(await getSettings());
      setCrs(await listActiveCR());
      setSync(await getSyncState());
    })();
  }, []);

  async function saveCuenta() {
    setMsgCuenta("");
    await saveSettings(s);
    setMsgCuenta("✅ Guardado.");
  }

  async function saveGeneral() {
    setMsgGeneral("");
    await saveSettings(s);
    setMsgGeneral("✅ Guardado.");
  }

  async function saveOneDriveConfig(patch) {
    const cur = await getSyncState();
    const next = await saveSyncState({ auth: { ...(cur?.auth || {}), ...patch } });
    setSync(next);
  }

  async function connectOneDrive(preferredMode = "approot") {
    setSyncMsg("");
    const tenantId = sync?.auth?.tenantId || "organizations";
    const clientId = sync?.auth?.clientId || "";
    if (!clientId) { setSyncMsg("⚠️ Debes ingresar Client ID antes de conectar."); return; }
    const redirectUri = window.location.origin + window.location.pathname;
    await saveOneDriveConfig({ tenantId, clientId, mode: preferredMode, redirectUri });
    await startOneDriveLogin({ tenantId, clientId, mode: preferredMode, redirectUri });
  }

  async function doSyncNow() {
    setSyncMsg("Sincronizando…");
    const r = await syncOnce();
    if (r.ok) {
      setSyncMsg(`✅ Sync OK. Eventos: ${r.uploadedEvents}, Boletas: ${r.uploadedReceipts}`);
      setS(await getSettings());
    } else {
      setSyncMsg(`❌ Sync falló en paso: ${r.step || "?"}. ${r.error || ""}`);
    }
  }

  async function doDisconnect() {
    await disconnectOneDrive();
    setSync(await getSyncState());
    setSyncMsg("Desconectado.");
  }

  async function doGenerateBackup({ uploadToOneDrive }) {
    setBackupMsg("");
    setBackupBusy(true);
    try {
      const { blob, storeCounts } = await generateEncryptedBackupBlob(backupPass);
      const fileName = `backup_full_${new Date().toISOString().replace(/[:.]/g, "-")}.cczip`;
      const counts = `Gastos: ${storeCounts.expenses ?? 0}, Rendiciones: ${storeCounts.reimbursements ?? 0}, Boletas: ${storeCounts.attachments ?? 0}`;

      if (uploadToOneDrive) {
        const st = await getSyncState();
        if (!st?.rootMode || !st?.driveId || !st?.rootFolderItemId) {
          setBackupMsg("⚠️ OneDrive no está conectado. Ve a la pestaña Sync primero.");
          return;
        }
        const r = await putFileByPath({ path: `exports/${fileName}`, contentType: "application/octet-stream", data: blob });
        if (!r.ok) { setBackupMsg(`❌ Error subiendo backup: ${r.error || "put_failed"}`); return; }
        await saveSettings({ lastBackupAt: new Date().toISOString(), lastBackupName: fileName });
        setS(await getSettings());
        setBackupMsg(`✅ Backup subido a OneDrive: exports/${fileName}\n${counts}`);
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = fileName;
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(url);
        await saveSettings({ lastBackupAt: new Date().toISOString(), lastBackupName: fileName });
        setS(await getSettings());
        setBackupMsg(`✅ Backup generado: ${fileName}\n${counts}`);
      }
    } catch (e) {
      const code = e?.code || e?.message || "backup_failed";
      if (code === "empty_backup") setBackupMsg("⚠️ Backup vacío: no hay datos para respaldar.");
      else if (code === "passphrase_too_short") setBackupMsg("⚠️ La contraseña debe tener al menos 6 caracteres.");
      else setBackupMsg(`❌ Error: ${code}`);
    } finally { setBackupBusy(false); }
  }

  async function doRestoreBackup() {
    setRestoreMsg("");
    setBackupBusy(true);
    try {
      if (!restoreFile) { setRestoreMsg("⚠️ Selecciona un archivo .cczip primero."); return; }
      if (!restorePass || restorePass.length < 6) { setRestoreMsg("⚠️ Contraseña mínimo 6 caracteres."); return; }
      setRestoreMsg("⏳ Restaurando… no cierres esta pestaña.");
      const r = await restoreFromEncryptedBackupFile(restoreFile, restorePass, {
        timeoutMs: 60000,
        onProgress: (p) => setRestoreMsg(formatProgress(p)),
      });
      if (!r?.ok) { setRestoreMsg("❌ Restauración fallida."); return; }
      const c = r.insertedCounts || r.storeCounts || {};
      setRestoreMsg(`✅ OK. Gastos: ${c.expenses ?? 0}, Rendiciones: ${c.reimbursements ?? 0}, Boletas: ${c.attachments ?? 0}. Reiniciando…`);
      setTimeout(() => window.location.reload(), 400);
    } catch (e) {
      const code = e?.code || e?.message || "restore_failed";
      if (String(code).includes("bad_backup")) setRestoreMsg("❌ Archivo inválido o corrupto.");
      else if (code === "passphrase_too_short") setRestoreMsg("⚠️ Contraseña inválida.");
      else if (String(code).includes("timeout")) setRestoreMsg("❌ Tiempo agotado. Intenta de nuevo.");
      else setRestoreMsg(`❌ Restauración fallida: ${code}`);
    } finally { setBackupBusy(false); }
  }

  if (!s) return <div className="card">Cargando…</div>;

  return (
    <div>
      {/* Tab bar */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          {TABS.map((t) => (
            <button
              key={t}
              className="btn"
              onClick={() => setTab(t)}
              style={{
                background: tab === t ? "rgba(255,255,255,.15)" : "transparent",
                border: tab === t ? "1px solid rgba(255,255,255,.4)" : "1px solid rgba(255,255,255,.12)",
                fontWeight: tab === t ? 800 : 400,
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* ── CUENTA ── */}
      {tab === "Cuenta" && (
        <div className="card">
          <h2>Cuenta</h2>

          <h3>Datos personales</h3>
          <div className="row">
            <TextField label="Nombre" value={s.responsableNombre || ""} onChange={(v) => setS({ ...s, responsableNombre: v })} placeholder="Nombre completo" />
            <TextField label="RUT" value={s.responsableRut || ""} onChange={(v) => setS({ ...s, responsableRut: v })} placeholder="12.345.678-9" />
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <TextField label="Cargo" value={s.cargo || ""} onChange={(v) => setS({ ...s, cargo: v })} />
            <TextField label="Empresa" value={s.empresa || ""} onChange={(v) => setS({ ...s, empresa: v })} />
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <TextField label="Tel / Cel" value={s.telefono || ""} onChange={(v) => setS({ ...s, telefono: v })} placeholder="+56 9 1234 5678" />
            <SelectField
              label="Centro de Responsabilidad por defecto"
              value={s.crDefaultCodigo || ""}
              onChange={(v) => setS({ ...s, crDefaultCodigo: v })}
              options={crs.map((x) => ({ value: x.crCodigo, label: `${x.crCodigo} - ${x.crNombre}` }))}
              placeholder="Seleccione..."
            />
          </div>

          <hr />

          <h3>Datos bancarios</h3>
          <div className="small" style={{ marginBottom: 10, opacity: 0.7 }}>
            Se incluyen en el formulario de rendición para el pago.
          </div>
          <div className="row">
            <TextField label="Banco" value={s.banco || ""} onChange={(v) => setS({ ...s, banco: v })} placeholder="Ej: Banco Estado" />
            <SelectField
              label="Tipo de cuenta"
              value={s.tipoCuenta || ""}
              onChange={(v) => setS({ ...s, tipoCuenta: v })}
              options={TIPO_CUENTA_OPTIONS}
            />
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <TextField label="N° de cuenta" value={s.numeroCuenta || ""} onChange={(v) => setS({ ...s, numeroCuenta: v })} placeholder="Ej: 12345678" />
          </div>

          <MsgBox msg={msgCuenta} />
          <SaveBtn onClick={saveCuenta} />
        </div>
      )}

      {/* ── GENERAL ── */}
      {tab === "General" && (
        <div className="card">
          <h2>General</h2>

          <h3>Correlativo de rendiciones</h3>
          <div className="small" style={{ marginBottom: 10, opacity: 0.7 }}>
            Número que se asigna automáticamente al crear cada rendición.
          </div>
          <div className="row">
            <TextField label="Prefijo" value={s.correlativoPrefix || ""} onChange={(v) => setS({ ...s, correlativoPrefix: v })} placeholder="Ej: RC" />
            <TextField label="Siguiente N°" type="number" value={s.correlativoNextNumber || 1} onChange={(v) => setS({ ...s, correlativoNextNumber: Number(v) })} />
          </div>
          <div className="small" style={{ marginTop: 8, opacity: 0.6 }}>
            Formato resultante: <b>{s.correlativoPrefix || "RC"}-{new Date().getFullYear()}-{String(s.correlativoNextNumber || 1).padStart(4, "0")}</b>
          </div>

          <hr />

          <h3>Dispositivo</h3>
          <div className="row">
            <TextField
              label="Nombre del dispositivo"
              value={s.deviceLabel || ""}
              onChange={(v) => setS({ ...s, deviceLabel: v })}
              placeholder="Ej: iPhone Rodolfo"
            />
          </div>
          <div className="small" style={{ marginTop: 8, opacity: 0.6 }}>
            <div>Device ID: {(s.deviceId || "").slice(0, 8)}…</div>
            <div>Revisión local: {typeof s.localRevision === "number" ? s.localRevision : 0}</div>
          </div>

          <MsgBox msg={msgGeneral} />
          <SaveBtn onClick={saveGeneral} />
        </div>
      )}

      {/* ── RESPALDO ── */}
      {tab === "Respaldo" && (
        <div className="card">
          <h2>Respaldo</h2>

          {s.lastBackupAt && (
            <div style={{
              background: "rgba(34,197,94,.08)", border: "1px solid rgba(34,197,94,.2)",
              borderRadius: 12, padding: "8px 12px", marginBottom: 16,
            }}>
              <div className="small">
                ✅ Último backup: <b>{new Date(s.lastBackupAt).toLocaleString("es-CL")}</b>
                {s.lastBackupName && <div style={{ opacity: 0.7, marginTop: 2 }}>{s.lastBackupName}</div>}
              </div>
            </div>
          )}

          <h3>Generar backup</h3>
          <div className="small" style={{ marginBottom: 10, opacity: 0.7 }}>
            Genera un archivo <b>.cczip</b> cifrado con tu contraseña. Contiene todos los datos y boletas.
          </div>
          <div className="row">
            <TextField label="Contraseña (mín. 6 caracteres)" value={backupPass} onChange={setBackupPass} type="password" />
          </div>
          <div className="row" style={{ marginTop: 12, gap: 10 }}>
            <button className="btn" disabled={backupBusy} onClick={() => doGenerateBackup({ uploadToOneDrive: false })}>
              {backupBusy ? "Generando..." : "Descargar .cczip"}
            </button>
            <button className="btn secondary" disabled={backupBusy} onClick={() => doGenerateBackup({ uploadToOneDrive: true })}>
              Subir a OneDrive
            </button>
          </div>
          <MsgBox msg={backupMsg} />

          <hr />

          <h3>Restaurar backup</h3>
          <div className="small" style={{ marginBottom: 10, opacity: 0.7 }}>
            Reemplaza la base local con el contenido del archivo. Cierra otras pestañas antes de restaurar.
          </div>
          <div className="row">
            <div style={{ flex: 1 }}>
              <label>Archivo .cczip</label>
              <input
                className="input"
                type="file"
                accept=".cczip,application/octet-stream"
                onChange={(e) => setRestoreFile(e.target.files?.[0] || null)}
              />
            </div>
            <TextField label="Contraseña" value={restorePass} onChange={setRestorePass} type="password" />
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn danger" disabled={backupBusy} onClick={doRestoreBackup}>
              Restaurar (reemplaza datos locales)
            </button>
          </div>
          <MsgBox msg={typeof restoreMsg === "string" ? restoreMsg : formatProgress(restoreMsg)} />
        </div>
      )}

      {/* ── SYNC ── */}
      {tab === "Sync" && (
        <div className="card">
          <h2>Sync</h2>

          <div className="small" style={{ marginBottom: 12, opacity: 0.7 }}>
            Sincroniza gastos y boletas con OneDrive automáticamente cuando hay conexión.
          </div>

          <div style={{
            display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10,
            background: "rgba(255,255,255,.04)", borderRadius: 12, padding: "10px 14px", marginBottom: 16,
          }}>
            <div><div className="small" style={{ opacity: 0.6 }}>Estado</div><div style={{ fontWeight: 700 }}>{sync?.auth?.connectedAt ? "Conectado" : "No conectado"}</div></div>
            <div><div className="small" style={{ opacity: 0.6 }}>Modo</div><div style={{ fontWeight: 700 }}>{sync?.rootMode || sync?.auth?.mode || "—"}</div></div>
            <div><div className="small" style={{ opacity: 0.6 }}>Última sync</div><div style={{ fontWeight: 700 }}>{s.lastSyncAt ? new Date(s.lastSyncAt).toLocaleString("es-CL") : "—"}</div></div>
            <div><div className="small" style={{ opacity: 0.6 }}>Conectado el</div><div style={{ fontWeight: 700 }}>{sync?.auth?.connectedAt ? new Date(sync.auth.connectedAt).toLocaleString("es-CL") : "—"}</div></div>
          </div>

          <h3>Configuración</h3>
          <div className="row">
            <TextField
              label="Tenant ID (default: organizations)"
              value={sync?.auth?.tenantId || "organizations"}
              onChange={(v) => saveOneDriveConfig({ tenantId: v })}
            />
            <TextField
              label="Client ID (Application ID)"
              value={sync?.auth?.clientId || ""}
              onChange={(v) => saveOneDriveConfig({ clientId: v })}
            />
          </div>

          <div className="row" style={{ marginTop: 14, gap: 10, flexWrap: "wrap" }}>
            <button className="btn" onClick={() => connectOneDrive("approot")}>Conectar (AppFolder)</button>
            <button className="btn" onClick={() => connectOneDrive("folder")}>Conectar (Carpeta dedicada)</button>
            <button className="btn secondary" onClick={doSyncNow}>Sincronizar ahora</button>
            <button className="btn secondary" onClick={doDisconnect}>Desconectar</button>
          </div>

          <MsgBox msg={syncMsg} />
        </div>
      )}
    </div>
  );
}
