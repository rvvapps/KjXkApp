import React, { useEffect, useState } from "react";
import { getSettings, saveSettings, listActiveCR, getSyncState, saveSyncState } from "../db.js";
import TextField from "../components/TextField.jsx";
import SelectField from "../components/SelectField.jsx";
import { startOneDriveLogin, disconnectOneDrive } from "../services/onedriveAuth.js";
import { syncOnce } from "../services/syncEngine.js";
import { generateEncryptedFullBackup, restoreFromEncryptedBackup } from "../services/backupEngine.js";
import { ensureOneDriveRoot, putFileUnderRoot } from "../services/onedriveApi.js";

export default function Settings() {
  const [s, setS] = useState(null);
  const [crs, setCrs] = useState([]);
  const [msg, setMsg] = useState("");
  const [sync, setSync] = useState(null);
  const [syncMsg, setSyncMsg] = useState("");
  const [backupPass, setBackupPass] = useState("");
  const [backupMsg, setBackupMsg] = useState("");
  const [restorePass, setRestorePass] = useState("");
  const [restoreFile, setRestoreFile] = useState(null);
  const [restoreMsg, setRestoreMsg] = useState("");

  useEffect(() => {
    (async () => {
      setS(await getSettings());
      setCrs(await listActiveCR());
      setSync(await getSyncState());
    })();
  }, []);

  async function save() {
    setMsg("");
    await saveSettings(s);
    setMsg("✅ Guardado.");
  }

  async function saveOneDriveConfig(patch) {
    const cur = await getSyncState();
    const next = await saveSyncState({
      auth: {
        ...(cur?.auth || {}),
        ...(patch || {}),
      },
    });
    setSync(next);
  }

  async function connectOneDrive(preferredMode = "approot") {
    setSyncMsg("");
    const tenantId = sync?.auth?.tenantId || "organizations";
    const clientId = sync?.auth?.clientId || "";
    if (!clientId) {
      setSyncMsg("⚠️ Debes ingresar Client ID (Application ID) antes de conectar.");
      return;
    }
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

  
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function doBackupLocal() {
    setBackupMsg("Generando backup…");
    try {
      const r = await generateEncryptedFullBackup({ passphrase: backupPass });
      if (!r.ok) {
        if (r.error === "empty_backup") {
          setBackupMsg("❌ Backup vacío: no se encontraron datos (gastos/rendiciones/boletas). Crea al menos 1 gasto y vuelve a intentar.");
        } else {
          if (r.error === "empty_backup") {
          setBackupMsg("❌ Backup vacío: no se encontraron datos (gastos/rendiciones/boletas). Crea al menos 1 gasto y vuelve a intentar.");
        } else {
          setBackupMsg(`❌ Backup: ${r.error}`);
        }
        }
        return;
      }
      downloadBlob(r.blob, r.filename);
      const exp = r.summary?.storeCounts?.expenses ?? 0;
      const ren = r.summary?.storeCounts?.reimbursements ?? 0;
      const att = r.summary?.storeCounts?.attachments ?? 0;
      setBackupMsg(`✅ Backup generado: ${r.filename} (Gastos: ${exp}, Rendiciones: ${ren}, Boletas: ${att})`);
      // update lastWeeklyBackupAt (informativo)
      const cur = await getSettings();
      await saveSettings({ ...cur, lastWeeklyBackupAt: new Date().toISOString() });
      setS(await getSettings());
    } catch (e) {
      setBackupMsg(`❌ Backup falló: ${String(e?.message || e)}`);
    }
  }

  async function doBackupUploadOneDrive() {
    setBackupMsg("Generando y subiendo backup a OneDrive…");
    try {
      const r = await generateEncryptedFullBackup({ passphrase: backupPass });
      if (!r.ok) {
        if (r.error === "empty_backup") {
          setBackupMsg("❌ Backup vacío: no se encontraron datos (gastos/rendiciones/boletas). Crea al menos 1 gasto y vuelve a intentar.");
        } else {
          if (r.error === "empty_backup") {
          setBackupMsg("❌ Backup vacío: no se encontraron datos (gastos/rendiciones/boletas). Crea al menos 1 gasto y vuelve a intentar.");
        } else {
          setBackupMsg(`❌ Backup: ${r.error}`);
        }
        }
        return;
      }
      const root = await ensureOneDriveRoot({ preferAppFolder: true });
      if (!root.ok) {
        setBackupMsg(`❌ OneDrive: ${root.error || "no_root"}`);
        return;
      }
      const up = await putFileUnderRoot({
        rootMode: root.rootMode,
        rootFolderItemId: root.rootFolderItemId,
        relPath: `exports/${r.filename}`,
        contentType: "application/octet-stream",
        data: r.blob,
      });
      if (!up.ok) {
        setBackupMsg("❌ Error subiendo backup a OneDrive.");
        return;
      }
      const cur = await getSettings();
      await saveSettings({ ...cur, lastWeeklyBackupAt: new Date().toISOString() });
      setS(await getSettings());
      setBackupMsg(`✅ Backup subido a OneDrive: exports/${r.filename}`);
    } catch (e) {
      setBackupMsg(`❌ Backup falló: ${String(e?.message || e)}`);
    }
  }

  async function doRestoreFromFile() {
    setRestoreMsg("Restaurando…");
    try {
      const r = await restoreFromEncryptedBackup({ file: restoreFile, passphrase: restorePass });
      if (!r.ok) {
        setRestoreMsg(`❌ Restore: ${r.error}. ${r.detail || ""}`);
        return;
      }
      setRestoreMsg("✅ Restauración OK. Reiniciando…");
      setTimeout(() => window.location.reload(), 600);
    } catch (e) {
      setRestoreMsg(`❌ Restore falló: ${String(e?.message || e)}`);
    }
  }

async function doDisconnect() {
    await disconnectOneDrive();
    setSync(await getSyncState());
    setSyncMsg("Desconectado.");
  }

  if (!s) return <div className="card">Cargando…</div>;

  return (
    <div className="card">
      <h2>Ajustes</h2>
      {msg && <div className="small" style={{padding:10, border:"1px solid rgba(255,255,255,.12)", borderRadius:12}}>{msg}</div>}

      <h3>Perfil (encabezado rendición)</h3>
      <div className="row">
        <TextField label="Nombre responsable" value={s.responsableNombre} onChange={(v)=>setS({...s, responsableNombre:v})} />
        <TextField label="RUT" value={s.responsableRut} onChange={(v)=>setS({...s, responsableRut:v})} />
      </div>
      <div className="row" style={{marginTop:12}}>
        <TextField label="Cargo" value={s.cargo} onChange={(v)=>setS({...s, cargo:v})} />
        <TextField label="Tel/Cel" value={s.telefono} onChange={(v)=>setS({...s, telefono:v})} />
      </div>
      <div className="row" style={{marginTop:12}}>
        <TextField label="Empresa" value={s.empresa} onChange={(v)=>setS({...s, empresa:v})} />
        <SelectField
          label="CR por defecto"
          value={s.crDefaultCodigo}
          onChange={(v)=>setS({...s, crDefaultCodigo:v})}
          options={crs.map(x => ({ value:x.crCodigo, label:`${x.crCodigo} - ${x.crNombre}` }))}
          placeholder="Seleccione..."
        />
      </div>

      <hr />

      <h3>Dispositivo y sincronización (Fase 1)</h3>
      <div className="row">
        <TextField
          label="Nombre del dispositivo (ej: iPhone Rodolfo)"
          value={s.deviceLabel || ""}
          onChange={(v)=>setS({...s, deviceLabel:v})}
        />
      </div>
      <div className="small" style={{marginTop:8, opacity:.9}}>
        <div><b>DeviceId:</b> {(s.deviceId || "").slice(0, 8)}…</div>
        <div><b>Revisión local:</b> {typeof s.localRevision === "number" ? s.localRevision : 0}</div>
        <div><b>Última sync:</b> {s.lastSyncAt || "—"}</div>
        <div><b>Último backup semanal:</b> {s.lastWeeklyBackupAt || "—"}</div>
      </div>
      <div className="small" style={{marginTop:10}}>
        En Fase 1 la sincronización corre cuando la app está abierta (iOS no soporta background sync real).
      </div>

      <h4 style={{marginTop:14}}>OneDrive (Fase 1)</h4>
      <div className="small" style={{opacity:.9, marginBottom:8}}>
        Se usa OneDrive como respaldo/sync automático: sube eventos y boletas cuando hay conexión.
      </div>
      {syncMsg && <div className="small" style={{padding:10, border:"1px solid rgba(255,255,255,.12)", borderRadius:12, marginBottom:10}}>{syncMsg}</div>}

      <div className="row">
        <TextField
          label="Tenant (default: organizations)"
          value={sync?.auth?.tenantId || "organizations"}
          onChange={(v)=>saveOneDriveConfig({ tenantId: v })}
        />
        <TextField
          label="Client ID (Application ID)"
          value={sync?.auth?.clientId || ""}
          onChange={(v)=>saveOneDriveConfig({ clientId: v })}
        />
      </div>

      <div className="small" style={{marginTop:8, opacity:.9}}>
        <div><b>Modo:</b> {sync?.auth?.mode || "—"}</div>
        <div><b>Conectado:</b> {sync?.auth?.connectedAt || "—"}</div>
        <div><b>Root:</b> {sync?.rootMode || "—"}</div>
      </div>

      <div className="row" style={{marginTop:12, gap:10, flexWrap:"wrap"}}>
        <button className="btn" onClick={()=>connectOneDrive("approot")}>Conectar (AppFolder)</button>
        <button className="btn" onClick={()=>connectOneDrive("folder")}>Conectar (Carpeta dedicada)</button>
        <button className="btn" onClick={doSyncNow}>Sincronizar ahora</button>
        <button className="btn" onClick={doDisconnect}>Desconectar</button>
      </div>

      <h3>Cuenta / banco (para formulario)</h3>
      <div className="row">
        <TextField label="Tipo cuenta" value={s.tipoCuenta} onChange={(v)=>setS({...s, tipoCuenta:v})} />
        <TextField label="Banco" value={s.banco} onChange={(v)=>setS({...s, banco:v})} />
      </div>
      <div className="row" style={{marginTop:12}}>
        <TextField label="N° Cuenta" value={s.numeroCuenta} onChange={(v)=>setS({...s, numeroCuenta:v})} />
      </div>

      
      <hr />

      <h3>Backup cifrado (Fase 1 - Disaster Recovery)</h3>
      <div className="small" style={{opacity:.9}}>
        Genera un archivo <b>.cczip</b> que contiene <b>toda</b> la base (data.json + boletas). Está cifrado con tu contraseña (AES-GCM).
      </div>

      <div className="row" style={{marginTop:12}}>
        <TextField
          label="Contraseña backup (mín. 6)"
          value={backupPass}
          onChange={(v)=>setBackupPass(v)}
        />
      </div>

      <div style={{display:"flex", gap:10, flexWrap:"wrap", marginTop:12}}>
        <button className="btn" onClick={doBackupLocal}>Generar .cczip (descargar)</button>
        <button className="btn" onClick={doBackupUploadOneDrive}>Subir backup a OneDrive</button>
      </div>

      {backupMsg && <div className="small" style={{marginTop:10, padding:10, border:"1px solid rgba(255,255,255,.12)", borderRadius:12}}>{backupMsg}</div>}

      <div className="small" style={{marginTop:10, opacity:.9}}>
        <div><b>Último backup:</b> {s.lastWeeklyBackupAt ? new Date(s.lastWeeklyBackupAt).toLocaleString() : "—"}</div>
      </div>

      <hr />

      <h3>Restaurar desde .cczip</h3>
      <div className="row" style={{marginTop:12}}>
        <div style={{flex:1}}>
          <div className="label">Archivo .cczip</div>
          <input type="file" accept=".cczip,application/octet-stream" onChange={(e)=>setRestoreFile(e.target.files?.[0] || null)} />
        </div>
        <TextField
          label="Contraseña"
          value={restorePass}
          onChange={(v)=>setRestorePass(v)}
        />
      </div>

      <div style={{display:"flex", gap:10, flexWrap:"wrap", marginTop:12}}>
        <button className="btn danger" onClick={doRestoreFromFile} disabled={!restoreFile}>Restaurar (REEMPLAZA local)</button>
      </div>

      {restoreMsg && <div className="small" style={{marginTop:10, padding:10, border:"1px solid rgba(255,255,255,.12)", borderRadius:12}}>{restoreMsg}</div>}
<hr />

      <h3>Correlativo</h3>
      <div className="row">
        <TextField label="Prefijo" value={s.correlativoPrefix} onChange={(v)=>setS({...s, correlativoPrefix:v})} />
        <TextField label="Siguiente N°" type="number" value={s.correlativoNextNumber} onChange={(v)=>setS({...s, correlativoNextNumber:Number(v)})} />
      </div>

      <div className="row" style={{marginTop:12}}>
        <button className="btn" onClick={save}>Guardar</button>
      </div>
    </div>
  );
}