import React from "react";

export default function ErrorBanner() {
  const [err, setErr] = React.useState(() => {
    try { return JSON.parse(sessionStorage.getItem("cc_last_error") || "null"); } catch { return null; }
  });

  React.useEffect(() => {
    const onEvt = () => {
      try { setErr(JSON.parse(sessionStorage.getItem("cc_last_error") || "null")); } catch {}
    };
    window.addEventListener("cc:error", onEvt);
    return () => window.removeEventListener("cc:error", onEvt);
  }, []);

  if (!err) return null;

  return (
    <div style={{
      background: "rgba(220,38,38,.15)",
      border: "1px solid rgba(220,38,38,.35)",
      borderRadius: 14,
      padding: 12,
      marginBottom: 12
    }}>
      <div style={{display:"flex", justifyContent:"space-between", gap:12, alignItems:"center"}}>
        <div>
          <b style={{color:"#fecaca"}}>Error</b>
          <div className="small" style={{opacity:.95, marginTop:4, whiteSpace:"pre-wrap"}}>{err.message || String(err)}</div>
          {err.stack && <div className="small" style={{opacity:.75, marginTop:8, whiteSpace:"pre-wrap"}}>{err.stack}</div>}
        </div>
        <button className="btn secondary" onClick={() => { sessionStorage.removeItem("cc_last_error"); window.dispatchEvent(new Event("cc:error")); }}>
          Ocultar
        </button>
      </div>
    </div>
  );
}
