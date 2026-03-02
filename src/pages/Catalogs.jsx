import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  listActiveCR,
  upsertCR,
  listActiveAccounts,
  upsertAccount,
  listActivePartidas,
  upsertPartida,
} from "../db.js";
import TextField from "../components/TextField.jsx";

function CatalogBlock({ title, rows, onAdd }) {
  return (
    <div className="card">
      <h2>{title}</h2>

      {rows.length === 0 ? (
        <div className="small">Sin registros.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rows.map((r) => (
            <div
              key={r.code}
              className="row"
              style={{ justifyContent: "space-between", alignItems: "center" }}
            >
              <div>
                <b>{r.code}</b> <span className="small">— {r.name}</span>
              </div>
              <span className="pill">{r.activo ? "activo" : "inactivo"}</span>
            </div>
          ))}
        </div>
      )}

      <hr />
      {onAdd}
    </div>
  );
}

export default function Catalogs() {
  const [crs, setCrs] = useState([]);
  const [accts, setAccts] = useState([]);
  const [parts, setParts] = useState([]);

  const [crCodigo, setCrCodigo] = useState("");
  const [crNombre, setCrNombre] = useState("");

  const [ctaCodigo, setCtaCodigo] = useState("");
  const [ctaNombre, setCtaNombre] = useState("");

  const [partCodigo, setPartCodigo] = useState("");
  const [partNombre, setPartNombre] = useState("");

  async function refresh() {
    setCrs(await listActiveCR());
    setAccts(await listActiveAccounts());
    setParts(await listActivePartidas());
  }

  useEffect(() => {
    refresh();
  }, []);

  async function addCR() {
    if (!crCodigo.trim() || !crNombre.trim()) return;
    await upsertCR({
      crCodigo: crCodigo.trim(),
      crNombre: crNombre.trim(),
      activo: true,
    });
    setCrCodigo("");
    setCrNombre("");
    await refresh();
  }

  async function addAcct() {
    if (!ctaCodigo.trim() || !ctaNombre.trim()) return;
    await upsertAccount({
      ctaCodigo: ctaCodigo.trim(),
      ctaNombre: ctaNombre.trim(),
      activo: true,
    });
    setCtaCodigo("");
    setCtaNombre("");
    await refresh();
  }

  async function addPart() {
    if (!partCodigo.trim() || !partNombre.trim()) return;
    await upsertPartida({
      partidaCodigo: partCodigo.trim(),
      partidaNombre: partNombre.trim(),
      activo: true,
    });
    setPartCodigo("");
    setPartNombre("");
    await refresh();
  }

  return (
    <div>
      {/* ✅ Botón para administrar Conceptos */}
      <div className="row" style={{ marginBottom: 12 }}>
        <Link className="btn" to="/maestros/conceptos">
          Conceptos
        </Link>
      </div>

      <div className="grid2">
        <CatalogBlock
          title="Centros de Responsabilidad (CR)"
          rows={crs.map((x) => ({
            code: x.crCodigo,
            name: x.crNombre,
            activo: x.activo,
          }))}
          onAdd={
            <div className="row">
              <TextField label="Código" value={crCodigo} onChange={setCrCodigo} />
              <TextField label="Nombre" value={crNombre} onChange={setCrNombre} />
              <button className="btn" style={{ alignSelf: "end" }} onClick={addCR}>
                Agregar
              </button>
            </div>
          }
        />

        <CatalogBlock
          title="Cuentas Contables"
          rows={accts.map((x) => ({
            code: x.ctaCodigo,
            name: x.ctaNombre,
            activo: x.activo,
          }))}
          onAdd={
            <div className="row">
              <TextField label="Código" value={ctaCodigo} onChange={setCtaCodigo} />
              <TextField label="Nombre" value={ctaNombre} onChange={setCtaNombre} />
              <button className="btn" style={{ alignSelf: "end" }} onClick={addAcct}>
                Agregar
              </button>
            </div>
          }
        />

        <CatalogBlock
          title="Partidas"
          rows={parts.map((x) => ({
            code: x.partidaCodigo,
            name: x.partidaNombre,
            activo: x.activo,
          }))}
          onAdd={
            <div className="row">
              <TextField label="Código" value={partCodigo} onChange={setPartCodigo} />
              <TextField label="Nombre" value={partNombre} onChange={setPartNombre} />
              <button className="btn" style={{ alignSelf: "end" }} onClick={addPart}>
                Agregar
              </button>
            </div>
          }
        />
      </div>
    </div>
  );
}
