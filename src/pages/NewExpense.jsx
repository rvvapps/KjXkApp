import React, { useEffect, useMemo, useRef, useState } from "react";
import { v4 as uuid } from "uuid";
import { useLocation, useNavigate } from "react-router-dom";
import {
  DOC_TYPES,
  addExpense,
  addAttachment,
  getSettings,
  listActiveCR,
  listActiveAccounts,
  listActivePartidas,
  listConcepts,
  markTransfersUsed,
} from "../db.js";
import SelectField from "../components/SelectField.jsx";
import TextField from "../components/TextField.jsx";
import FileCapture from "../components/FileCapture.jsx";
import { compressImageFile } from "../services/image.js";

export default function NewExpense() {
  const location = useLocation();
  const navigate = useNavigate();

  // Puede venir desde Traslados
  const prefill = location.state?.prefill || null;
  const transferIdsInitial = location.state?.transferIds || [];
  const transferIdsRef = useRef(transferIdsInitial);
  const transferIds = transferIdsRef.current;

  const [settings, setSettings] = useState(null);
  const [concepts, setConcepts] = useState([]);
  const [crs, setCrs] = useState([]);
  const [accts, setAccts] = useState([]);
  const [parts, setParts] = useState([]);

  const [conceptId, setConceptId] = useState("");
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [monto, setMonto] = useState("");
  const [docTipo, setDocTipo] = useState("Boleta");
  const [docNumero, setDocNumero] = useState("");
  const [detalle, setDetalle] = useState("");
  const [crCodigo, setCrCodigo] = useState("");
  const [ctaCodigo, setCtaCodigo] = useState("");
  const [partidaCodigo, setPartidaCodigo] = useState("");
  const [clasificacionCodigo, setClasificacionCodigo] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    (async () => {
      const s = await getSettings();
      setSettings(s);
      setCrCodigo(s.crDefaultCodigo || "");

      const c = await listConcepts();
      setConcepts(c);

      setCrs(await listActiveCR());
      setAccts(await listActiveAccounts());
      setParts(await listActivePartidas());

      // Aplicar prefill (si viene desde Traslados)
      if (prefill) {
        if (prefill.conceptId) setConceptId(prefill.conceptId);
        if (prefill.crCodigo) setCrCodigo(prefill.crCodigo);
        if (typeof prefill.detalle === "string" && prefill.detalle.trim()) setDetalle(prefill.detalle);

        if (prefill.docTipo) setDocTipo(prefill.docTipo);
        if (prefill.docNumero) setDocNumero(prefill.docNumero);
        if (prefill.monto) setMonto(String(prefill.monto));
        if (prefill.fecha) setFecha(prefill.fecha);
      }

      // Limpia el state para que el prefill no se re-aplique al volver atrás
      if (location.state) {
        navigate(".", { replace: true, state: null });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const concept = useMemo(
    () => concepts.find((c) => c.conceptId === conceptId) || null,
    [conceptId, concepts]
  );

  useEffect(() => {
    if (!concept) return;
    setCtaCodigo(concept.ctaDefaultCodigo || "");
    setPartidaCodigo(concept.partidaDefaultCodigo || "");
    setClasificacionCodigo(concept.clasificacionDefaultCodigo || "");
    if (!detalle) setDetalle(concept.nombre);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conceptId]);

  const conceptOptions = useMemo(() => {
    const fav = concepts.filter((c) => c.favorito);
    const rest = concepts.filter((c) => !c.favorito);
    return [...fav, ...rest].map((c) => ({ value: c.conceptId, label: c.nombre }));
  }, [concepts]);

  async function handleSave(files) {
    setMsg("");
    if (!conceptId) return setMsg("Selecciona un concepto.");
    if (!crCodigo) return setMsg("Selecciona Centro de Responsabilidad (CR).");
    if (!ctaCodigo) return setMsg("Selecciona Cuenta Contable.");
    if (!partidaCodigo) return setMsg("Selecciona Partida (o define default para el concepto).");
    if (!monto || Number(monto) <= 0) return setMsg("Ingresa un monto válido.");

    const requiereDoc = !!concept?.requiereDoc;
    const requiereRespaldo = !!concept?.requiereRespaldo;

    if (requiereDoc && (docTipo === "SinDoc" || !docNumero.trim())) {
      return setMsg("Este concepto requiere documento (tipo y número).");
    }

    setBusy(true);
    try {
      const gastoId = uuid();
      const isoFecha = new Date(fecha + "T12:00:00").toISOString();

      const expense = {
        gastoId,
        fecha: isoFecha,
        conceptId,
        monto: Math.round(Number(monto)),
        docTipo,
        docNumero: docNumero.trim(),
        detalle: detalle.trim(),
        crCodigo,
        ctaCodigo,
        partidaCodigo,
        clasificacionCodigo: (clasificacionCodigo || "").trim(),
        estado: "pendiente",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        source: transferIds.length ? { type: "transfers", transferIds } : undefined,
      };

      await addExpense(expense);

      // Adjuntos (si vienen)
      const fileList = files || [];
      if (fileList.length) {
        for (const f of fileList) {
          const compressed = await compressImageFile(f, { maxDim: 1600, quality: 0.82 });
          await addAttachment({
            gastoId,
            filename: compressed.name,
            mimeType: compressed.type,
            blob: compressed,
          });
        }
      } else if (requiereRespaldo) {
        // solo aviso (no bloquea en MVP)
        setMsg("Guardado, pero OJO: este concepto requiere respaldo. Agrega foto al editar (MVP).");
      }

      // Si venía desde Traslados: marcar usados y volver a Traslados
      if (transferIds.length > 0) {
        await markTransfersUsed({ transferIds, gastoId });

        setMsg("✅ Gasto guardado. Volviendo a traslados...");
        setTimeout(() => {
          navigate("/traslados", { replace: true });
        }, 250);
        return;
      }

      // Si NO venía desde traslados: reset normal
      setMonto("");
      setDocNumero("");
      setDetalle(concept?.nombre || "");
      setMsg("✅ Gasto guardado.");
    } catch (e) {
      console.error(e);
      setMsg("Error al guardar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h2>Nuevo gasto</h2>

      {transferIds.length > 0 && (
        <div
          className="small"
          style={{
            padding: 10,
            border: "1px solid rgba(255,255,255,.12)",
            borderRadius: 12,
          }}
        >
          Generado desde traslados: <b>{transferIds.length}</b>
        </div>
      )}

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
          value={conceptId}
          onChange={setConceptId}
          options={conceptOptions}
          placeholder="Seleccione concepto..."
        />
        <TextField label="Fecha" type="date" value={fecha} onChange={setFecha} />
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <TextField label="Monto ($)" type="number" value={monto} onChange={setMonto} placeholder="Ej: 12500" />
        <SelectField
          label="Tipo Doc"
          value={docTipo}
          onChange={setDocTipo}
          options={DOC_TYPES.map((x) => ({ value: x, label: x }))}
        />
        <TextField label="N° Doc" value={docNumero} onChange={setDocNumero} placeholder="Ej: 123456" />
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <label>Detalle / Glosa</label>
          <textarea
            className="input"
            rows={2}
            value={detalle}
            onChange={(e) => setDetalle(e.target.value)}
            placeholder="Ej: Combustible - Coquimbo - auto arrendado"
          />
        </div>
      </div>

      <hr />

      <div className="row">
        <SelectField
          label="Centro de Responsabilidad (CR)"
          value={crCodigo}
          onChange={setCrCodigo}
          options={crs.map((x) => ({ value: x.crCodigo, label: `${x.crCodigo} - ${x.crNombre}` }))}
          placeholder={settings?.crDefaultCodigo ? "CR por defecto" : "Seleccione CR..."}
        />
        <SelectField
          label="Cuenta Contable"
          value={ctaCodigo}
          onChange={setCtaCodigo}
          options={accts.map((x) => ({ value: x.ctaCodigo, label: `${x.ctaCodigo} - ${x.ctaNombre}` }))}
          placeholder="Seleccione cuenta..."
        />
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <SelectField
          label="Partida"
          value={partidaCodigo}
          onChange={setPartidaCodigo}
          options={parts.map((x) => ({ value: x.partidaCodigo, label: `${x.partidaCodigo} - ${x.partidaNombre}` }))}
          placeholder="Seleccione partida..."
        />
        <TextField
          label="Clasificación (código)"
          value={clasificacionCodigo}
          onChange={setClasificacionCodigo}
          placeholder="(opcional por ahora)"
        />
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <FileCapture onFiles={(files) => handleSave(files)} />
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn" disabled={busy} onClick={() => handleSave([])}>
          {busy ? "Guardando..." : "Guardar (sin foto)"}
        </button>
      </div>

      <div className="small" style={{ marginTop: 10 }}>
        Nota: este MVP guarda fotos en IndexedDB como archivo comprimido. En iOS puede requerir espacio.
      </div>
    </div>
  );
}
