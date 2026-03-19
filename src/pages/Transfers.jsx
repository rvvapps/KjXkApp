import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { v4 as uuid } from "uuid";
import {
  TRANSFER_TYPES,
  addTransfer,
  listPendingTransfers,
  listTransfersByEstado,
  listActiveCR,
  listConcepts,
  listActiveDestinations,
  liquidarCombustible,
  getSettings,
} from "../db.js";
import TextField from "../components/TextField.jsx";
import SelectField from "../components/SelectField.jsx";

const emptyForm = () => ({
  fecha: new Date().toISOString().slice(0, 10),
  destino: "",
  destinationId: "",
  tipo: "Vehículo propio",
  crCodigo: "",
  visita: "",
  monto: "",
  notas: "",
});

export default function Transfers() {
  const nav = useNavigate();
  const location = useLocation();

  const [form, setForm] = useState(emptyForm());
  const [formOpen, setFormOpen] = useState(location.state?.openForm === true);
  const [view, setView] = useState("pendiente");
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(new Set());

  const [crs, setCrs] = useState([]);
  const [concepts, setConcepts] = useState([]);
  const [destinations, setDestinations] = useState([]);
  const [combustibleConceptId, setCombustibleConceptId] = useState("");

  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [showOlderUsed, setShowOlderUsed] = useState(false);
  const USED_RECENT_LIMIT = 20;

  // Panel liquidación
  const [montoAjustado, setMontoAjustado] = useState("");

  async function refresh() {
    const [cr, c, dests, settings, list] = await Promise.all([
      listActiveCR(),
      listConcepts(),
      listActiveDestinations(),
      getSettings(),
      view === "pendiente" ? listPendingTransfers() : listTransfersByEstado("usado"),
    ]);
    setCrs(cr);
    setConcepts(c);
    setDestinations(dests);
    setItems(list);

    // Pre-seleccionar concepto combustible
    const combustible = c.find((x) =>
      x.nombre.toLowerCase().includes("combustible") ||
      x.nombre.toLowerCase().includes("bencina")
    );
    if (combustible && !combustibleConceptId) setCombustibleConceptId(combustible.conceptId);

    // Pre-completar CR default si el form está vacío
    if (!form.crCodigo && settings?.crDefaultCodigo) {
      setForm((f) => ({ ...f, crCodigo: settings.crDefaultCodigo }));
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, view]);

  // Al seleccionar destino favorito → pre-completar monto y CR
  function onSelectDestination(destinationId) {
    const dest = destinations.find((d) => d.destinationId === destinationId);
    if (dest) {
      setForm((f) => ({
        ...f,
        destinationId,
        destino: dest.destino,
        monto: String(dest.monto || ""),
        crCodigo: dest.crCodigo || f.crCodigo,
      }));
    } else {
      setForm((f) => ({ ...f, destinationId: "", destino: "", monto: "" }));
    }
  }

  function toggleTransfer(id) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
    setMontoAjustado(""); // resetear ajuste al cambiar selección
  }

  async function saveTransfer() {
    setMsg("");
    if (!form.destino.trim()) return setMsg("Ingresa el destino.");
    if (!form.crCodigo) return setMsg("Selecciona CR.");
    if (!form.visita.trim()) return setMsg("Ingresa la visita/viaje.");

    const payload = {
      transferId: uuid(),
      fecha: new Date(form.fecha + "T12:00:00").toISOString(),
      destino: form.destino.trim(),
      destinationId: form.destinationId || null,
      tipo: form.tipo,
      crCodigo: form.crCodigo,
      visita: form.visita.trim(),
      monto: Number(form.monto) || 0,
      notas: form.notas.trim(),
      estado: "pendiente",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    try {
      await addTransfer(payload);
      setForm(emptyForm());
      setMsg("✅ Trayecto registrado.");
      setFormOpen(false);
      setView("pendiente");
      setSelected(new Set());
      await refresh();
    } catch (e) {
      console.error(e);
      setMsg("Error al guardar trayecto.");
    }
  }

  // Suma de los trayectos seleccionados
  const selectedItems = useMemo(
    () => items.filter((t) => selected.has(t.transferId)),
    [items, selected]
  );
  const sumaSeleccionados = useMemo(
    () => selectedItems.reduce((s, t) => s + Number(t.monto || 0), 0),
    [selectedItems]
  );
  const montoLiquidar = Number(montoAjustado) > 0 ? Number(montoAjustado) : sumaSeleccionados;

  async function doLiquidar() {
    setMsg("");
    if (selected.size === 0) return setMsg("Selecciona al menos un trayecto.");
    if (!combustibleConceptId) return setMsg("No se encontró concepto de combustible. Créalo en Maestros > Conceptos.");

    const crCodigo = selectedItems[0]?.crCodigo || "";
    setBusy(true);
    try {
      const { gastoId, monto } = await liquidarCombustible({
        transferIds: Array.from(selected),
        conceptId: combustibleConceptId,
        crCodigo,
        montoFinal: montoLiquidar,
        docTipo: "Boleta",
      });
      setMsg(`✅ Gasto de combustible creado por $${monto.toLocaleString("es-CL")}. Agrega la boleta en Inicio.`);
      setSelected(new Set());
      setMontoAjustado("");
      setView("usado");
      await refresh();
    } catch (e) {
      setMsg(`❌ Error: ${e?.message || "error desconocido"}`);
    } finally {
      setBusy(false);
    }
  }

  const listSorted = useMemo(() => {
    const sorted = items.slice().sort((a, b) => (a.fecha || "").localeCompare(b.fecha || ""));
    return view === "usado" ? sorted.reverse() : sorted;
  }, [items, view]);

  const listToRender = useMemo(() => {
    if (view !== "usado") return listSorted;
    return showOlderUsed ? listSorted : listSorted.slice(0, USED_RECENT_LIMIT);
  }, [view, showOlderUsed, listSorted]);

  const groupedByVisita = useMemo(() => {
    const grouped = listToRender.reduce((acc, t) => {
      const key = (t.visita || "").trim() || "Sin visita";
      if (!acc[key]) acc[key] = [];
      acc[key].push(t);
      return acc;
    }, {});
    return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b));
  }, [listToRender]);

  const hasSelection = selected.size > 0;

  return (
    <div className="grid2">
      {/* Formulario nuevo trayecto */}
      <div className="card">
        <div
          onClick={() => setFormOpen((v) => !v)}
          style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", userSelect: "none" }}
        >
          <h2 style={{ margin: 0 }}>Registrar trayecto</h2>
          <span style={{ fontSize: 13, opacity: 0.6 }}>{formOpen ? "▲" : "▼"}</span>
        </div>

        {formOpen && (<>
        <div className="small" style={{ marginBottom: 10, marginTop: 8 }}>
          Anota cada visita. Luego los liquidas como un gasto de combustible.
        </div>

        {msg && (
          <div className="small" style={{
            padding: 10, border: "1px solid var(--sep)",
            borderRadius: 12, marginTop: 8, whiteSpace: "pre-line",
          }}>
            {msg}
          </div>
        )}

        <div className="row row-form" style={{ marginTop: 12 }}>
          <TextField
            label="Fecha"
            type="date"
            value={form.fecha}
            onChange={(v) => setForm({ ...form, fecha: v })}
          />
          <SelectField
            label="Tipo traslado"
            value={form.tipo}
            onChange={(v) => setForm({ ...form, tipo: v })}
            options={TRANSFER_TYPES.map((x) => ({ value: x, label: x }))}
          />
        </div>

        {/* Selector destino favorito */}
        {destinations.length > 0 && (
          <div className="row row-form" style={{ marginTop: 12 }}>
            <SelectField
              label="Destino favorito (opcional)"
              value={form.destinationId}
              onChange={onSelectDestination}
              options={destinations.map((d) => ({
                value: d.destinationId,
                label: `${d.destino}${d.monto ? ` — $${Number(d.monto).toLocaleString("es-CL")}` : ""}`,
              }))}
              placeholder="Seleccionar favorito o escribir abajo..."
            />
          </div>
        )}

        <div className="row row-form" style={{ marginTop: 12 }}>
          <TextField
            label="Destino"
            value={form.destino}
            onChange={(v) => setForm({ ...form, destino: v, destinationId: "" })}
            placeholder="Ej: Proveedor ABC - Quilpué"
          />
          <TextField
            label="Monto combustible ($)"
            type="number"
            value={form.monto}
            onChange={(v) => setForm({ ...form, monto: v })}
            placeholder="0"
          />
        </div>

        <div className="row row-form" style={{ marginTop: 12 }}>
          <SelectField
            label="CR"
            value={form.crCodigo}
            onChange={(v) => setForm({ ...form, crCodigo: v })}
            options={crs.map((x) => ({ value: x.crCodigo, label: `${x.crCodigo} - ${x.crNombre}` }))}
            placeholder="Seleccione..."
          />
          <TextField
            label="Visita / Proyecto"
            value={form.visita}
            onChange={(v) => setForm({ ...form, visita: v })}
            placeholder="Ej: Coquimbo Marzo"
          />
        </div>

        <div className="row row-form" style={{ marginTop: 12 }}>
          <div style={{ flex: 1 }}>
            <label>Notas</label>
            <textarea
              className="input"
              rows={2}
              value={form.notas}
              onChange={(e) => setForm({ ...form, notas: e.target.value })}
            />
          </div>
        </div>

        <div className="row row-form" style={{ marginTop: 12 }}>
          <button className="btn" onClick={saveTransfer}>Guardar trayecto</button>
        </div>
        </>)}
      </div>

      {/* Listado */}
      <div className="card">
        <div className="row row-form" style={{ justifyContent: "space-between", alignItems: "end" }}>
          <div>
            <h2 style={{ marginBottom: 4 }}>Trayectos</h2>
            <div className="small">
              {view === "pendiente"
                ? `${items.length} pendiente${items.length !== 1 ? "s" : ""} — $${items.reduce((s, t) => s + Number(t.monto || 0), 0).toLocaleString("es-CL")} total`
                : "Historial de trayectos usados"}
            </div>
          </div>
          <SelectField
            label="Ver"
            value={view}
            onChange={(v) => {
              setSelected(new Set());
              setMontoAjustado("");
              setShowOlderUsed(false);
              setView(v);
            }}
            options={[
              { value: "pendiente", label: "Pendientes" },
              { value: "usado", label: "Usados" },
            ]}
          />
        </div>

        {view === "usado" && listSorted.length > USED_RECENT_LIMIT && (
          <div className="row row-form" style={{ justifyContent: "space-between", marginTop: 10 }}>
            <div className="small">
              Mostrando {showOlderUsed ? listSorted.length : Math.min(USED_RECENT_LIMIT, listSorted.length)} de {listSorted.length}
            </div>
            <button className="btn secondary" onClick={() => setShowOlderUsed((v) => !v)}>
              {showOlderUsed ? "Ocultar antiguos" : "Mostrar antiguos"}
            </button>
          </div>
        )}

        <hr />

        {listSorted.length === 0 ? (
          <div className="small">
            {view === "pendiente" ? "No hay trayectos pendientes 🎉" : "No hay trayectos usados aún."}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {groupedByVisita.map(([visita, transfers]) => (
              <div key={visita} className="card" style={{ padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <div style={{ fontWeight: 900 }}>{visita}</div>
                  {view === "pendiente" && (
                    <div className="small" style={{ opacity: 0.7 }}>
                      ${ transfers.reduce((s, t) => s + Number(t.monto || 0), 0).toLocaleString("es-CL")}
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {transfers.map((t) => (
                    <div
                      key={t.transferId}
                      className="row row-form"
                      style={{
                        justifyContent: "space-between",
                        alignItems: "center",
                        paddingTop: 8,
                        borderTop: "1px solid var(--sep)",
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 800 }}>
                          {t.destino}
                          {Number(t.monto) > 0 && (
                            <span style={{ fontWeight: 400, marginLeft: 8, fontSize: 13 }}>
                              ${Number(t.monto).toLocaleString("es-CL")}
                            </span>
                          )}
                        </div>
                        <div className="small">
                          {new Date(t.fecha).toLocaleDateString("es-CL")} · {t.tipo} · CR {t.crCodigo}
                        </div>
                        {t.notas ? <div className="small">Nota: {t.notas}</div> : null}
                        {view === "usado" && t.gastoId && (
                          <div className="small" style={{ marginTop: 4 }}>
                            Liquidado en gasto
                          </div>
                        )}
                      </div>

                      {view === "pendiente" ? (
                        <label style={{ display: "inline-flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
                          <input
                            type="checkbox"
                            checked={selected.has(t.transferId)}
                            onChange={() => toggleTransfer(t.transferId)}
                          />
                          <span className="small">Incluir</span>
                        </label>
                      ) : (
                        t.gastoId ? (
                          <button className="btn secondary" onClick={() => nav(`/gastos/${t.gastoId}`)}>
                            Ver gasto
                          </button>
                        ) : null
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {/* Panel liquidación — debajo de la lista */}
      {hasSelection && (
        <div style={{
          marginTop: 12, padding: "14px 16px",
          background: "rgba(34,197,94,.08)",
          border: "1px solid rgba(34,197,94,.25)",
          borderRadius: 14,
        }}>
          <div style={{ fontWeight: 800, marginBottom: 4 }}>🔋 Liquidar combustible</div>
          <div className="small" style={{ marginBottom: 10 }}>
            {selected.size} trayecto{selected.size > 1 ? "s" : ""} · suma estimada: <b>${sumaSeleccionados.toLocaleString("es-CL")}</b>
          </div>
          <div className="row row-form" style={{ marginBottom: 10 }}>
            <TextField
              label="Monto final a pagar en bomba (opcional)"
              type="number"
              value={montoAjustado}
              onChange={setMontoAjustado}
              placeholder={`$${sumaSeleccionados.toLocaleString("es-CL")} (calculado)`}
            />
          </div>
          <div className="small" style={{ marginBottom: 10 }}>
            Concepto:{" "}
            <SelectField
              label=""
              value={combustibleConceptId}
              onChange={setCombustibleConceptId}
              options={concepts.map((c) => ({ value: c.conceptId, label: c.nombre }))}
              placeholder="Seleccione concepto..."
            />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn" disabled={busy} onClick={doLiquidar}>
              {busy ? "Creando…" : `Crear gasto $${montoLiquidar.toLocaleString("es-CL")}`}
            </button>
            <button className="btn secondary" onClick={() => { setSelected(new Set()); setMontoAjustado(""); }}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
