import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  getReimbursement,
  listReimbursementItems,
  getExpense,
  cancelReimbursement,
  sendReimbursement,
  returnReimbursement,
  approveReimbursement,
  setReimbursementSnapshot,
  listAttachmentsForExpense,
  listConcepts,
} from "../db.js";
import {
  buildExportItems,
  exportBatchXlsx,
  splitIntoBatches,
  generateBatchXlsxBlob,
} from "../services/excelExport.js";
import {
  exportReceiptsPdf,
  generateReceiptsPdfBlob,
} from "../services/pdfExport.js";

function downloadSnapshotBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function ReimbursementDetail() {
  const { rendicionId } = useParams();
  const nav = useNavigate();

  const [reim, setReim] = useState(null);
  const [items, setItems] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const r = await getReimbursement(rendicionId);
      setReim(r);

      const its = await listReimbursementItems(rendicionId);
      setItems(its);

      const exps = [];
      for (const it of its) {
        const e = await getExpense(it.gastoId);
        if (e) exps.push({ ...e, _orden: it.orden ?? 0 });
      }
      exps.sort((a, b) => (a._orden ?? 0) - (b._orden ?? 0));
      setExpenses(exps);
    })();
  }, [rendicionId]);

  const total = useMemo(() => {
    return (expenses || []).reduce((acc, e) => acc + (Number(e.monto) || 0), 0);
  }, [expenses]);

  // 🔒 Validación fuerte (misma lógica que en "Crear rendición")
  async function validateBeforeStateChange(gastoIds) {
    const concepts = await listConcepts(); // activos
    const conceptById = new Map(concepts.map((c) => [c.conceptId, c]));
    const problems = [];

    for (const id of gastoIds) {
      const exp = await getExpense(id);
      if (!exp) continue;

      const labelBase =
        String(exp.docNumero || "").trim()
          ? `${exp.docTipo || "Doc"} ${String(exp.docNumero).trim()}`
          : exp.detalle || "Gasto";

      if (!exp.monto || Number(exp.monto) <= 0) {
        problems.push(`Monto inválido (<= 0) en: "${labelBase}"`);
      }

      if (!exp.fecha) {
        problems.push(`Falta fecha en: "${labelBase}"`);
      }

      if (!String(exp.docTipo || "").trim()) {
        problems.push(`Falta Tipo Doc en: "${labelBase}"`);
      }

      if (!String(exp.crCodigo || "").trim()) {
        problems.push(`Falta Centro de Responsabilidad (CR) en: "${labelBase}"`);
      }

      if (!String(exp.ctaCodigo || "").trim()) {
        problems.push(`Falta Cuenta Contable en: "${labelBase}"`);
      }

      if (!String(exp.partidaCodigo || "").trim()) {
        problems.push(`Falta Partida en: "${labelBase}"`);
      }

      const concept = conceptById.get(exp.conceptId);
      const requiereDoc = !!concept?.requiereDoc;
      const requiereRespaldo = !!concept?.requiereRespaldo;

      if (requiereDoc) {
        if (String(exp.docTipo || "") !== "SinDoc" && !String(exp.docNumero || "").trim()) {
          problems.push(`Falta N° Doc en: "${labelBase}"`);
        }
        const noDoc = exp.docTipo === "SinDoc" || !String(exp.docNumero || "").trim();
        if (noDoc) {
          problems.push(`Falta documento (tipo/número) en: "${exp.detalle || "Gasto"}"`);
        }
      }

      if (requiereRespaldo) {
        const atts = await listAttachmentsForExpense(id);
        if (!atts || atts.length === 0) {
          problems.push(`Falta respaldo (foto) en: "${labelBase}"`);
        }
      }
    }

    return problems;
  }

  function formatProblemsBlock(title, problems) {
    const first = problems.slice(0, 6).map((p) => `• ${p}`).join("\n");
    const more = problems.length > 6 ? `\n…y ${problems.length - 6} más.` : "";
    return `❌ ${title}\n\nCorrige estos puntos:\n${first}${more}\n\nTip: entra a “Editar” el gasto con problema, corrige y vuelve a intentar.`;
  }

  async function reExport() {
    if (!reim) return;
    setMsg("");
    setBusy(true);
    try {
      // Orden canónico de gastoIds según reimbursement_items.orden
      const gastoIds = (items || [])
        .slice()
        .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
        .map((it) => it.gastoId);

      // Excel por lotes
      const exportItems = await buildExportItems(gastoIds);
      const batches = splitIntoBatches(exportItems);

      for (let i = 0; i < batches.length; i++) {
        const corr = batches.length === 1 ? reim.correlativo : `${reim.correlativo}_P${i + 1}`;
        await exportBatchXlsx({ correlativo: corr, items: batches[i] });

        // PDF por batch
        const batchIds = gastoIds.slice(i * 42, i * 42 + 42);
        await exportReceiptsPdf({ correlativo: corr, orderedGastoIds: batchIds });
      }

      setMsg("✅ Exportación lista (Excel + PDF).");
    } catch (e) {
      console.error(e);
      setMsg("❌ Error al exportar. Revisa la consola (F12).");
    } finally {
      setBusy(false);
    }
  }

  async function onCancelDraft() {
    if (!reim) return;

    const ok = window.confirm(`¿Cancelar este borrador?

Esto eliminará la rendición y devolverá sus gastos a 'pendiente'.`);
    if (!ok) return;

    setBusy(true);
    setMsg("");
    try {
      await cancelReimbursement({ rendicionId: reim.rendicionId });
      setMsg("✅ Borrador cancelado.");
      nav("/rendiciones");
    } catch (e) {
      console.error(e);
      setMsg("❌ No se pudo cancelar el borrador. Revisa la consola (F12).");
    } finally {
      setBusy(false);
    }
  }

  if (!reim) {
    return (
      <div className="card">
        <h2>Rendición</h2>
        <div className="small">Cargando...</div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="row" style={{ alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h2 style={{ marginBottom: 6 }}>Rendición {reim.correlativo}</h2>
          <div className="small">
            Estado: <span className="pill">{reim.estado}</span> · Creada:{" "}
            {reim.fechaCreacion ? new Date(reim.fechaCreacion).toLocaleString("es-CL") : "—"} · Total:{" "}
            ${total.toLocaleString("es-CL")}
          </div>
        </div>

        <div className="row" style={{ gap: 8 }}>
          <Link className="btn secondary" to="/rendiciones">Volver</Link>

          <button className="btn" onClick={reExport} disabled={busy || reim.estado === "aprobada"}>
            {busy ? "Procesando..." : "Re-exportar Excel/PDF"}
          </button>

          {reim.estado === "borrador" && (
            <button
              className="btn"
              onClick={async () => {
                setBusy(true);
                setMsg("");
                try {
                  const gastoIds = (items || [])
                    .slice()
                    .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
                    .map((it) => it.gastoId);

                  const problems = await validateBeforeStateChange(gastoIds);
                  if (problems.length > 0) {
                    setMsg(formatProblemsBlock("No puedes enviar la rendición.", problems));
                    return;
                  }

                  await sendReimbursement({ rendicionId: reim.rendicionId });
                  setReim(await getReimbursement(reim.rendicionId));
                  setMsg("✅ Rendición marcada como ENVIADA (gastos congelados).");
                } catch (e) {
                  console.error(e);
                  setMsg("❌ No se pudo enviar. Revisa la consola (F12).");
                } finally {
                  setBusy(false);
                }
              }}
              disabled={busy}
            >
              Enviar rendición
            </button>
          )}

          {reim.estado === "enviada" && (
            <>
              <button
                className="btn"
                onClick={async () => {
                  const motivo = window.prompt("Motivo de devolución (opcional):", "") ?? "";
                  setBusy(true);
                  setMsg("");
                  try {
                    await returnReimbursement({ rendicionId: reim.rendicionId, motivo });
                    setReim(await getReimbursement(reim.rendicionId));
                    setMsg("✅ Rendición marcada como DEVUELTA (ya se puede editar).");
                  } catch (e) {
                    console.error(e);
                    setMsg("❌ No se pudo marcar devuelta. Revisa la consola (F12).");
                  } finally {
                    setBusy(false);
                  }
                }}
                disabled={busy}
              >
                Marcar devuelta
              </button>

              <button
                className="btn"
                onClick={async () => {
                  const ok = window.confirm(
                    "¿Aprobar esta rendición?\n\nSe guardará un 'snapshot' (Excel/PDF) y quedará cerrada sin re-export."
                  );
                  if (!ok) return;

                  setBusy(true);
                  setMsg("");
                  try {
                    const gastoIds = (items || [])
                      .slice()
                      .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
                      .map((it) => it.gastoId);

                    const problems = await validateBeforeStateChange(gastoIds);
                    if (problems.length > 0) {
                      setMsg(formatProblemsBlock("No puedes aprobar la rendición.", problems));
                      return;
                    }

                    // Snapshot SOLO al aprobar (B)
                    if (!reim.snapshotExcelBlob || !reim.snapshotPdfBlob) {
                      const exportItems = await buildExportItems(gastoIds);
                      const batches = splitIntoBatches(exportItems);
                      const firstBatchItems = batches[0] || [];
                      const firstBatchIds = gastoIds.slice(0, 42);
                      const corr = reim.correlativo;

                      const xlsxBlob = await generateBatchXlsxBlob({ correlativo: corr, items: firstBatchItems });
                      const pdfBlob = await generateReceiptsPdfBlob({ correlativo: corr, orderedGastoIds: firstBatchIds });

                      await setReimbursementSnapshot({
                        rendicionId: reim.rendicionId,
                        excelBlob: xlsxBlob,
                        pdfBlob,
                        exportedAt: new Date().toISOString(),
                      });
                    }

                    await approveReimbursement({ rendicionId: reim.rendicionId });
                    setReim(await getReimbursement(reim.rendicionId));
                    setMsg("✅ Rendición APROBADA. Puedes descargar el PDF/Excel guardado.");
                  } catch (e) {
                    console.error(e);
                    setMsg("❌ No se pudo aprobar. Revisa la consola (F12).");
                  } finally {
                    setBusy(false);
                  }
                }}
                disabled={busy}
              >
                Aprobar
              </button>
            </>
          )}

          {reim.estado === "devuelta" && (
            <button
              className="btn"
              onClick={async () => {
                setBusy(true);
                setMsg("");
                try {
                  const gastoIds = (items || [])
                    .slice()
                    .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
                    .map((it) => it.gastoId);

                  const problems = await validateBeforeStateChange(gastoIds);
                  if (problems.length > 0) {
                    setMsg(formatProblemsBlock("No puedes re-enviar la rendición.", problems));
                    return;
                  }

                  await sendReimbursement({ rendicionId: reim.rendicionId });
                  setReim(await getReimbursement(reim.rendicionId));
                  setMsg("✅ Rendición re-enviada como ENVIADA (gastos congelados).");
                } catch (e) {
                  console.error(e);
                  setMsg("❌ No se pudo re-enviar. Revisa la consola (F12).");
                } finally {
                  setBusy(false);
                }
              }}
              disabled={busy}
            >
              Re-enviar
            </button>
          )}

          {(reim.estado === "aprobada" || reim.snapshotExcelBlob || reim.snapshotPdfBlob) && (
            <>
              {reim.snapshotExcelBlob && (
                <button
                  className="btn secondary"
                  onClick={() => downloadSnapshotBlob(reim.snapshotExcelBlob, `Rendicion_${reim.correlativo}.xlsx`)}
                  disabled={busy}
                >
                  Descargar Excel guardado
                </button>
              )}
              {reim.snapshotPdfBlob && (
                <button
                  className="btn secondary"
                  onClick={() => downloadSnapshotBlob(reim.snapshotPdfBlob, `Respaldos_${reim.correlativo}.pdf`)}
                  disabled={busy}
                >
                  Descargar PDF guardado
                </button>
              )}
            </>
          )}

          {reim.estado === "borrador" && (
            <button className="btn danger" onClick={onCancelDraft} disabled={busy}>
              Cancelar borrador
            </button>
          )}
        </div>
      </div>

      {(reim.estado === "enviada" || reim.estado === "aprobada") && (
        <pre style={{ whiteSpace: "pre-wrap", marginTop: 12, background: "#fff7ed", padding: 10, borderRadius: 8 }}>
          🔒 Esta rendición está {reim.estado.toUpperCase()}. Los gastos quedan congelados hasta estado DEVUELTA.
        </pre>
      )}

      {msg && (
        <pre style={{ whiteSpace: "pre-wrap", marginTop: 12, background: "#f8fafc", padding: 10, borderRadius: 8 }}>
          {msg}
        </pre>
      )}

      <h3 style={{ marginTop: 18 }}>Gastos incluidos</h3>
      {expenses.length === 0 ? (
        <div className="small">No hay gastos asociados a esta rendición.</div>
      ) : (
        <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
          {expenses.map((e) => (
            <div key={e.gastoId || e.id} className="card" style={{ border: "1px solid #e5e7eb" }}>
              <div className="row" style={{ alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontWeight: 800 }}>
                    {e.docTipo || "Doc"} {e.docNumero || ""} · ${Number(e.monto || 0).toLocaleString("es-CL")}
                  </div>
                  <div className="small">
                    {e.detalle || e.glosa || "—"} · Fecha: {e.fechaISO || e.fecha || "—"}
                  </div>
                </div>
                {(reim.estado === "enviada" || reim.estado === "aprobada") ? (
                  <span className="btn secondary" style={{ opacity: 0.6, cursor: "not-allowed" }}>
                    Editar
                  </span>
                ) : (
                  <Link className="btn secondary" to={`/gastos/${e.gastoId || e.id}`}>
                    Editar
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
