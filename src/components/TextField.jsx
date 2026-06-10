import React from "react";

export default function TextField({ label, value, onChange, placeholder = "", type = "text", style }) {
  return (
    <div style={{ flex: 1, minWidth: 0, width: "100%", ...style }}>
      <label>{label}</label>
      <input
        className="input"
        type={type}
        value={value || ""}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={{ fontSize: 16 }} /* evita zoom en iOS */
      />
    </div>
  );
}
