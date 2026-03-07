import React, { useEffect, useState } from "react";
import {
  getSettings, saveSettings, listActiveCR, getSyncState, saveSyncState,
  listActiveCR as listCR, listActiveAccounts, listActivePartidas,
  listActiveClasificaciones, listActiveDestinations,
  upsertCR, deleteCR, upsertAccount, deleteAccount,
  upsertPartida, deletePartida, upsertClasificacion, deleteClasificacion,
  upsertDestination, deleteDestination,
  listAllConcepts, upsertConcept, deactivateConcept, activateConcept,
  listActiveAccounts as listAccts, listActivePartidas as listParts,
  listActiveClasificaciones as listClasifs,
  countExpensesByConceptId,
} from "../db.js";
import TextField from "../components/TextField.jsx";
import SelectField from "../components/SelectField.jsx";
import { startOneDriveLogin, disconnectOneDrive } from "../services/onedriveAuth.js";
import { syncOnce } from "../services/syncEngine.js";
import { putFileByPath } from "../services/onedriveApi.js";
import { generateEncryptedBackupBlob, restoreFromEncryptedBackupFile } from "../services/backupEngine.js";
import { v4 as uuid } from "uuid";

const TABS = [
  { id: "Perfil",  icon: "👤", label: "Perfil" },
  { id: "App",     icon: "⚙️", label: "App" },
  { id: "Datos",   icon: "💾", label: "Datos" },
];

const TIPO_CUENTA_OPTIONS = [
  { value: "", label: "Seleccione..." },
  { value: "Cuenta Corriente", label: "Cuenta Corriente" },
  { value: "Cuenta Vista", label: "Cuenta Vista" },
  { value: "Cuenta RUT", label: "Cuenta RUT" },
  { value: "Cuenta de Ahorro", label: "Cuenta de Ahorro" },
];

function formatProgress(p) {
  if (p == null) return "";
  if (typeof p === "string") return p;
  try {
    if (typeof p === "object") {
      if (p.text) return String(p.text);
      const phase = p.phase || p.kind || "progress";
      if (phase === "clear_store") return `Vaciando ${p.store || "store"}...`;
      if (phase === "clear_stores") return `Vaciando base local...`;
      if (phase === "insert_store") return `Restaurando ${p.store || "store"}...`;
      if (phase === "insert_progress") return `Insertando ${p.store}: ${p.i}/${p.total}`;
      if (phase === "insert_begin") return `Iniciando restauración...`;
      if (phase === "decrypt") return "Descifrando...";
      if (phase === "unzip") return "Abriendo ZIP...";
      if (phase === "hydrate") return "Preparando boletas...";
      if (phase === "parse") return "Procesando datos...";
      if (phase === "open_db") return "Abriendo base local...";
      if (phase === "zip_build") return "Construyendo ZIP...";
      if (phase === "encrypt") return "Cifrando...";
      if (phase === "done") return "Listo.";
      return `Restaurando… (${phase})`;
    }
    return String(p);
  } catch (e) { return String(p); }
}


// ── Accordion desplegable ────────────────────────────────────────────────────
function Accordion({ title, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginBottom: 4 }}>
      <button onClick={() => setOpen(!open)} style={{
        width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "10px 14px", background: "rgba(255,255,255,.06)",
        border: "1px solid rgba(255,255,255,.12)", borderRadius: open ? "10px 10px 0 0" : 10,
        color: "#e5e7eb", fontWeight: 700, fontSize: 14, cursor: "pointer",
      }}>
        <span>{title}</span>
        <span style={{ fontSize: 12, opacity: 0.7, transition: "transform .2s", display: "inline-block", transform: open ? "rotate(180deg)" : "rotate(0deg)" }}>▼</span>
      </button>
      {open && (
        <div style={{ border: "1px solid rgba(255,255,255,.12)", borderTop: "none", borderRadius: "0 0 10px 10px", padding: "14px" }}>
          {children}
        </div>
      )}
    </div>
  );
}

function MsgBox({ msg }) {
  if (!msg) return null;
  return (
    <div className="small" style={{ padding: 10, border: "1px solid rgba(255,255,255,.12)", borderRadius: 12, marginTop: 10, whiteSpace: "pre-line" }}>
      {msg}
    </div>
  );
}

function SaveBtn({ busy, onClick, label = "Guardar" }) {
  return (
    <div className="row row-form" style={{ marginTop: 16 }}>
      <button className="btn" disabled={busy} onClick={onClick}>{busy ? "Guardando..." : label}</button>
    </div>
  );
}

