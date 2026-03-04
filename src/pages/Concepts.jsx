import React, { useEffect, useMemo, useState } from "react";
import { v4 as uuid } from "uuid";
import {
  listAllConcepts,
  upsertConcept,
  deactivateConcept,
  activateConcept,
  listActiveAccounts,
  listActivePartidas,
  countExpensesByConceptId, // ✅ NUEVO
} from "../db.js";
import TextField from "../components/TextField.jsx";
import SelectField from "../components/SelectField.jsx";

const emptyForm = {
  conceptId: "",
  nombre: "",
  ctaDefaultCodigo: "",
  partidaDefaultCodigo: "",
  clasificacionDefaultCodigo: "",
  requiereDoc: true,
  requiereRespaldo: true,
  favorito: false,
  activo: true,
};

export default function Concepts() {
  const [concepts, setConcepts] = useState([]);
  const [accts, setAccts] = useState([]);
  const [parts, setParts] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [msg, setMsg] = useState("");

  // ✅ filtro por defecto = todos
  const [filter, setFilter] = useState("todos"); // activos | inactivos | todos

  // ✅ mapa de uso: { [conceptId]: count }
  const [usage, setUsage] = useState({});

  async function refresh() {
    const all = await listAllConcepts();
    setConcepts(all);
    setAccts(await listActiveAccounts());
    setParts(await listActivePartidas());

    // calcular uso para todos (1 vez por refresh)
    const pairs = await Promise.all(
      all.map(async (c) => [c.conceptId, await countExpensesByConceptId(c.conceptId)])
    );
    setUsage(Object.fromEntries(pairs));
  }

  useEffect(() => { refresh(); }, []);

  const isEditing = useMemo(() => !!form.conceptId, [form.conceptId]);

  const filteredConcepts = useMemo(() => {
    if (filter === "activos") return concepts.filter((c) => c.activo !== false);
    if (filter === "inactivos") return concepts.filter((c) => c.activo === false);
    return concepts;
  }, [concepts, filter]);

  function startNew() {
    setForm({ ...emptyForm, conceptId: "" });
    setMsg("");
  }

  function edit(c) {
    setForm({ ...c });
    setMsg("");
  }

  async function save() {
    setMsg("");
    if (!form.nombre.trim()) return setMsg("Ingresa el nombre del concepto.");
    if (!form.ctaDefaultCodigo) return setMsg("Selecciona la cuenta por defecto.");
    if (!form.partidaDefaultCodigo) return setMsg("Selecciona la partida por defecto.");

    const payload = {
      ...form,
      conceptId: form.conceptId || uuid(),
      nombre: form.nombre.trim(),
      // guardamos activo por defecto
      activo: true,
    };

    await upsertConcept(payload);
    setMsg("✅ Concepto guardado.");
    startNew();
    await refresh();
  }

  async function remove(conceptId) {
    if (!confirm("¿Desactivar este concepto? (No se borra el histórico)")) return;
    await deactivateConcept(conceptId);
    await refresh();
  }

  async function reactivate(conceptId) {
    await activateConcept(conceptId);
    await refresh();
  }

  async function toggleFav(c) {
    await upsertConcept({ ...c, favorito: !c.favorito });
    await refresh();
  }

  return (
    <div className="grid2">
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "end" }}>
          <div>
            <h2>Conceptos</h2>
            <div className="small">
              Define defaults (Cuenta/Partida) para que “Nuevo Gasto” sea rápido.
            </div>
          </div>

          <SelectField
            label="Ver"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "todos", label: "Todos" },
              { value: "activos", label: "Activos" },
              { value: "inactivos", label: "Inactivos" },
            ]}
          />
        </div>

        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          {filteredConcepts.length === 0 ? (
            <div className="small">No hay conceptos para este filtro.</div>
          ) : (
            filteredConcepts.map((c) => {
              const usedCount = usage[c.conceptId] || 0;
              const isUsed = usedCount > 0;

              return (
                <div key={c.conceptId} className="card" style={{ padding: 12 }}>
                  <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 900 }}>
                        {c.nombre} {c.favorito ? "⭐" : ""}{c.activo === false ? " (inactivo)" : ""}
                      </div>
                      <div className="small">
                        CTA {c.ctaDefaultCodigo || "-"} · Part {c.partidaDefaultCodigo || "-"} · Clasif {c.clasificacionDefaultCodigo || "-"}
                      </div>
                      <div className="small">
                        Doc: {c.requiereDoc ? "sí" : "no"} · Respaldo: {c.requiereRespaldo ? "sí" : "no"}
                      </div>

                      {isUsed && (
                        <div className="small" style={{ marginTop: 6, opacity: 0.9 }}>
                          ⚠️ En uso por <b>{usedCount}</b> gasto(s)
                        </div>
                      )}
                    </div>

                    <div className="row">
                      <button className="btn secondary" onClick={() => edit(c)}>Editar</button>

                      <button className="btn secondary" onClick={() => toggleFav(c)}>
                        {c.favorito ? "Quitar ⭐" : "Favorito ⭐"}
                      </button>

                      {c.activo === false ? (
                        <button className="btn" onClick={() => reactivate(c.conceptId)}>
                          Reactivar
                        </button>
                      ) : (
                        <button
                          className="btn danger"
                          disabled={isUsed}
                          title={isUsed ? `No se puede desactivar: usado en ${usedCount} gasto(s).` : "Desactivar"}
                          onClick={() => remove(c.conceptId)}
                        >
                          Desactivar
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="card">
        <h2>{isEditing ? "Editar concepto" : "Nuevo concepto"}</h2>

        {msg && (
          <div className="small" style={{ padding: 10, border: "1px solid rgba(255,255,255,.12)", borderRadius: 12 }}>
            {msg}
          </div>
        )}

        <div className="row" style={{ marginTop: 12 }}>
          <TextField
            label="Nombre"
            value={form.nombre}
            onChange={(v) => setForm({ ...form, nombre: v })}
            placeholder="Ej: Combustible"
          />
        </div>

        <div className="row" style={{ marginTop: 12 }}>
          <SelectField
            label="Cuenta por defecto"
            value={form.ctaDefaultCodigo}
            onChange={(v) => setForm({ ...form, ctaDefaultCodigo: v })}
            options={accts.map((x) => ({ value: x.ctaCodigo, label: `${x.ctaCodigo} - ${x.ctaNombre}` }))}
            placeholder="Seleccione cuenta..."
          />
          <SelectField
            label="Partida por defecto"
            value={form.partidaDefaultCodigo}
            onChange={(v) => setForm({ ...form, partidaDefaultCodigo: v })}
            options={parts.map((x) => ({ value: x.partidaCodigo, label: `${x.partidaCodigo} - ${x.partidaNombre}` }))}
            placeholder="Seleccione partida..."
          />
        </div>

        <div className="row" style={{ marginTop: 12 }}>
          <TextField
            label="Clasificación por defecto (código)"
            value={form.clasificacionDefaultCodigo || ""}
            onChange={(v) => setForm({ ...form, clasificacionDefaultCodigo: v })}
            placeholder="Opcional por ahora"
          />
        </div>

        <hr />

        <div className="row">
          <label style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={!!form.requiereDoc}
              onChange={(e) => setForm({ ...form, requiereDoc: e.target.checked })}
            />
            <span className="small">Requiere documento</span>
          </label>

          <label style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={!!form.requiereRespaldo}
              onChange={(e) => setForm({ ...form, requiereRespaldo: e.target.checked })}
            />
            <span className="small">Requiere respaldo (foto)</span>
          </label>

          <label style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={!!form.favorito}
              onChange={(e) => setForm({ ...form, favorito: e.target.checked })}
            />
            <span className="small">Favorito ⭐</span>
          </label>
        </div>

        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn" onClick={save}>Guardar</button>
          <button className="btn secondary" onClick={startNew}>Nuevo</button>
        </div>
      </div>
    </div>
  );
}
