import React from "react";

export default function FileCapture({ onFiles }) {
  return (
    <div style={{flex:1, minWidth: 220}}>
      <label>Respaldo (foto)</label>
      <input
        className="input"
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        onChange={(e)=>onFiles(Array.from(e.target.files || []))}
      />
      <div className="small">Tip: en móvil abre cámara. Se comprime antes de guardar.</div>
    </div>
  );
}