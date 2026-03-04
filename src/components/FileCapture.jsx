import React from "react";

export default function FileCapture({ onFiles }) {
  return (
    <div style={{ flex: 1, minWidth: 220 }}>
      <label>Respaldo (foto o PDF)</label>
      <input
        className="input"
        type="file"
        accept="image/*,application/pdf"
        multiple
        onChange={(e) => onFiles(Array.from(e.target.files || []))}
      />
      <div className="small">Foto, imagen o PDF. Las imágenes se comprimen antes de guardar.</div>
    </div>
  );
}
