import React from "react";

export default function FileCapture({ onFiles }) {
  return (
    <div style={{ flex: 1, minWidth: 220 }}>
      <label>Respaldo (foto)</label>
      <input
        className="input"
        type="file"
        accept="image/*"
        // FIX: se eliminó capture="environment" que forzaba la cámara en iOS
        // sin este atributo, iOS presenta el panel para elegir entre Cámara o Galería
        multiple
        onChange={(e) => onFiles(Array.from(e.target.files || []))}
      />
      <div className="small">Tip: en móvil puedes tomar foto o elegir desde galería. Se comprime antes de guardar.</div>
    </div>
  );
}
