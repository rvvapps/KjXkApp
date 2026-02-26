import React, { useEffect, useState } from "react";
import { getSettings, saveSettings, listActiveCR } from "../db.js";
import TextField from "../components/TextField.jsx";
import SelectField from "../components/SelectField.jsx";

export default function Settings() {
  const [s, setS] = useState(null);
  const [crs, setCrs] = useState([]);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    (async () => {
      setS(await getSettings());
      setCrs(await listActiveCR());
    })();
  }, []);

  async function save() {
    setMsg("");
    await saveSettings(s);
    setMsg("✅ Guardado.");
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

      <div className="row" style={{marginTop:12}}>
        <button className="btn" onClick={save}>Guardar</button>
      </div>
    </div>
  );
}