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
} from "../db.js";
import TextField from "../components/TextField.jsx";
import SelectField from "../components/SelectField.jsx";

const empty = {
  fecha: new Date().toISOString().slice(0, 10),
  origen: "",
  destino: "",
  tipo: "Vehículo propio",
  crCodigo: "",
  visita: "",
  notas: "",
};

export default function Transfers() {
  const nav = useNavigate();
  const location = useLocation();

  const [form, setForm] = useState(empty);

  const [view, setView] = useState("pendiente"); // "pendiente" | "usado"
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(new Set());

  const [crs, setCrs] = useState([]);
  const [concepts, setConcepts] = useState([]);
  const [conceptId, setConceptId] = useState("");

  const [msg, setMsg] = useState("");

  // ✅ usados plegables
  const [showOlderUsed, setShowOlderUsed] = useState(false);
  const USED_RECENT_LIMIT = 20;

  async function refresh() {
    const [cr, c, list] = await Promise.all([
      listActiveCR(),
      listConcepts(),
      view === "pendiente" ? listPendingTransfers() : listTransfersByEstado("usado"),
    ]);

    setCrs(cr);
    setConcepts(c);
    if (!conceptId && c.length) setConceptId(c[0].conceptId);

    setItems(list);
  }

  // refresca al entrar / volver / cambiar view
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, view]);

  function toggle(id) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  const selectedTransfers = useMemo(
    () => items.filter((t) => selected.has(t.transferId)),
    [items, selected]
  );

  async function saveTransfer() {
    setMsg("");
    if (!form.origen.trim()) return setMsg("Ingresa origen.");
    if (!form.destino.trim()) return setMsg("Ingresa destino.");
    if (!form.crCodigo) return setMsg("Selecciona CR.");
    if (!form.visita.trim()) return setMsg("Ingresa la visita/viaje (ej: Coquimbo).");

    const payload = {
      transferId: uuid(),
      fecha: new Date(form.fecha + "T12:00:00").toISOString(),
      origen: form.origen.trim(),
      destino: form.destino.trim(),
      tipo: form.tipo,
      crCodigo: form.crCodigo,
      visita: form.visita.trim(),
      notas: form.notas.trim(),
      estado: "pendiente",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    try {
      await addTransfer(payload);
      setForm(empty);
      setMsg("✅ Traslado registrado.");
      setView("pendiente");
      setSelected(new Set());
      await refresh();
    } catch (e) {
      console.error(e);
      setMsg("Error al guardar traslado. Revisa consola.");
    }
  }

  function generateExpense() {
    setMsg("");
    if (view !== "pendiente") return setMsg("Cambia a “Pendientes” para generar gasto.");
    if (selectedTransfers.length === 0) return setMsg("Selecciona al menos un traslado.");
    if (!conceptId) return setMsg("Selecciona un concepto para generar el gasto.");

    const visita = selectedTransfers[0]?.visita || "";
    const crCodigo = selectedTransfers[0]?.crCodigo || "";

    const lines = selectedTransfers
      .slice()
      .sort((a, b) => (a.fecha || "").localeCompare(b.fecha || ""))
      .map(
        (t) =>
          `• ${new Date(t.fecha).toLocaleDateString("es-CL")} — ${t.tipo}: ${t.origen} → ${t.destino}`
      )
      .join("\n");

    nav("/gastos/nuevo", {
      state: {
        fromTransfers: true,
        transferIds: selectedTransfers.map((t) => t.transferId),
        prefill: {
          conceptId,
          crCodigo,
          detalle: `Visita: ${visita}\n${lines}`,
        },
      },
    });
  }

  // ✅ orden según vista:
  // pendientes: antiguo → reciente
  // usados: reciente → antiguo
  const listSorted = useMemo(() => {
    const sorted = items.slice().sort((a, b) => (a.fecha || "").localeCompare(b.fecha || ""));
    return view === "usado" ? sorted.reverse() : sorted;
  }, [items, view]);

  // ✅ en usados: recortar por defecto a los últimos 20
  const listToRender = useMemo(() => {
    if (view !== "usado") return listSorted;
    if (showOlderUsed) return listSorted;
    return listSorted.slice(0, USED_RECENT_LIMIT);
  }, [view, showOlderUsed, listSorted]);

  // ✅ agrupar por visita usando listToRender
  const groupedByVisita = useMemo(() => {
    const grouped = listToRender.reduce((acc, t) => {
      const key = (t.visita || "").trim() || "Sin visita";
      if (!acc[key]) acc[key] = [];
      acc[key].push(t);
      return acc;
    }, {});
    return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b));
  }, [listToRender]);

  return (
    <div className="grid2">
      {/* Formulario */}
      <div className="card">
        <h2>Traslados</h2>
        <div className="small">Registra movimientos para no olvidarlos. Luego conviértelos en gastos.</div>

        {msg && (
          <div
            className="small"
            style={{
              padding: 10,
              border: "1px solid rgba(255,255,255,.12)",
              borderRadius: 12,
              marginTop: 10,
              whiteSpace: "pre-line",
            }}
          >
            {msg}
          </div>
        )}

        <div className="row" style={{ marginTop: 12 }}>
          <TextField
            label="Fecha"
            type="date"
            value={form.fecha}
            onChange={(v) => setForm({ ...form, fecha: v })}
          />
          <SelectField
            label="Tipo"
            value={form.tipo}
            onChange={(v) => setForm({ ...form, tipo: v })}
            options={TRANSFER_TYPES.map((x) => ({ value: x, label: x }))}
          />
        </div>

        <div className="row" style={{ marginTop: 12 }}>
          <TextField label="Origen" value={form.origen} onChange={(v) => setForm({ ...form, origen: v })} />
          <TextField label="Destino" value={form.destino} onChange={(v) => setForm({ ...form, destino: v })} />
        </div>

        <div className="row" style={{ marginTop: 12 }}>
          <SelectField
            label="Centro de Responsabilidad (CR)"
            value={form.crCodigo}
            onChange={(v) => setForm({ ...form, crCodigo: v })}
            options={crs.map((x) => ({ value: x.crCodigo, label: `${x.crCodigo} - ${x.crNombre}` }))}
            placeholder="Seleccione..."
          />
          <TextField
            label="Visita / Viaje"
            value={form.visita}
            onChange={(v) => setForm({ ...form, visita: v })}
            placeholder="Ej: Coquimbo / Reunión proveedor"
          />
        </div>

        <div className="row" style={{ marginTop: 12 }}>
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

        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn" onClick={saveTransfer}>Guardar traslado</button>
        </div>
      </div>

      {/* Listado */}
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "end" }}>
          <div>
            <h2 style={{ marginBottom: 4 }}>Listado</h2>
            <div className="small">Vista: Pendientes / Usados</div>
          </div>

          <SelectField
            label="Ver"
            value={view}
            onChange={(v) => {
              setSelected(new Set());
              setShowOlderUsed(false); // ✅ reset plegado
              setView(v);
            }}
            options={[
              { value: "pendiente", label: "Pendientes" },
              { value: "usado", label: "Usados" },
            ]}
          />
        </div>

        {view === "pendiente" && (
          <div className="row" style={{ marginTop: 12, alignItems: "end" }}>
            <SelectField
              label="Concepto a generar"
              value={conceptId}
              onChange={setConceptId}
              options={concepts.map((c) => ({ value: c.conceptId, label: c.nombre }))}
              placeholder="Seleccione..."
            />
            <button className="btn" onClick={generateExpense}>
              Generar Gasto ({selected.size})
            </button>
          </div>
        )}

        {/* ✅ Plegado usados */}
        {view === "usado" && listSorted.length > USED_RECENT_LIMIT && (
          <div
            className="row"
            style={{ justifyContent: "space-between", alignItems: "center", marginTop: 10 }}
          >
            <div className="small">
              Mostrando{" "}
              {showOlderUsed ? listSorted.length : Math.min(USED_RECENT_LIMIT, listSorted.length)}{" "}
              de {listSorted.length}
            </div>

            <button className="btn secondary" onClick={() => setShowOlderUsed((v) => !v)}>
              {showOlderUsed ? "Ocultar antiguos" : "Mostrar antiguos"}
            </button>
          </div>
        )}

        <hr />

        {/* ✅ Empty state correcto */}
        {listSorted.length === 0 ? (
          <div className="small">
            {view === "pendiente" ? "No hay traslados pendientes 🎉" : "No hay traslados usados aún."}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {/* ✅ Agrupación por visita */}
            {groupedByVisita.map(([visita, transfers]) => (
              <div key={visita} className="card" style={{ padding: 12 }}>
                <div style={{ fontWeight: 900, marginBottom: 8 }}>Visita: {visita}</div>

                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {transfers.map((t) => (
                    <div
                      key={t.transferId}
                      className="row"
                      style={{
                        justifyContent: "space-between",
                        alignItems: "center",
                        paddingTop: 8,
                        borderTop: "1px solid rgba(255,255,255,.08)",
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 800 }}>{t.origen} → {t.destino}</div>
                        <div className="small">
                          {new Date(t.fecha).toLocaleDateString("es-CL")} · {t.tipo} · CR {t.crCodigo}
                        </div>
                        {t.notas ? <div className="small">Nota: {t.notas}</div> : null}

                        {view === "usado" && (
                          <div className="small" style={{ marginTop: 6 }}>
                            <b>Gasto:</b> {t.gastoId || "(sin vínculo)"}
                          </div>
                        )}
                      </div>

                      {view === "pendiente" ? (
                        <label style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                          <input
                            type="checkbox"
                            checked={selected.has(t.transferId)}
                            onChange={() => toggle(t.transferId)}
                          />
                          <span className="small">Usar</span>
                        </label>
                      ) : (
                        t.gastoId ? (
                          <button className="btn secondary" onClick={() => nav(`/gastos/${t.gastoId}`)}>
                            Abrir gasto
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
    </div>
  );
}
