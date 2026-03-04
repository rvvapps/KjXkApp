import React from "react";

export default function SelectField({ label, value, onChange, options, placeholder = "Seleccione...", renderOption }) {
  return (
    <div style={{flex:1, minWidth: 220}}>
      <label>{label}</label>
      <select className="input" value={value || ""} onChange={(e)=>onChange(e.target.value)}>
        <option value="">{placeholder}</option>
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>
            {renderOption ? renderOption(opt) : opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}