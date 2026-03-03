import React, { useEffect, useState } from "react";
import { getSettings, saveSettings, listActiveCR, getSyncState, saveSyncState } from "../db.js";
import TextField from "../components/TextField.jsx";
import SelectField from "../components/SelectField.jsx";
import { startOneDriveLogin, disconnectOneDrive } from "../services/onedriveAuth.js";
import { syncOnce } from "../services/syncEngine.js";
import { putFileByPath } from "../services/onedriveApi.js";
import { generateEncryptedBackupBlob, restoreFromEncryptedBackupFile } from "../services/backupEngine.js";

export default function Settings() {
  // Compat: evita crashes si quedó algún handler antiguo
  const setRestoreStatus = (msg) => setRestoreMsg(msg);

  const [s, setS] = useState(null);
  const [crs, setCrs] = useState([]);
  const [msg, setMsg] = useState("");
  const [sync, setSync] = useState(null);
  const [syncMsg, setSyncMsg] = useState("");
  const [backupPass, setBackupPass] = useState("");
  const [restorePass, setRestorePass] = useState("");
  const [restoreFile, setRestoreFile] = useState(null);
  const [backupMsg, setBackupMsg] = useState("");
  const [restoreMsg, setRestoreMsg] = useState("");
  const [backupBusy, setBackupBusy] = useState(false);

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

      // Download locally by default
      const fileName = `backup_full_${new Date().toISOString().replace(/[:.]/g, "-")}.cczip`;

      if (uploadToOneDrive) {
        // Require OneDrive root configured (sync connection)
        const st = await getSyncState();
        if (!st?.rootMode || !st?.driveId || !st?.rootFolderItemId) {
          setBackupMsg("⚠️ OneDrive no está conectado/configurado. Conecta AppFolder y sincroniza primero.");
          return;
        }
        // Upload under approot or configured root using API helper (approot path by default here)
        const r = await putFileByPath({
          path: `exports/${fileName}`,
          contentType: "application/octet-stream",
          data: blob,
        });
        if (!r.ok) {
          setBackupMsg(`❌ Error subiendo backup: ${r.error || "put_failed"}`);
          return;
        }
        setBackupMsg(`✅ Backup subido a OneDrive: exports/${fileName} (Gastos: ${storeCounts.expenses ?? 0}, Rendiciones: ${storeCounts.reimbursements ?? 0}, Boletas: ${storeCounts.attachments ?? 0})`);
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        setBackupMsg(`✅ Backup generado: ${fileName} (Gastos: ${storeCounts.expenses ?? 0}, Rendiciones: ${storeCounts.reimbursements ?? 0}, Boletas: ${storeCounts.attachments ?? 0})`);
      }
    } catch (e) {
      const code = e?.code || e?.message || "backup_failed";
      if (code === "empty_backup") {
        setBackupMsg("⚠️ Backup vacío: no hay gastos/rendiciones/boletas para respaldar.");
      } else if (code === "passphrase_too_short") {
        setBackupMsg("⚠️ La contraseña debe tener al menos 6 caracteres.");
      } else {
        setBackupMsg(`❌ Error generando backup: ${code}`);
      }
    } finally {
      setBackupBusy(false);
    }
  }

  async function doRestoreBackup() {
    setRestoreMsg("");
    setBackupBusy(true);
    try {
      if (!restoreFile) {
        setRestoreMsg("⚠️ Debes seleccionar un archivo .cczip primero.");
        return;
      }
      if (!restorePass || restorePass.length < 6) {
        setRestoreMsg("⚠️ Debes ingresar la contraseña (mín. 6).");
        return;
      }
      setRestoreMsg("⏳ Restaurando… no cierres esta pestaña.");
      const r = await restoreFromEncryptedBackupFile(restoreFile, restorePass, {
          timeoutMs: 60000,
          onProgress: (p) => {
            const phase = p?.phase || 'working';
            const map = {
              read: 'Leyendo archivo…',
              decrypt: 'Descifrando…',
              unzip: 'Abriendo ZIP…',
              parse: 'Leyendo data.json…',
              open_db: 'Abriendo base local…',
              clear_stores: 'Vaciando base local…',
              insert_begin: 'Restaurando registros…',
              insert_store: `Restaurando ${p.store} (${p.count})…`,
              done: 'Restauración completa. Reiniciando…',
            };
            setRestoreMsg({ kind: 'info', text: map[phase] || `Restaurando… (${phase})` });
          }
        });
      if (!r?.ok) {
        setRestoreMsg("❌ Restauración fallida.");
        return;
      }
      const c = r.insertedCounts || r.storeCounts || {};
      setRestoreMsg(
        `✅ Restauración OK. Gastos: ${c.expenses ?? 0}, Rendiciones: ${c.reimbursements ?? 0}, Boletas: ${c.attachments ?? 0}. Reiniciando…`
      );
      setTimeout(() => window.location.reload(), 400);
    } catch (e) {
      const code = e?.code || e?.message || "restore_failed";
      if (String(code).includes("bad_backup")) {
        setRestoreMsg("❌ Archivo inválido o corrupto.");
      } else if (code === "passphrase_too_short") {
        setRestoreMsg("⚠️ Contraseña inválida (mín. 6).");
      } else {
        setRestoreMsg(`❌ Restauración fallida: ${code}`);
      }
    } finally {
      setBackupBusy(false);
    }
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

      <h3>Correlativo</h3>
      <div className="row">
        <TextField label="Prefijo" value={s.correlativoPrefix} onChange={(v)=>setS({...s, correlativoPrefix:v})} />
        <TextField label="Siguiente N°" type="number" value={s.correlativoNextNumber} onChange={(v)=>setS({...s, correlativoNextNumber:Number(v)})} />
      </div>

      
      <hr />

      <h3>Backup cifrado (Fase 1 - Disaster Recovery)</h3>
      <div className="small" style={{ marginBottom: 10 }}>
        Genera un archivo <b>.cczip</b> cifrado con tu contraseña (AES-GCM) que contiene toda la base (data.json + boletas). 
        Puedes descargarlo o subirlo a OneDrive.
      </div>

      <div className="row">
        <TextField
          label="Contraseña backup (mín. 6)"
          value={backupPass}
          onChange={setBackupPass}
          type="password"
        />
      </div>

      <div className="row" style={{ marginTop: 12, gap: 10 }}>
        <button className="btn" disabled={backupBusy} onClick={() => doGenerateBackup({ uploadToOneDrive: false })}>
          Generar .cczip (descargar)
        </button>
        <button className="btn" disabled={backupBusy} onClick={() => doGenerateBackup({ uploadToOneDrive: true })}>
          Subir backup a OneDrive
        </button>
      </div>

      {backupMsg && (
        <div className="small" style={{ marginTop: 10, padding: 10, border: "1px solid rgba(255,255,255,.12)", borderRadius: 12 }}>
          {backupMsg}
        </div>
      )}

      <hr />

      <h3>Restaurar desde .cczip</h3>
      <div className="small" style={{ marginBottom: 10 }}>
        Restaura reemplazando la base local. Recomendación: cierra otras pestañas de Caja Chica antes de restaurar.
      </div>

      <div className="row">
        <div style={{ flex: 1 }}>
          <div className="label">Archivo .cczip</div>
          <input
            type="file"
            accept=".cczip,application/octet-stream"
            onChange={(e) => setRestoreFile(e.target.files?.[0] || null)}
          />
        </div>
        <TextField
          label="Contraseña"
          value={restorePass}
          onChange={setRestorePass}
          type="password"
        />
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn danger" disabled={backupBusy} onClick={doRestoreBackup}>
          Restaurar (REEMPLAZA local)
        </button>
      </div>

      {restoreMsg && (
        <div className="small" style={{ marginTop: 10, padding: 10, border: "1px solid rgba(255,255,255,.12)", borderRadius: 12 }}>
          {restoreMsg}
        </div>
      )}

      <div className="row" style={{marginTop:12}}>
        <button className="btn" onClick={save}>Guardar</button>
      </div>
    </div>
  );
}