// ── Componente reutilizable para catálogos código+nombre ─────────────────────
function CatalogSection({ title, rows, onSave, onDelete, codeLabel = "Código", nameLabel = "Nombre" }) {
  const [editing, setEditing] = useState(null);
  const [menuOpen, setMenuOpen] = useState(null); // code del item con menú abierto
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [err, setErr] = useState("");

  async function saveEdit(r) {
    await onSave({ ...r, code: editing.code.trim(), name: editing.name.trim(), _originalCode: editing.originalCode });
    setEditing(null);
  }

  async function handleDelete(r) {
    setErr(""); setMenuOpen(null);
    if (!confirm(`¿Eliminar "${r.name}" (${r.code})?`)) return;
    try { await onDelete(r.code); } catch (e) { setErr(e?.message || "No se puede eliminar."); }
  }

  async function handleAdd() {
    if (!newCode.trim() || !newName.trim()) return;
    await onSave({ code: newCode.trim(), name: newName.trim(), activo: true });
    setNewCode(""); setNewName("");
  }

  return (
    <div style={{ marginBottom: 20 }}>
      {title && <div style={{ fontWeight: 800, marginBottom: 8 }}>{title}</div>}
      {err && <div className="small" style={{ color: "#f87171", marginBottom: 6 }}>{err}</div>}

      {rows.length === 0 ? (
        <div className="small" style={{ opacity: 0.5, marginBottom: 8 }}>Sin registros.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
          {rows.map((r) => (
            <div key={r.code} style={{ opacity: r.activo === false ? 0.5 : 1 }}>
              {editing?.originalCode === r.code ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "10px", background: "rgba(255,255,255,.05)", borderRadius: 10 }}>
                  <div className="row row-form" style={{ gap: 8 }}>
                    <TextField label={codeLabel} value={editing.code} onChange={(v) => setEditing({ ...editing, code: v })} />
                    <TextField label={nameLabel} value={editing.name} onChange={(v) => setEditing({ ...editing, name: v })} />
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn" onClick={() => saveEdit(r)}>Guardar</button>
                    <button className="btn secondary" onClick={() => setEditing(null)}>Cancelar</button>
                  </div>
                </div>
              ) : (
                <div style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "8px 4px", borderBottom: "1px solid rgba(255,255,255,.07)", position: "relative",
                }}>
                  <div style={{ flex: 1 }}>
                    <b>{r.code}</b>
                    <span className="small" style={{ marginLeft: 6 }}>{r.name}</span>
                    {r.activo === false && <span className="small" style={{ opacity: 0.5, marginLeft: 4 }}>· inactivo</span>}
                  </div>
                  {/* Botón ⋯ */}
                  <div style={{ position: "relative" }}>
                    <button
                      onClick={() => setMenuOpen(menuOpen === r.code ? null : r.code)}
                      style={{
                        background: "transparent", border: "1px solid rgba(255,255,255,.15)",
                        borderRadius: 8, color: "#e5e7eb", fontSize: 18, padding: "2px 10px",
                        cursor: "pointer", lineHeight: 1,
                      }}
                    >⋯</button>
                    {menuOpen === r.code && (
                      <div style={{
                        position: "absolute", right: 0, top: "110%", zIndex: 100,
                        background: "#0f172a", border: "1px solid rgba(255,255,255,.15)",
                        borderRadius: 12, padding: 6, minWidth: 150,
                        boxShadow: "0 8px 24px rgba(0,0,0,.6)",
                        display: "flex", flexDirection: "column", gap: 4,
                      }}>
                        <button className="btn secondary" style={{ textAlign: "left", fontSize: 13 }}
                          onClick={() => { setEditing({ code: r.code, name: r.name, originalCode: r.code }); setMenuOpen(null); }}>
                          ✏️ Editar
                        </button>
                        <button className="btn secondary" style={{ textAlign: "left", fontSize: 13 }}
                          onClick={() => { onSave({ ...r, activo: r.activo === false ? true : false }); setMenuOpen(null); }}>
                          {r.activo === false ? "✅ Activar" : "⏸ Desactivar"}
                        </button>
                        <button className="btn danger" style={{ textAlign: "left", fontSize: 13 }}
                          onClick={() => handleDelete(r)}>
                          🗑 Eliminar
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Agregar nuevo */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
        <div className="row row-form" style={{ gap: 8 }}>
          <TextField label={`Nuevo — ${codeLabel}`} value={newCode} onChange={setNewCode} />
          <TextField label={nameLabel} value={newName} onChange={setNewName} />
        </div>
        <button className="btn" style={{ alignSelf: "flex-start" }} onClick={handleAdd}>+ Agregar</button>
      </div>
    </div>
  );
}

// ── Tab App ──────────────────────────────────────────────────────────────────
function TabApp() {
  const [crs, setCrs] = useState([]);
  const [accts, setAccts] = useState([]);
  const [parts, setParts] = useState([]);
  const [clasifs, setClasifs] = useState([]);
  const [dests, setDests] = useState([]);
  const [destFilter, setDestFilter] = useState("activos"); // "activos" | "inactivos" | "todos"
  const [concepts, setConcepts] = useState([]);
  const [acctsFull, setAcctsFull] = useState([]);
  const [partsFull, setPartsFull] = useState([]);
  const [clasifsFull, setClasifsFull] = useState([]);
  const [usage, setUsage] = useState({});
  const [conceptForm, setConceptForm] = useState(null); // null = lista, obj = editando
  const [destForm, setDestForm] = useState({ destino: "", monto: "", crCodigo: "", notas: "" });
  const [msg, setMsg] = useState("");
  const [section, setSection] = useState("catalogos"); // catalogos | conceptos | destinos

  async function refresh() {
    const db = await import("../db.js");
    const dbInst = await db.getDB();
    const [allCR, allAccts, allParts, allClasifs, allDests, allConcepts] = await Promise.all([
      dbInst.getAll("catalog_cr"),
      dbInst.getAll("catalog_accounts"),
      dbInst.getAll("catalog_partidas"),
      dbInst.getAll("catalog_clasificaciones").catch(() => []),
      dbInst.getAll("catalog_destinations").catch(() => []),
      listAllConcepts(),
    ]);
    setCrs(allCR.sort((a, b) => (a.crCodigo || "").localeCompare(b.crCodigo || "")));
    setAccts(allAccts.sort((a, b) => (a.ctaCodigo || "").localeCompare(b.ctaCodigo || "")));
    setParts(allParts.sort((a, b) => (a.partidaCodigo || "").localeCompare(b.partidaCodigo || "")));
    setClasifs(allClasifs.sort((a, b) => (a.clasificacionCodigo || "").localeCompare(b.clasificacionCodigo || "")));
    setDests(allDests.sort((a, b) => (a.destino || "").localeCompare(b.destino || "")));
    setConcepts(allConcepts);
    setAcctsFull(allAccts.filter((x) => x.activo !== false));
    setPartsFull(allParts.filter((x) => x.activo !== false));
    setClasifsFull(allClasifs.filter((x) => x.activo !== false));
    const pairs = await Promise.all(allConcepts.map(async (c) => [c.conceptId, await countExpensesByConceptId(c.conceptId)]));
    setUsage(Object.fromEntries(pairs));
  }

  useEffect(() => { refresh(); }, []);

  const SECTIONS = [
    { id: "catalogos", label: "Catálogos" },
    { id: "conceptos", label: "Conceptos" },
    { id: "destinos", label: "Destinos" },
    { id: "general", label: "General" },
  ];

  return (
    <div className="card">
      <h2>App</h2>

      {/* Sub-nav */}
      <div className="row row-form" style={{ gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
        {SECTIONS.map((sec) => (
          <button key={sec.id} className="btn secondary" onClick={() => setSection(sec.id)} style={{
            background: section === sec.id ? "rgba(255,255,255,.15)" : "rgba(255,255,255,.04)",
            border: section === sec.id ? "1px solid rgba(255,255,255,.35)" : "1px solid rgba(255,255,255,.12)",
            color: section === sec.id ? "#fff" : "rgba(255,255,255,.7)",
            fontWeight: section === sec.id ? 700 : 500,
            fontSize: 13,
          }}>
            {sec.label}
          </button>
        ))}
      </div>

      <MsgBox msg={msg} />

      {/* Catálogos */}
      {section === "catalogos" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <Accordion title="Centros de Responsabilidad">
            <CatalogSection
              title=""
              rows={crs.map((x) => ({ code: x.crCodigo, name: x.crNombre, activo: x.activo }))}
              onSave={async ({ code, name, activo, _originalCode }) => { await upsertCR({ crCodigo: code, crNombre: name, activo: activo !== false, _originalCode }); await refresh(); }}
              onDelete={async (code) => { await deleteCR(code); await refresh(); }}
            />
          </Accordion>
          <Accordion title="Cuentas Contables">
            <CatalogSection
              title=""
              rows={accts.map((x) => ({ code: x.ctaCodigo, name: x.ctaNombre, activo: x.activo }))}
              onSave={async ({ code, name, activo, _originalCode }) => { await upsertAccount({ ctaCodigo: code, ctaNombre: name, activo: activo !== false, _originalCode }); await refresh(); }}
              onDelete={async (code) => { await deleteAccount(code); await refresh(); }}
            />
          </Accordion>
          <Accordion title="Partidas">
            <CatalogSection
              title=""
              rows={parts.map((x) => ({ code: x.partidaCodigo, name: x.partidaNombre, activo: x.activo }))}
              onSave={async ({ code, name, activo, _originalCode }) => { await upsertPartida({ partidaCodigo: code, partidaNombre: name, activo: activo !== false, _originalCode }); await refresh(); }}
              onDelete={async (code) => { await deletePartida(code); await refresh(); }}
            />
          </Accordion>
          <Accordion title="Clasificaciones">
            <CatalogSection
              title=""
              rows={clasifs.map((x) => ({ code: x.clasificacionCodigo, name: x.clasificacionNombre, activo: x.activo }))}
              onSave={async ({ code, name, activo, _originalCode }) => { await upsertClasificacion({ clasificacionCodigo: code, clasificacionNombre: name, activo: activo !== false, _originalCode }); await refresh(); }}
              onDelete={async (code) => { await deleteClasificacion(code); await refresh(); }}
            />
          </Accordion>
        </div>
      )}

      {/* Conceptos */}
      {section === "conceptos" && (
        <div>
          {conceptForm === null ? (
            <div>
              <div className="row row-form" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div className="small" style={{ opacity: 0.7 }}>Define cuenta y partida por defecto para agilizar el ingreso de gastos.</div>
                <button className="btn" onClick={() => setConceptForm({ conceptId: "", nombre: "", ctaDefaultCodigo: "", partidaDefaultCodigo: "", clasificacionDefaultCodigo: "", requiereDoc: true, requiereRespaldo: true, favorito: false })}>
                  + Nuevo
                </button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {concepts.map((c) => {
                  const usedCount = usage[c.conceptId] || 0;
                  return (
                    <div key={c.conceptId} style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      borderTop: "1px solid rgba(255,255,255,.08)", paddingTop: 8,
                      opacity: c.activo === false ? 0.5 : 1,
                    }}>
                      <div>
                        <div style={{ fontWeight: 800 }}>{c.nombre} {c.favorito ? "⭐" : ""}{c.activo === false ? " · inactivo" : ""}</div>
                        <div className="small">CTA {c.ctaDefaultCodigo || "—"} · Part {c.partidaDefaultCodigo || "—"}</div>
                        <div className="small">Doc: {c.requiereDoc ? "sí" : "no"} · Respaldo: {c.requiereRespaldo ? "sí" : "no"}{usedCount > 0 ? ` · ${usedCount} uso(s)` : ""}</div>
                      </div>
                      <div className="row row-form" style={{ gap: 4 }}>
                        <button className="btn secondary" onClick={() => setConceptForm({ ...c })}>Editar</button>
                        <button className="btn secondary" onClick={async () => { await upsertConcept({ ...c, favorito: !c.favorito }); await refresh(); }}>
                          {c.favorito ? "✩" : "⭐"}
                        </button>
                        {c.activo === false
                          ? <button className="btn" onClick={async () => { await activateConcept(c.conceptId); await refresh(); }}>Activar</button>
                          : <button className="btn danger" disabled={usedCount > 0} onClick={async () => { if (confirm("¿Desactivar?")) { await deactivateConcept(c.conceptId); await refresh(); } }}>Desactivar</button>
                        }
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div>
              <div style={{ fontWeight: 800, marginBottom: 12 }}>{conceptForm.conceptId ? "Editar concepto" : "Nuevo concepto"}</div>
              <div className="row row-form">
                <TextField label="Nombre" value={conceptForm.nombre} onChange={(v) => setConceptForm({ ...conceptForm, nombre: v })} placeholder="Ej: Combustible" />
              </div>
              <div className="row row-form" style={{ marginTop: 12 }}>
                <SelectField label="Cuenta por defecto" value={conceptForm.ctaDefaultCodigo} onChange={(v) => setConceptForm({ ...conceptForm, ctaDefaultCodigo: v })}
                  options={acctsFull.map((x) => ({ value: x.ctaCodigo, label: `${x.ctaCodigo} - ${x.ctaNombre}` }))} placeholder="Seleccione..." />
                <SelectField label="Partida por defecto" value={conceptForm.partidaDefaultCodigo} onChange={(v) => setConceptForm({ ...conceptForm, partidaDefaultCodigo: v })}
                  options={partsFull.map((x) => ({ value: x.partidaCodigo, label: `${x.partidaCodigo} - ${x.partidaNombre}` }))} placeholder="Seleccione..." />
              </div>
              <div className="row row-form" style={{ marginTop: 12 }}>
                <SelectField label="Clasificación por defecto" value={conceptForm.clasificacionDefaultCodigo || ""} onChange={(v) => setConceptForm({ ...conceptForm, clasificacionDefaultCodigo: v })}
                  options={clasifsFull.map((x) => ({ value: x.clasificacionCodigo, label: `${x.clasificacionCodigo} - ${x.clasificacionNombre}` }))} placeholder="Sin clasificación..." />
              </div>
              <div className="row row-form" style={{ marginTop: 12, gap: 16 }}>
                <label style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                  <input type="checkbox" checked={!!conceptForm.requiereDoc} onChange={(e) => setConceptForm({ ...conceptForm, requiereDoc: e.target.checked })} />
                  <span className="small">Requiere documento</span>
                </label>
                <label style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                  <input type="checkbox" checked={!!conceptForm.requiereRespaldo} onChange={(e) => setConceptForm({ ...conceptForm, requiereRespaldo: e.target.checked })} />
                  <span className="small">Requiere respaldo (foto)</span>
                </label>
                <label style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                  <input type="checkbox" checked={!!conceptForm.favorito} onChange={(e) => setConceptForm({ ...conceptForm, favorito: e.target.checked })} />
                  <span className="small">Favorito ⭐</span>
                </label>
              </div>
              <div className="row row-form" style={{ marginTop: 14 }}>
                <button className="btn" onClick={async () => {
                  setMsg("");
                  if (!conceptForm.nombre.trim()) return setMsg("Ingresa el nombre.");
                  if (!conceptForm.ctaDefaultCodigo) return setMsg("Selecciona la cuenta.");
                  if (!conceptForm.partidaDefaultCodigo) return setMsg("Selecciona la partida.");
                  await upsertConcept({ ...conceptForm, conceptId: conceptForm.conceptId || uuid(), activo: true });
                  setConceptForm(null);
                  await refresh();
                }}>Guardar</button>
                <button className="btn secondary" onClick={() => setConceptForm(null)}>Cancelar</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Destinos favoritos */}
      {section === "destinos" && (
        <div>
          <div className="small" style={{ opacity: 0.7, marginBottom: 12 }}>Destinos con monto fijo para traslados. Se pre-completan al registrar un trayecto.</div>
          {/* Filtro */}
          <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
            {[["activos","Activos"],["inactivos","Inactivos"],["todos","Todos"]].map(([v,l]) => (
              <button key={v} onClick={() => setDestFilter(v)} style={{
                padding: "5px 12px", borderRadius: 8, fontSize: 12, cursor: "pointer",
                background: destFilter === v ? "rgba(255,255,255,.2)" : "rgba(255,255,255,.05)",
                border: destFilter === v ? "1px solid rgba(255,255,255,.4)" : "1px solid rgba(255,255,255,.12)",
                color: destFilter === v ? "#fff" : "rgba(255,255,255,.6)", fontWeight: destFilter === v ? 700 : 400,
              }}>{l}</button>
            ))}
          </div>
          {dests.filter(d => destFilter === "todos" ? true : destFilter === "activos" ? d.activo !== false : d.activo === false).length === 0 ? (
            <div className="small" style={{ opacity: 0.5, marginBottom: 12 }}>Sin destinos en esta categoría.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
              {dests.filter(d => destFilter === "todos" ? true : destFilter === "activos" ? d.activo !== false : d.activo === false).map((d) => (
                <div key={d.destinationId} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  borderTop: "1px solid rgba(255,255,255,.08)", paddingTop: 8,
                  opacity: d.activo === false ? 0.5 : 1,
                }}>
                  <div>
                    <b>{d.destino}</b>
                    <span className="small"> · ${Number(d.monto || 0).toLocaleString("es-CL")}</span>
                    {d.crCodigo && <span className="small"> · CR {d.crCodigo}</span>}
                    {d.notas && <div className="small" style={{ opacity: 0.6 }}>{d.notas}</div>}
                  </div>
                  <div className="row row-form" style={{ gap: 4 }}>
                    <button className="btn secondary" onClick={async () => { await upsertDestination({ ...d, activo: d.activo === false ? true : false }); await refresh(); }}>
                      {d.activo === false ? "Activar" : "Desactivar"}
                    </button>
                    <button className="btn danger" onClick={async () => {
                      if (!confirm(`¿Eliminar "${d.destino}"?`)) return;
                      await deleteDestination(d.destinationId); await refresh();
                    }}>Eliminar</button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <hr />
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Agregar destino</div>
          <div className="row row-form">
            <TextField label="Destino" value={destForm.destino} onChange={(v) => setDestForm({ ...destForm, destino: v })} placeholder="Ej: Aeropuerto" />
            <TextField label="Monto ($)" type="number" value={destForm.monto} onChange={(v) => setDestForm({ ...destForm, monto: v })} />
          </div>
          <div className="row row-form" style={{ marginTop: 8 }}>
            <SelectField label="CR" value={destForm.crCodigo} onChange={(v) => setDestForm({ ...destForm, crCodigo: v })}
              options={[{ value: "", label: "Opcional..." }, ...crs.filter((x) => x.activo !== false).map((x) => ({ value: x.crCodigo, label: `${x.crCodigo} - ${x.crNombre}` }))]}
            />
            <TextField label="Notas" value={destForm.notas} onChange={(v) => setDestForm({ ...destForm, notas: v })} placeholder="Opcional" />
          </div>
          <div className="row row-form" style={{ marginTop: 10 }}>
            <button className="btn" onClick={async () => {
              if (!destForm.destino.trim()) return;
              await upsertDestination({ destino: destForm.destino.trim(), monto: Number(destForm.monto) || 0, crCodigo: destForm.crCodigo || "", notas: destForm.notas.trim(), activo: true });
              setDestForm({ destino: "", monto: "", crCodigo: "", notas: "" });
              await refresh();
            }}>Agregar destino</button>
          </div>
        </div>
      )}

      {/* General */}
      {section === "general" && <TabGeneral />}
    </div>
  );
}

// ── Tab General (dentro de App) ──────────────────────────────────────────────
const APP_VERSION = "0.12.33";

function TabGeneral() {
  const [s, setS] = useState(null);
  const [msg, setMsg] = useState("");

  useEffect(() => { getSettings().then(setS); }, []);
  if (!s) return <div className="small">Cargando…</div>;

  return (
    <div>
      <h3 style={{ marginTop: 0 }}>Correlativo de rendiciones</h3>
      <div className="small" style={{ marginBottom: 10, opacity: 0.7 }}>Número asignado automáticamente al crear cada rendición.</div>
      <div className="row row-form">
        <TextField label="Prefijo" value={s.correlativoPrefix || ""} onChange={(v) => setS({ ...s, correlativoPrefix: v })} placeholder="Ej: RC" />
        <TextField label="Siguiente N°" type="number" value={s.correlativoNextNumber || 1} onChange={(v) => setS({ ...s, correlativoNextNumber: Number(v) })} />
      </div>
      <div className="small" style={{ marginTop: 8, opacity: 0.6 }}>
        Formato: <b>{s.correlativoPrefix || "RC"}-{new Date().getFullYear()}-{String(s.correlativoNextNumber || 1).padStart(4, "0")}</b>
      </div>
      <hr />
      <h3>Dispositivo</h3>
      <div className="row row-form">
        <TextField label="Nombre del dispositivo" value={s.deviceLabel || ""} onChange={(v) => setS({ ...s, deviceLabel: v })} placeholder="Ej: iPhone Rodolfo" />
      </div>
      <div className="small" style={{ marginTop: 8, opacity: 0.6 }}>
        <div>Device ID: {(s.deviceId || "").slice(0, 8)}…</div>
        <div>Revisión local: {typeof s.localRevision === "number" ? s.localRevision : 0}</div>
      </div>
      <MsgBox msg={msg} />
      <SaveBtn onClick={async () => { await saveSettings(s); setMsg("✅ Guardado."); }} />
      <hr />
      <div style={{ opacity: 0.45, fontSize: 12, marginTop: 8 }}>
        Versión {APP_VERSION}
      </div>
    </div>
  );
}

// ── Componente principal ─────────────────────────────────────────────────────
export default function Settings() {
  const [tab, setTab] = useState("Perfil");
  const [s, setS] = useState(null);
  const [crs, setCrs] = useState([]);
  const [sync, setSync] = useState(null);
  const [msgPerfil, setMsgPerfil] = useState("");
  const [syncMsg, setSyncMsg] = useState("");
  const [backupMsg, setBackupMsg] = useState("");
  const [restoreMsg, setRestoreMsg] = useState("");
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupPass, setBackupPass] = useState("");
  const [restorePass, setRestorePass] = useState("");
  const [restoreFile, setRestoreFile] = useState(null);

  useEffect(() => {
    (async () => {
      setS(await getSettings());
      setCrs(await listActiveCR());
      setSync(await getSyncState());
    })();
  }, []);

  async function saveOneDriveConfig(patch) {
    const cur = await getSyncState();
    const next = await saveSyncState({ auth: { ...(cur?.auth || {}), ...patch } });
    setSync(next);
  }

  async function connectOneDrive(preferredMode) {
    setSyncMsg("");
    const tenantId = sync?.auth?.tenantId || "organizations";
    const clientId = sync?.auth?.clientId || "";
    if (!clientId) { setSyncMsg("⚠️ Ingresa el Client ID antes de conectar."); return; }
    const redirectUri = window.location.origin + window.location.pathname;
    await saveOneDriveConfig({ tenantId, clientId, mode: preferredMode, redirectUri });
    await startOneDriveLogin({ tenantId, clientId, mode: preferredMode, redirectUri });
  }

  async function doSyncNow() {
    setSyncMsg("Sincronizando…");
    const r = await syncOnce();
    if (r.ok) { setSyncMsg(`✅ Sync OK. Eventos: ${r.uploadedEvents}, Boletas: ${r.uploadedReceipts}`); setS(await getSettings()); }
    else setSyncMsg(`❌ Sync falló: ${r.step || "?"}. ${r.error || ""}`);
  }

  async function doGenerateBackup({ uploadToOneDrive }) {
    setBackupMsg(""); setBackupBusy(true);
    try {
      const { blob, storeCounts } = await generateEncryptedBackupBlob(backupPass);
      const fileName = `backup_full_${new Date().toISOString().replace(/[:.]/g, "-")}.cczip`;
      const counts = `Gastos: ${storeCounts.expenses ?? 0}, Rendiciones: ${storeCounts.reimbursements ?? 0}, Boletas: ${storeCounts.attachments ?? 0}`;
      if (uploadToOneDrive) {
        const st = await getSyncState();
        if (!st?.rootMode || !st?.driveId || !st?.rootFolderItemId) { setBackupMsg("⚠️ OneDrive no conectado. Ve a la pestaña Datos → Sync."); return; }
        const r = await putFileByPath({ path: `exports/${fileName}`, contentType: "application/octet-stream", data: blob });
        if (!r.ok) { setBackupMsg(`❌ Error subiendo: ${r.error || "put_failed"}`); return; }
        await saveSettings({ lastBackupAt: new Date().toISOString(), lastBackupName: fileName });
        setS(await getSettings());
        setBackupMsg(`✅ Backup subido a OneDrive\n${counts}`);
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = url; a.download = fileName;
        document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
        await saveSettings({ lastBackupAt: new Date().toISOString(), lastBackupName: fileName });
        setS(await getSettings());
        setBackupMsg(`✅ Backup descargado: ${fileName}\n${counts}`);
      }
    } catch (e) {
      const code = e?.code || e?.message || "error";
      if (code === "empty_backup") setBackupMsg("⚠️ Sin datos para respaldar.");
      else if (code === "passphrase_too_short") setBackupMsg("⚠️ Contraseña mínimo 6 caracteres.");
      else setBackupMsg(`❌ Error: ${code}`);
    } finally { setBackupBusy(false); }
  }

  async function doRestoreBackup() {
    setRestoreMsg(""); setBackupBusy(true);
    try {
      if (!restoreFile) { setRestoreMsg("⚠️ Selecciona un archivo .cczip."); return; }
      if (!restorePass || restorePass.length < 6) { setRestoreMsg("⚠️ Contraseña mínimo 6 caracteres."); return; }
      setRestoreMsg("⏳ Restaurando… no cierres esta pestaña.");
      const r = await restoreFromEncryptedBackupFile(restoreFile, restorePass, { timeoutMs: 60000, onProgress: (p) => setRestoreMsg(formatProgress(p)) });
      if (!r?.ok) { setRestoreMsg("❌ Restauración fallida."); return; }
      const c = r.insertedCounts || r.storeCounts || {};
      setRestoreMsg(`✅ OK. Gastos: ${c.expenses ?? 0}, Rendiciones: ${c.reimbursements ?? 0}, Boletas: ${c.attachments ?? 0}. Reiniciando…`);
      setTimeout(() => window.location.reload(), 400);
    } catch (e) {
      const code = e?.code || e?.message || "error";
      if (String(code).includes("bad_backup")) setRestoreMsg("❌ Archivo inválido o corrupto.");
      else if (String(code).includes("timeout")) setRestoreMsg("❌ Tiempo agotado. Intenta de nuevo.");
      else setRestoreMsg(`❌ Error: ${code}`);
    } finally { setBackupBusy(false); }
  }

  if (!s) return <div className="card">Cargando…</div>;

  return (
    <div>
      {/* Tab bar — íconos horizontales */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 6 }}>
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              flex: 1,
              display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
              padding: "8px 4px",
              background: tab === t.id ? "rgba(255,255,255,.18)" : "rgba(255,255,255,.05)",
              border: tab === t.id ? "1px solid rgba(255,255,255,.5)" : "1px solid rgba(255,255,255,.18)",
              borderRadius: 10,
              color: tab === t.id ? "#fff" : "rgba(255,255,255,.65)",
              fontWeight: tab === t.id ? 700 : 500,
              fontSize: 11,
              cursor: "pointer",
              lineHeight: 1.2,
            }}>
              <span style={{ fontSize: 20 }}>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── PERFIL ── */}
      {tab === "Perfil" && (
        <div className="card">
          <Accordion title="Datos Personales" defaultOpen={true}>
            <div className="row row-form">
              <TextField label="Nombre" value={s.responsableNombre || ""} onChange={(v) => setS({ ...s, responsableNombre: v })} placeholder="Nombre completo" />
              <TextField label="RUT" value={s.responsableRut || ""} onChange={(v) => {
                const raw = v.replace(/[^0-9kK]/g, "").toUpperCase();
                let fmt = raw;
                if (raw.length > 1) {
                  const dv = raw.slice(-1);
                  const num = raw.slice(0, -1);
                  const parts = [];
                  let rest = num;
                  while (rest.length > 3) { parts.unshift(rest.slice(-3)); rest = rest.slice(0, -3); }
                  if (rest) parts.unshift(rest);
                  fmt = parts.join(".") + "-" + dv;
                }
                setS({ ...s, responsableRut: fmt });
              }} placeholder="12.345.678-9" />
            </div>
            <div className="row row-form" style={{ marginTop: 12 }}>
              <TextField label="Cargo" value={s.cargo || ""} onChange={(v) => setS({ ...s, cargo: v })} />
              <TextField label="Empresa" value={s.empresa || ""} onChange={(v) => setS({ ...s, empresa: v })} />
            </div>
            <div className="row row-form" style={{ marginTop: 12 }}>
              <TextField label="Tel / Cel" value={s.telefono || ""} onChange={(v) => setS({ ...s, telefono: v })} placeholder="+56 9 1234 5678" />
              <SelectField label="CR por defecto" value={s.crDefaultCodigo || ""} onChange={(v) => setS({ ...s, crDefaultCodigo: v })}
                options={crs.map((x) => ({ value: x.crCodigo, label: `${x.crCodigo} - ${x.crNombre}` }))} placeholder="Seleccione..." />
            </div>
          </Accordion>
          <Accordion title="Datos Bancarios" defaultOpen={false}>
            <div className="small" style={{ marginBottom: 10, opacity: 0.7 }}>Se incluyen en el formulario de rendición para el pago.</div>
            <div className="row row-form">
              <TextField label="Banco" value={s.banco || ""} onChange={(v) => setS({ ...s, banco: v })} placeholder="Ej: Banco Estado" />
              <SelectField label="Tipo de cuenta" value={s.tipoCuenta || ""} onChange={(v) => setS({ ...s, tipoCuenta: v })} options={TIPO_CUENTA_OPTIONS} />
            </div>
            <div className="row row-form" style={{ marginTop: 12 }}>
              <TextField label="N° de cuenta" value={s.numeroCuenta || ""} onChange={(v) => setS({ ...s, numeroCuenta: v })} />
            </div>
          </Accordion>
          <MsgBox msg={msgPerfil} />
          <SaveBtn onClick={async () => { await saveSettings(s); setMsgPerfil("✅ Guardado."); }} />
        </div>
      )}

      {/* ── APP ── */}
      {tab === "App" && <TabApp />}

      {/* ── DATOS ── */}
      {tab === "Datos" && (
        <div className="card">

          {/* Estado backup */}
          {s.lastBackupAt && (
            <div style={{ background: "rgba(34,197,94,.08)", border: "1px solid rgba(34,197,94,.2)", borderRadius: 12, padding: "8px 12px", marginBottom: 12 }}>
              <div className="small">✅ Último backup: <b>{new Date(s.lastBackupAt).toLocaleString("es-CL")}</b>
                {s.lastBackupName && <div style={{ opacity: 0.7, marginTop: 2 }}>{s.lastBackupName}</div>}
              </div>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <Accordion title="Backup" defaultOpen={false}>
          <div className="small" style={{ marginBottom: 10, opacity: 0.7 }}>Genera un archivo <b>.cczip</b> cifrado con todos tus datos y boletas.</div>
          <div className="row row-form">
            <TextField label="Contraseña (mín. 6 caracteres)" value={backupPass} onChange={setBackupPass} type="password" />
          </div>
          <div className="row row-form" style={{ marginTop: 12, gap: 10 }}>
            <button className="btn" disabled={backupBusy} onClick={() => doGenerateBackup({ uploadToOneDrive: false })}>
              {backupBusy ? "Generando..." : "Descargar .cczip"}
            </button>
            <button className="btn secondary" disabled={backupBusy} onClick={() => doGenerateBackup({ uploadToOneDrive: true })}>
              Subir a OneDrive
            </button>
          </div>
          <MsgBox msg={backupMsg} />
          </Accordion>

          <Accordion title="Restaurar" defaultOpen={false}>
          <div className="small" style={{ marginBottom: 10, opacity: 0.7 }}>Reemplaza los datos locales con el contenido del archivo. Cierra otras pestañas antes de restaurar.</div>
          <div className="row row-form">
            <div style={{ flex: 1 }}>
              <label>Archivo .cczip</label>
              <input className="input" type="file" accept=".cczip,application/octet-stream" onChange={(e) => setRestoreFile(e.target.files?.[0] || null)} />
            </div>
            <TextField label="Contraseña" value={restorePass} onChange={setRestorePass} type="password" />
          </div>
          <div className="row row-form" style={{ marginTop: 12 }}>
            <button className="btn danger" disabled={backupBusy} onClick={doRestoreBackup}>Restaurar (reemplaza datos locales)</button>
          </div>
          <MsgBox msg={typeof restoreMsg === "string" ? restoreMsg : formatProgress(restoreMsg)} />
          </Accordion>

          <Accordion title="Sync — OneDrive" defaultOpen={false}>
          <div className="small" style={{ marginBottom: 12, opacity: 0.7 }}>Sincroniza gastos y boletas automáticamente cuando hay conexión.</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, background: "rgba(255,255,255,.04)", borderRadius: 12, padding: "10px 14px", marginBottom: 16 }}>
            <div><div className="small" style={{ opacity: 0.6 }}>Estado</div><div style={{ fontWeight: 700 }}>{sync?.auth?.connectedAt ? "Conectado" : "No conectado"}</div></div>
            <div><div className="small" style={{ opacity: 0.6 }}>Modo</div><div style={{ fontWeight: 700 }}>{sync?.rootMode || sync?.auth?.mode || "—"}</div></div>
            <div><div className="small" style={{ opacity: 0.6 }}>Última sync</div><div style={{ fontWeight: 700 }}>{s.lastSyncAt ? new Date(s.lastSyncAt).toLocaleString("es-CL") : "—"}</div></div>
            <div><div className="small" style={{ opacity: 0.6 }}>Conectado el</div><div style={{ fontWeight: 700 }}>{sync?.auth?.connectedAt ? new Date(sync.auth.connectedAt).toLocaleString("es-CL") : "—"}</div></div>
          </div>
          <div className="row row-form">
            <TextField label="Tenant ID" value={sync?.auth?.tenantId || "organizations"} onChange={(v) => saveOneDriveConfig({ tenantId: v })} />
            <TextField label="Client ID" value={sync?.auth?.clientId || ""} onChange={(v) => saveOneDriveConfig({ clientId: v })} />
          </div>
          <div className="row row-form" style={{ marginTop: 14, gap: 10, flexWrap: "wrap" }}>
            <button className="btn" onClick={() => connectOneDrive("approot")}>Conectar (AppFolder)</button>
            <button className="btn" onClick={() => connectOneDrive("folder")}>Conectar (Carpeta)</button>
            <button className="btn secondary" onClick={doSyncNow}>Sincronizar ahora</button>
            <button className="btn secondary" onClick={async () => { await disconnectOneDrive(); setSync(await getSyncState()); setSyncMsg("Desconectado."); }}>Desconectar</button>
          </div>
          <MsgBox msg={syncMsg} />
          </Accordion>
          </div>{/* fin accordion wrapper */}
        </div>
      )}
    </div>
  );
}
