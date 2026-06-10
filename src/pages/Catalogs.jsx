import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  listActiveCR, upsertCR, deleteCR,
  listActiveAccounts, upsertAccount, deleteAccount,
  listActivePartidas, upsertPartida, deletePartida,
  listActiveClasificaciones, upsertClasificacion, deleteClasificacion,
  listActiveDestinations, upsertDestination, deleteDestination,
} from "../db.js";
import SelectField from "../components/SelectField.jsx";
import TextField from "../components/TextField.jsx";

// Muestra todos los registros (activos e inactivos) con edición inline, toggle y eliminar
function CatalogBlock({ title, rows, onSave, onDelete, onAdd }) {
  const [editing, setEditing] = useState(null);
  const [delErr, setDelErr] = useState("");

  function startEdit(r) {
    setEditing({ code: r.code, name: r.name, originalCode: r.code });
  }

  async function saveEdit(r) {
    // Pasamos _originalCode para que el upsert sepa si el código cambió
    await onSave({ ...r, code: editing.code.trim(), name: editing.name.trim(), _originalCode: editing.originalCode });
    setEditing(null);
  }

  async function toggleActivo(r) {
    await onSave({ ...r, activo: !r.activo });
  }

  async function handleDelete(r) {
    setDelErr("");
    if (!confirm(`¿Eliminar "${r.name}" (${r.code})? Esta acción no se puede deshacer.`)) return;
    try {
      await onDelete(r.code);
    } catch (e) {
      setDelErr(e?.message || "Error al eliminar.");
    }
  }

  return (
    <div className="card">
      <h2>{title}</h2>

      {delErr && (
        <div className="small" style={{ color: "#f87171", marginBottom: 8 }}>{delErr}</div>
      )}

      {rows.length === 0 ? (
        <div className="small">Sin registros.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rows.map((r) => (
            <div key={r.code} style={{
              borderTop: "1px solid var(--sep)",
              paddingTop: 8,
              opacity: r.activo === false ? 0.55 : 1,
            }}>
              {editing?.originalCode === r.code ? (
                <div className="row" style={{ alignItems: "end", gap: 8 }}>
                  <TextField label="Código" value={editing.code} onChange={(v) => setEditing({ ...editing, code: v })} />
                  <TextField label="Nombre" value={editing.name} onChange={(v) => setEditing({ ...editing, name: v })} />
                  <button className="btn" style={{ alignSelf: "end" }} onClick={() => saveEdit(r)}>Guardar</button>
                  <button className="btn secondary" style={{ alignSelf: "end" }} onClick={() => setEditing(null)}>Cancelar</button>
                </div>
              ) : (
                <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <b>{r.code}</b>
                    <span className="small"> — {r.name}</span>
                    <span className="pill" style={{ marginLeft: 8, fontSize: 11 }}>
                      {r.activo !== false ? "activo" : "inactivo"}
                    </span>
                  </div>
                  <div className="row" style={{ gap: 6 }}>
                    <button className="btn secondary" onClick={() => startEdit(r)}>Editar</button>
                    <button className="btn secondary" onClick={() => toggleActivo(r)}>
                      {r.activo !== false ? "Desactivar" : "Activar"}
                    </button>
                    <button className="btn danger" onClick={() => handleDelete(r)}>Eliminar</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <hr />
      {onAdd}
    </div>
  );
}


function DestsBlock({ dests, crs, onRefresh, destForm, setDestForm, onAdd }) {
  const [editing, setEditing] = useState(null);
  const [delErr, setDelErr] = useState("");

  function startEdit(d) {
    setEditing({
      destinationId: d.destinationId,
      destino: d.destino,
      monto: String(d.monto || ""),
      crCodigo: d.crCodigo || "",
      notas: d.notas || "",
      activo: d.activo !== false,
    });
  }

  async function saveEdit() {
    if (!editing.destino.trim()) return;
    await upsertDestination({
      destinationId: editing.destinationId,
      destino: editing.destino.trim(),
      monto: Number(editing.monto) || 0,
      crCodigo: editing.crCodigo || "",
      notas: editing.notas.trim(),
      activo: editing.activo,
    });
    setEditing(null);
    await onRefresh();
  }

  async function toggleActivo(d) {
    await upsertDestination({ ...d, activo: !d.activo });
    await onRefresh();
  }

  async function handleDelete(d) {
    setDelErr("");
    if (!confirm(`¿Eliminar destino "${d.destino}"? Esta acción no se puede deshacer.`)) return;
    try {
      await deleteDestination(d.destinationId);
      await onRefresh();
    } catch (e) {
      setDelErr(e?.message || "Error al eliminar.");
    }
  }

  return (
    <div className="card">
      <h2>Destinos favoritos (combustible)</h2>
      <div className="small" style={{ marginBottom: 10 }}>
        Destinos con monto fijo por trayecto. Se pre-completan al registrar un traslado.
      </div>

      {delErr && <div className="small" style={{ color: "#f87171", marginBottom: 8 }}>{delErr}</div>}

      {dests.length === 0 ? (
        <div className="small">Sin destinos favoritos.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {dests.map((d) => (
            <div key={d.destinationId} style={{
              borderTop: "1px solid var(--sep)",
              paddingTop: 8,
              opacity: d.activo === false ? 0.55 : 1,
            }}>
              {editing?.destinationId === d.destinationId ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div className="row">
                    <TextField label="Destino" value={editing.destino} onChange={(v) => setEditing({ ...editing, destino: v })} />
                    <TextField label="Monto ($)" type="number" value={editing.monto} onChange={(v) => setEditing({ ...editing, monto: v })} />
                  </div>
                  <div className="row">
                    <SelectField
                      label="CR"
                      value={editing.crCodigo}
                      onChange={(v) => setEditing({ ...editing, crCodigo: v })}
                      options={crs.filter((x) => x.activo !== false).map((x) => ({ value: x.crCodigo, label: `${x.crCodigo} - ${x.crNombre}` }))}
                      placeholder="Opcional..."
                    />
                    <TextField label="Notas" value={editing.notas} onChange={(v) => setEditing({ ...editing, notas: v })} placeholder="Opcional" />
                  </div>
                  <div className="row">
                    <button className="btn" onClick={saveEdit}>Guardar</button>
                    <button className="btn secondary" onClick={() => setEditing(null)}>Cancelar</button>
                  </div>
                </div>
              ) : (
                <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <b>{d.destino}</b>
                    <span className="small"> — ${Number(d.monto || 0).toLocaleString("es-CL")}</span>
                    {d.crCodigo && <span className="small"> · CR {d.crCodigo}</span>}
                    {d.notas && <div className="small" style={{ opacity: 0.7 }}>{d.notas}</div>}
                    <span className="pill" style={{ marginLeft: 8, fontSize: 11 }}>
                      {d.activo !== false ? "activo" : "inactivo"}
                    </span>
                  </div>
                  <div className="row" style={{ gap: 6 }}>
                    <button className="btn secondary" onClick={() => startEdit(d)}>Editar</button>
                    <button className="btn secondary" onClick={() => toggleActivo(d)}>
                      {d.activo !== false ? "Desactivar" : "Activar"}
                    </button>
                    <button className="btn danger" onClick={() => handleDelete(d)}>Eliminar</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <hr />
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div className="row">
          <TextField label="Destino" value={destForm.destino} onChange={(v) => setDestForm({ ...destForm, destino: v })} placeholder="Ej: Proveedor ABC - Quilpué" />
          <TextField label="Monto por trayecto ($)" type="number" value={destForm.monto} onChange={(v) => setDestForm({ ...destForm, monto: v })} />
        </div>
        <div className="row">
          <SelectField
            label="CR asociado"
            value={destForm.crCodigo}
            onChange={(v) => setDestForm({ ...destForm, crCodigo: v })}
            options={crs.filter((x) => x.activo !== false).map((x) => ({ value: x.crCodigo, label: `${x.crCodigo} - ${x.crNombre}` }))}
            placeholder="Opcional..."
          />
          <TextField label="Notas" value={destForm.notas} onChange={(v) => setDestForm({ ...destForm, notas: v })} placeholder="Opcional" />
        </div>
        <div><button className="btn" onClick={onAdd}>Agregar destino</button></div>
      </div>
    </div>
  );
}

export default function Catalogs() {
  // Listas completas (activos + inactivos) para mostrar en edición
  const [crs, setCrs] = useState([]);
  const [accts, setAccts] = useState([]);
  const [parts, setParts] = useState([]);
  const [clasifs, setClasifs] = useState([]);

  const [dests, setDests] = useState([]);
  const [destForm, setDestForm] = useState({ destino: "", monto: "", crCodigo: "", notas: "" });

  // Formulario agregar
  const [crCodigo, setCrCodigo] = useState("");
  const [crNombre, setCrNombre] = useState("");
  const [ctaCodigo, setCtaCodigo] = useState("");
  const [ctaNombre, setCtaNombre] = useState("");
  const [partCodigo, setPartCodigo] = useState("");
  const [partNombre, setPartNombre] = useState("");
  const [clasificacionCodigo, setClasificacionCodigo] = useState("");
  const [clasificacionNombre, setClasificacionNombre] = useState("");

  async function refresh() {
    // Cargamos todos (activos e inactivos) para que el toggle sea visible
    const db_module = await import("../db.js");
    const [allCR, allAccts, allParts, allClasifs, allDests] = await Promise.all([
      db_module.getDB().then((db) => db.getAll("catalog_cr")),
      db_module.getDB().then((db) => db.getAll("catalog_accounts")),
      db_module.getDB().then((db) => db.getAll("catalog_partidas")),
      db_module.getDB().then((db) => db.getAll("catalog_clasificaciones").catch(() => [])),
      db_module.getDB().then((db) => db.getAll("catalog_destinations").catch(() => [])),
    ]);
    setCrs(allCR.sort((a, b) => (a.crCodigo || "").localeCompare(b.crCodigo || "")));
    setAccts(allAccts.sort((a, b) => (a.ctaCodigo || "").localeCompare(b.ctaCodigo || "")));
    setParts(allParts.sort((a, b) => (a.partidaCodigo || "").localeCompare(b.partidaCodigo || "")));
    setClasifs(allClasifs.sort((a, b) => (a.clasificacionCodigo || "").localeCompare(b.clasificacionCodigo || "")));
    setDests(allDests.sort((a, b) => (a.destino || "").localeCompare(b.destino || "")));
  }

  useEffect(() => { refresh(); }, []);

  // Handlers de guardado para cada catálogo
  async function saveCR({ code, name, activo, _originalCode }) {
    await upsertCR({ crCodigo: code, crNombre: name, activo: activo !== false, _originalCode });
    await refresh();
  }
  async function saveAcct({ code, name, activo, _originalCode }) {
    await upsertAccount({ ctaCodigo: code, ctaNombre: name, activo: activo !== false, _originalCode });
    await refresh();
  }
  async function savePart({ code, name, activo, _originalCode }) {
    await upsertPartida({ partidaCodigo: code, partidaNombre: name, activo: activo !== false, _originalCode });
    await refresh();
  }
  async function saveClasif({ code, name, activo, _originalCode }) {
    await upsertClasificacion({ clasificacionCodigo: code, clasificacionNombre: name, activo: activo !== false, _originalCode });
    await refresh();
  }
  async function doDeleteCR(code) { await deleteCR(code); await refresh(); }
  async function doDeleteAcct(code) { await deleteAccount(code); await refresh(); }
  async function doDeletePart(code) { await deletePartida(code); await refresh(); }
  async function doDeleteClasif(code) { await deleteClasificacion(code); await refresh(); }

  // Agregar nuevos
  async function addCR() {
    if (!crCodigo.trim() || !crNombre.trim()) return;
    await upsertCR({ crCodigo: crCodigo.trim(), crNombre: crNombre.trim(), activo: true });
    setCrCodigo(""); setCrNombre("");
    await refresh();
  }
  async function addAcct() {
    if (!ctaCodigo.trim() || !ctaNombre.trim()) return;
    await upsertAccount({ ctaCodigo: ctaCodigo.trim(), ctaNombre: ctaNombre.trim(), activo: true });
    setCtaCodigo(""); setCtaNombre("");
    await refresh();
  }
  async function addPart() {
    if (!partCodigo.trim() || !partNombre.trim()) return;
    await upsertPartida({ partidaCodigo: partCodigo.trim(), partidaNombre: partNombre.trim(), activo: true });
    setPartCodigo(""); setPartNombre("");
    await refresh();
  }
  async function addClasif() {
    if (!clasificacionCodigo.trim() || !clasificacionNombre.trim()) return;
    await upsertClasificacion({ clasificacionCodigo: clasificacionCodigo.trim(), clasificacionNombre: clasificacionNombre.trim(), activo: true });
    setClasificacionCodigo(""); setClasificacionNombre("");
    await refresh();
  }

  async function saveDest(item) {
    await upsertDestination({
      destinationId: item.destinationId,
      destino: item.name,
      monto: Number(item.monto) || 0,
      crCodigo: item.crCodigo || "",
      notas: item.notas || "",
      activo: item.activo !== false,
    });
    await refresh();
  }

  async function addDest() {
    if (!destForm.destino.trim()) return;
    await upsertDestination({
      destino: destForm.destino.trim(),
      monto: Number(destForm.monto) || 0,
      crCodigo: destForm.crCodigo || "",
      notas: destForm.notas.trim(),
      activo: true,
    });
    setDestForm({ destino: "", monto: "", crCodigo: "", notas: "" });
    await refresh();
  }

  return (
    <div>
      <div className="row" style={{ marginBottom: 12 }}>
        <Link className="btn" to="/maestros/conceptos">Conceptos</Link>
      </div>

      <div className="grid2">
        <CatalogBlock
          title="Centros de Responsabilidad (CR)"
          rows={crs.map((x) => ({ code: x.crCodigo, name: x.crNombre, activo: x.activo }))}
          onSave={saveCR}
          onDelete={doDeleteCR}
          onAdd={
            <div className="row">
              <TextField label="Código" value={crCodigo} onChange={setCrCodigo} />
              <TextField label="Nombre" value={crNombre} onChange={setCrNombre} />
              <button className="btn" style={{ alignSelf: "end" }} onClick={addCR}>Agregar</button>
            </div>
          }
        />

        <CatalogBlock
          title="Cuentas Contables"
          rows={accts.map((x) => ({ code: x.ctaCodigo, name: x.ctaNombre, activo: x.activo }))}
          onSave={saveAcct}
          onDelete={doDeleteAcct}
          onAdd={
            <div className="row">
              <TextField label="Código" value={ctaCodigo} onChange={setCtaCodigo} />
              <TextField label="Nombre" value={ctaNombre} onChange={setCtaNombre} />
              <button className="btn" style={{ alignSelf: "end" }} onClick={addAcct}>Agregar</button>
            </div>
          }
        />

        <CatalogBlock
          title="Partidas"
          rows={parts.map((x) => ({ code: x.partidaCodigo, name: x.partidaNombre, activo: x.activo }))}
          onSave={savePart}
          onDelete={doDeletePart}
          onAdd={
            <div className="row">
              <TextField label="Código" value={partCodigo} onChange={setPartCodigo} />
              <TextField label="Nombre" value={partNombre} onChange={setPartNombre} />
              <button className="btn" style={{ alignSelf: "end" }} onClick={addPart}>Agregar</button>
            </div>
          }
        />

        <CatalogBlock
          title="Clasificaciones"
          rows={clasifs.map((x) => ({ code: x.clasificacionCodigo, name: x.clasificacionNombre, activo: x.activo }))}
          onSave={saveClasif}
          onDelete={doDeleteClasif}
          onAdd={
            <div className="row">
              <TextField label="Código" value={clasificacionCodigo} onChange={setClasificacionCodigo} />
              <TextField label="Nombre" value={clasificacionNombre} onChange={setClasificacionNombre} />
              <button className="btn" style={{ alignSelf: "end" }} onClick={addClasif}>Agregar</button>
            </div>
          }
        />
        {/* Destinos favoritos — bloque con edición inline completa */}
        <DestsBlock
          dests={dests}
          crs={crs}
          onRefresh={refresh}
          destForm={destForm}
          setDestForm={setDestForm}
          onAdd={addDest}
        />
      </div>
    </div>
  );
}
