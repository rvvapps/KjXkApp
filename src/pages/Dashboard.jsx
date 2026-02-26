import React, { useEffect, useMemo, useState } from "react";
import { listPendingExpenses, listReimbursements } from "../db.js";
import { Link } from "react-router-dom";

export default function Dashboard() {
  const [pending, setPending] = useState([]);
  const [reims, setReims] = useState([]);

  useEffect(() => {
    (async () => {
      setPending(await listPendingExpenses());
      setReims(await listReimbursements());
    })();
  }, []);

  const totalPending = useMemo(() => pending.reduce((s,e)=>s + (Number(e.monto)||0), 0), [pending]);

  return (
    <div className="grid2">
      <div className="card">
        <h2>Estado</h2>
        <div className="row">
          <div style={{flex:1, minWidth: 220}}>
            <div className="small">Gastos pendientes</div>
            <div className="kpi">{pending.length}</div>
          </div>
          <div style={{flex:1, minWidth: 220}}>
            <div className="small">Monto pendiente</div>
            <div className="kpi">${totalPending.toLocaleString("es-CL")}</div>
          </div>
        </div>
        <hr/>
        <div className="row">
          <Link className="btn" to="/gastos/nuevo">Registrar gasto</Link>
          <Link className="btn secondary" to="/rendiciones">Crear rendición</Link>
        </div>
      </div>

      <div className="card">
        <h2>Últimas rendiciones</h2>
        {reims.length === 0 ? (
          <div className="small">Aún no tienes rendiciones.</div>
        ) : (
          <div className="row" style={{flexDirection:"column"}}>
            {reims.slice(0,5).map(r => (
              <div key={r.rendicionId} className="row" style={{justifyContent:"space-between", alignItems:"center"}}>
                <div>
                  <div style={{fontWeight:800}}>{r.correlativo}</div>
                  <div className="small">{new Date(r.fechaCreacion).toLocaleString("es-CL")}</div>
                </div>
                <span className="pill">{r.estado}</span>
              </div>
            ))}
          </div>
        )}
        <hr/>
        <Link className="btn secondary" to="/rendiciones">Ver todas</Link>
      </div>
    </div>
  );
}