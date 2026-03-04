import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  DOC_TYPES,
  getExpense,
  updateExpense,
  deleteExpense,
  listConcepts,
  listActiveCR,
  listActiveAccounts,
  listActivePartidas,
  listActiveClasificaciones,
  listAttachmentsForExpense,
  addAttachment,
  deleteAttachment,
  isExpenseLockedByReimbursement,
} from "../db.js";
import SelectField from "../components/SelectField.jsx";
import TextField from "../components/TextField.jsx";
import FileCapture from "../components/FileCapture.jsx";
import { prepareReceiptImage } from "../services/image.js";


function AttachmentGallery({ atts, locked, onRemove }) {
  const [lightbox, setLightbox] = React.useState(null); // { url, filename }

  // Generar object URLs desde blobs
  const items = React.useMemo(() => {
    return atts.map((a) => ({
      ...a,
      objectUrl: a.blob ? URL.createObjectURL(a.blob) : null,
      isImage: a.mimeType?.startsWith("image/") ?? true,
    }));
  }, [atts]);

  // Limpiar URLs al desmontar
  React.useEffect(() => {
    return () => { items.forEach((i) => { if (i.objectUrl) URL.revokeObjectURL(i.objectUrl); }); };
  }, [items]);

  if (atts.length === 0) return <div className="small">Sin respaldos.</div>;

  return (
    <>
      {/* Galería de thumbnails */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 8 }}>
        {items.map((a) => (
          <div key={a.adjuntoId} style={{ position: "relative" }}>
            {a.objectUrl && a.isImage ? (
              <img
                src={a.objectUrl}
                alt={a.filename}
                title={a.filename}
                onClick={() => setLightbox({ url: a.objectUrl, filename: a.filename })}
                style={{
                  width: 90, height: 90, objectFit: "cover",
                  borderRadius: 10, cursor: "zoom-in",
                  border: "2px solid rgba(255,255,255,.15)",
                  display: "block",
                }}
              />
            ) : (
              // Fallback para PDFs u otros tipos
              <div
                onClick={() => a.objectUrl && window.open(a.objectUrl, "_blank")}
                style={{
                  width: 90, height: 90, borderRadius: 10,
                  background: "rgba(255,255,255,.08)",
                  border: "2px solid rgba(255,255,255,.15)",
                  display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center",
                  cursor: "pointer", gap: 4,
                }}
              >
                <span style={{ fontSize: 28 }}>📄</span>
                <span className="small" style={{ fontSize: 10, textAlign: "center", padding: "0 4px", wordBreak: "break-all" }}>
                  {a.filename?.slice(0, 12)}
                </span>
              </div>
            )}
            {!locked && (
              <button
                onClick={() => onRemove(a.adjuntoId)}
                title="Eliminar respaldo"
                style={{
                  position: "absolute", top: -6, right: -6,
                  width: 22, height: 22, borderRadius: "50%",
                  background: "#ef4444", border: "none",
                  color: "#fff", fontSize: 13, fontWeight: 900,
                  cursor: "pointer", display: "flex",
                  alignItems: "center", justifyContent: "center",
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 9999,
            background: "rgba(0,0,0,.92)",
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            padding: 16,
          }}
        >
          <img
            src={lightbox.url}
            alt={lightbox.filename}
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: "100%", maxHeight: "85vh",
              borderRadius: 12, objectFit: "contain",
              boxShadow: "0 8px 40px rgba(0,0,0,.6)",
            }}
          />
          <div style={{ marginTop: 12, display: "flex", gap: 12, alignItems: "center" }}>
            <span className="small" style={{ color: "rgba(255,255,255,.7)" }}>{lightbox.filename}</span>
            <a
              href={lightbox.url}
              download={lightbox.filename}
              onClick={(e) => e.stopPropagation()}
              className="btn secondary"
              style={{ fontSize: 13 }}
            >
              Descargar
            </a>
            <button
              className="btn secondary"
              onClick={() => setLightbox(null)}
              style={{ fontSize: 13 }}
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default function EditExpense() {
  const { gastoId } = useParams();
  const nav = useNavigate();

  const [expense, setExpense] = useState(null); // null = cargando, undefined = no encontrado
  const [concepts, setConcepts] = useState([]);
  const [crs, setCrs] = useState([]);
  const [accts, setAccts] = useState([]);
  const [parts, setParts] = useState([]);
  const [clasifs, setClasifs] = useState([]);
  const [atts, setAtts] = useState([]);

  const prevConceptIdRef = useRef(null);

  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState(false);
  const [lockReason, setLockReason] = useState("");

  useEffect(() => {
    (async () => {
      const e = await getExpense(gastoId);
      setExpense(e ?? undefined);
      setConcepts(await listConcepts());
      setCrs(await listActiveCR());
      setAccts(await listActiveAccounts());
      setParts(await listActivePartidas());
      setClasifs(await listActiveClasificaciones());
      setAtts(await listAttachmentsForExpense(gastoId));

      // FIX: evaluar el lock apenas se carga el gasto
      if (e) {
        const isLocked = await isExpenseLockedByReimbursement(e);
        setLocked(isLocked);
        if (isLocked) {
          setLockReason("Este gasto pertenece a una rendición enviada o aprobada. No se puede editar hasta que sea devuelta.");
        }
      }
    })();
  }, [gastoId]);

  const concept = useMemo(
    () => concepts.find((c) => c.conceptId === expense?.conceptId) || null,
    [concepts, expense]
  );

  // Si cambia el concepto en edición, aplicar defaults de forma "segura"
  useEffect(() => {
    if (!expense) return;
    if (concepts.length === 0) return;

    const currentId = expense.conceptId || "";
    const prevId = prevConceptIdRef.current;

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

  async function save() {
    if (locked) {
      setMsg("❌ No puedes editar este gasto: está congelado (rendición enviada/aprobada).");
      return;
    }
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
      if (!atts || atts.length === 0) {
        setMsg("✅ Gasto guardado sin imagen.");
      } else {
        setMsg("✅ Guardado.");
      }
    } catch (e) {
      console.error(e);
      setMsg("Error al guardar.");
    } finally {
      setBusy(false);
    }
  }

  async function addFiles(files) {
    if (locked) {
      setMsg("❌ No puedes modificar respaldos: el gasto está congelado (rendición enviada/aprobada).");
      return;
    }
    setMsg("");
    setBusy(true);
    try {
      for (const f of files) {
        const prepared = await prepareReceiptImage(f);
        await addAttachment({
          gastoId,
          filename: prepared.filename,
          mimeType: prepared.mimeType,
          blob: prepared.blob,
          width: prepared.width,
          height: prepared.height,
          contentHash: prepared.contentHash,
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
    if (locked) {
      setMsg("❌ No puedes eliminar respaldos: el gasto está congelado (rendición enviada/aprobada).");
      return;
    }
    if (!confirm("¿Eliminar este respaldo?")) return;
    await deleteAttachment(adjuntoId);
    setAtts(await listAttachmentsForExpense(gastoId));
  }

  async function handleDelete() {
    if (!confirm("¿Eliminar este gasto y sus adjuntos? Esta acción no se puede deshacer.")) return;
    try {
      await deleteExpense(gastoId);
      nav("/", { replace: true });
    } catch (e) {
      const code = e?.code || e?.message || "error";
      if (code === "not_deletable") {
        setMsg(`❌ No se puede eliminar: el gasto está en estado "${e.estado}".`);
      } else if (code === "not_found") {
        setMsg("❌ Gasto no encontrado.");
      } else {
        setMsg(`❌ Error al eliminar: ${code}`);
      }
    }
  }

  return (
    <div className="card">
      <h2>Editar gasto</h2>

      {locked && (
        <div
          style={{
            background: "rgba(239,68,68,.15)",
            border: "1px solid rgba(239,68,68,.35)",
            borderRadius: 12,
            padding: "10px 14px",
            marginBottom: 12,
          }}
        >
          🔒 <b>Gasto congelado:</b> <span className="small">{lockReason}</span>
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
          <span style={msg.includes("sin imagen") ? { color: "#facc15", fontWeight: 800 } : {}}>{msg}</span>
        </div>
      )}

      <div className="row" style={{ marginTop: 12 }}>
        <SelectField
          label="Concepto"
          value={expense.conceptId}
          onChange={(v) => !locked && setExpense({ ...expense, conceptId: v })}
          options={concepts.map((c) => ({ value: c.conceptId, label: c.nombre }))}
          placeholder="Seleccione..."
        />
        <TextField
          label="Fecha"
          type="date"
          value={new Date(expense.fecha).toISOString().slice(0, 10)}
          onChange={(v) => {
            if (locked) return;
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
          onChange={(v) => !locked && setExpense({ ...expense, monto: v })}
        />
        <SelectField
          label="Tipo Doc"
          value={expense.docTipo}
          onChange={(v) => !locked && setExpense({ ...expense, docTipo: v })}
          options={DOC_TYPES.map((x) => ({ value: x, label: x }))}
        />
        <TextField
          label="N° Doc"
          value={expense.docNumero || ""}
          onChange={(v) => !locked && setExpense({ ...expense, docNumero: v })}
        />
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <label>Detalle / Glosa</label>
          <textarea
            className="input"
            rows={2}
            value={expense.detalle || ""}
            disabled={locked}
            onChange={(e) => setExpense({ ...expense, detalle: e.target.value })}
          />
        </div>
      </div>

      <hr />

      <div className="row">
        <SelectField
          label="Centro de Responsabilidad (CR)"
          value={expense.crCodigo}
          onChange={(v) => !locked && setExpense({ ...expense, crCodigo: v })}
          options={crs.map((x) => ({ value: x.crCodigo, label: `${x.crCodigo} - ${x.crNombre}` }))}
          placeholder="Seleccione..."
        />
        <SelectField
          label="Cuenta Contable"
          value={expense.ctaCodigo}
          onChange={(v) => !locked && setExpense({ ...expense, ctaCodigo: v })}
          options={accts.map((x) => ({ value: x.ctaCodigo, label: `${x.ctaCodigo} - ${x.ctaNombre}` }))}
          placeholder="Seleccione..."
        />
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <SelectField
          label="Partida"
          value={expense.partidaCodigo || ""}
          onChange={(v) => !locked && setExpense({ ...expense, partidaCodigo: v })}
          options={parts.map((x) => ({ value: x.partidaCodigo, label: `${x.partidaCodigo} - ${x.partidaNombre}` }))}
          placeholder="Seleccione..."
        />
        <SelectField
          label="Clasificación"
          value={expense.clasificacionCodigo || ""}
          onChange={(v) => !locked && setExpense({ ...expense, clasificacionCodigo: v })}
          options={clasifs.map((x) => ({ value: x.clasificacionCodigo, label: `${x.clasificacionCodigo} - ${x.clasificacionNombre}` }))}
          placeholder="Sin clasificación..."
        />
      </div>

      <hr />

      <h3>Respaldos</h3>
      <AttachmentGallery atts={atts} locked={locked} onRemove={removeAtt} />

      <div className="row" style={{ marginTop: 12 }}>
        {locked ? (
          <div className="small">🔒 No se pueden agregar respaldos mientras la rendición esté ENVIADA/APROBADA.</div>
        ) : (
          <FileCapture onFiles={addFiles} />
        )}
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn" disabled={busy || locked} onClick={save}>
          {busy ? "Guardando..." : "Guardar cambios"}
        </button>
        <button className="btn secondary" onClick={() => nav(-1)}>
          Volver
        </button>
        {!locked && (
          <button className="btn danger" onClick={handleDelete}>
            Eliminar gasto
          </button>
        )}
      </div>
    </div>
  );
}
