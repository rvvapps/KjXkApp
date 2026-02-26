import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  DOC_TYPES,
  getExpense,
  updateExpense,
  listConcepts,
  listActiveCR,
  listActiveAccounts,
  listActivePartidas,
  listAttachmentsForExpense,
  addAttachment,
  deleteAttachment,
} from "../db.js";
import SelectField from "../components/SelectField.jsx";
import TextField from "../components/TextField.jsx";
import FileCapture from "../components/FileCapture.jsx";
import { compressImageFile } from "../services/image.js";

export default function EditExpense() {
  const { gastoId } = useParams();
  const nav = useNavigate();

  const [expense, setExpense] = useState(null); // null = cargando, undefined = no encontrado
  const [concepts, setConcepts] = useState([]);
  const [crs, setCrs] = useState([]);
  const [accts, setAccts] = useState([]);
  const [parts, setParts] = useState([]);
  const [atts, setAtts] = useState([]);

  const prevConceptIdRef = useRef(null);

  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const e = await getExpense(gastoId);
      setExpense(e ?? undefined); // si no existe, queda undefined (no encontrado)setExpense(e);
      setConcepts(await listConcepts());
      setCrs(await listActiveCR());
      setAccts(await listActiveAccounts());
      setParts(await listActivePartidas());
      setAtts(await listAttachmentsForExpense(gastoId));
    })();
  }, [gastoId]);

  const concept = useMemo(
    () => concepts.find((c) => c.conceptId === expense?.conceptId) || null,
    [concepts, expense]
  );

  // Si cambia el concepto en edición, aplicar defaults de forma "segura"
  // (solo si el usuario no ha sobreescrito esos campos, o si estaban vacíos).
  useEffect(() => {
    if (!expense) return;
    if (concepts.length === 0) return;

    const currentId = expense.conceptId || "";
    const prevId = prevConceptIdRef.current;

    // En la primera carga solo fijamos el "prev" y salimos.
    if (prevId === null) {
      prevConceptIdRef.current = currentId;
      return;
    }

    if (prevId === currentId) return;

    const prevConcept = concepts.find((c) => c.conceptId === prevId) || null;
    const nextConcept = concepts.find((c) => c.conceptId === currentId) || null;

    if (nextConcept) {
      const next = { ...expense };

      if (!next.ctaCodigo || next.ctaCodigo === (prevConcept?.ctaDefaultCodigo || "")) {
        next.ctaCodigo = nextConcept.ctaDefaultCodigo || next.ctaCodigo;
      }
      if (!next.partidaCodigo || next.partidaCodigo === (prevConcept?.partidaDefaultCodigo || "")) {
        next.partidaCodigo = nextConcept.partidaDefaultCodigo || next.partidaCodigo;
      }
      if (!next.clasificacionCodigo || next.clasificacionCodigo === (prevConcept?.clasificacionDefaultCodigo || "")) {
        next.clasificacionCodigo = nextConcept.clasificacionDefaultCodigo || next.clasificacionCodigo;
      }
      if (!String(next.detalle || "").trim() || next.detalle === (prevConcept?.nombre || "")) {
        next.detalle = nextConcept.nombre || next.detalle;
      }

      setExpense(next);
    }

    prevConceptIdRef.current = currentId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expense?.conceptId, concepts]);


  if (expense === null) return <div className="card">Cargando…</div>;
  
  if (expense === undefined) {
    return (
      <div className="card">
        <h2>Editar gasto</h2>
        <div className="small">
          No se encontró el gasto con ID:
          <div style={{ fontWeight: 800, marginTop: 8 }}>{gastoId}</div>
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn secondary" onClick={() => nav(-1)}>Volver</button>
        </div>
      </div>
    );
  }

  if (!expense) {
    return (
      <div className="card">
        <h2>Editar gasto</h2>
        <div className="small">
          No se encontró el gasto con ID:
          <div style={{ fontWeight: 800, marginTop: 8 }}>{gastoId}</div>
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn secondary" onClick={() => nav(-1)}>Volver</button>
        </div>
      </div>
    );
  }

  async function save() {
    setMsg("");
    if (!expense.conceptId) return setMsg("Selecciona un concepto.");
    if (!expense.crCodigo) return setMsg("Selecciona CR.");
    if (!expense.ctaCodigo) return setMsg("Selecciona Cuenta.");
    if (!expense.partidaCodigo) return setMsg("Selecciona Partida.");
    if (!expense.monto || Number(expense.monto) <= 0) return setMsg("Monto inválido.");

    if (concept?.requiereDoc) {
      const noDoc = expense.docTipo === "SinDoc" || !String(expense.docNumero || "").trim();
      if (noDoc) return setMsg("Este concepto requiere documento (tipo y número).");
    }

    setBusy(true);
    try {
      await updateExpense({ ...expense, monto: Math.round(Number(expense.monto)) });
      setMsg("✅ Guardado.");
    } catch (e) {
      console.error(e);
      setMsg("Error al guardar.");
    } finally {
      setBusy(false);
    }
  }

  async function addFiles(files) {
    setMsg("");
    setBusy(true);
    try {
      for (const f of files) {
        const compressed = await compressImageFile(f, { maxDim: 1600, quality: 0.82 });
        await addAttachment({
          gastoId,
          filename: compressed.name,
          mimeType: compressed.type,
          blob: compressed,
        });
      }
      setAtts(await listAttachmentsForExpense(gastoId));
      setMsg("✅ Respaldo agregado.");
    } catch (e) {
      console.error(e);
      setMsg("Error agregando respaldo.");
    } finally {
      setBusy(false);
    }
  }

  async function removeAtt(adjuntoId) {
    if (!confirm("¿Eliminar este respaldo?")) return;
    await deleteAttachment(adjuntoId);
    setAtts(await listAttachmentsForExpense(gastoId));
  }

  return (
    <div className="card">
      <h2>Editar gasto</h2>

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
        <SelectField
          label="Concepto"
          value={expense.conceptId}
          onChange={(v) => setExpense({ ...expense, conceptId: v })}
          options={concepts.map((c) => ({ value: c.conceptId, label: c.nombre }))}
          placeholder="Seleccione..."
        />
        <TextField
          label="Fecha"
          type="date"
          value={new Date(expense.fecha).toISOString().slice(0, 10)}
          onChange={(v) => {
            const iso = new Date(v + "T12:00:00").toISOString();
            setExpense({ ...expense, fecha: iso });
          }}
        />
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <TextField
          label="Monto ($)"
          type="number"
          value={expense.monto}
          onChange={(v) => setExpense({ ...expense, monto: v })}
        />
        <SelectField
          label="Tipo Doc"
          value={expense.docTipo}
          onChange={(v) => setExpense({ ...expense, docTipo: v })}
          options={DOC_TYPES.map((x) => ({ value: x, label: x }))}
        />
        <TextField
          label="N° Doc"
          value={expense.docNumero || ""}
          onChange={(v) => setExpense({ ...expense, docNumero: v })}
        />
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <label>Detalle / Glosa</label>
          <textarea
            className="input"
            rows={2}
            value={expense.detalle || ""}
            onChange={(e) => setExpense({ ...expense, detalle: e.target.value })}
          />
        </div>
      </div>

      <hr />

      <div className="row">
        <SelectField
          label="Centro de Responsabilidad (CR)"
          value={expense.crCodigo}
          onChange={(v) => setExpense({ ...expense, crCodigo: v })}
          options={crs.map((x) => ({ value: x.crCodigo, label: `${x.crCodigo} - ${x.crNombre}` }))}
          placeholder="Seleccione..."
        />
        <SelectField
          label="Cuenta Contable"
          value={expense.ctaCodigo}
          onChange={(v) => setExpense({ ...expense, ctaCodigo: v })}
          options={accts.map((x) => ({ value: x.ctaCodigo, label: `${x.ctaCodigo} - ${x.ctaNombre}` }))}
          placeholder="Seleccione..."
        />
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <SelectField
          label="Partida"
          value={expense.partidaCodigo || ""}
          onChange={(v) => setExpense({ ...expense, partidaCodigo: v })}
          options={parts.map((x) => ({ value: x.partidaCodigo, label: `${x.partidaCodigo} - ${x.partidaNombre}` }))}
          placeholder="Seleccione..."
        />
        <TextField
          label="Clasificación (código)"
          value={expense.clasificacionCodigo || ""}
          onChange={(v) => setExpense({ ...expense, clasificacionCodigo: v })}
        />
      </div>

      <hr />

      <h3>Respaldos</h3>
      {atts.length === 0 ? (
        <div className="small">Sin respaldos.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {atts.map((a) => (
            <div key={a.adjuntoId} className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <div className="small">{a.filename}</div>
              <button className="btn danger" onClick={() => removeAtt(a.adjuntoId)}>
                Eliminar
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="row" style={{ marginTop: 12 }}>
        <FileCapture onFiles={addFiles} />
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn" disabled={busy} onClick={save}>
          {busy ? "Guardando..." : "Guardar cambios"}
        </button>
        <button className="btn secondary" onClick={() => nav(-1)}>
          Volver
        </button>
      </div>
    </div>
  );
}
