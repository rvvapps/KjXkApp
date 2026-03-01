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
} from "../db.js";
import { buildExportItems, exportBatchXlsx, splitIntoBatches } from "../services/excelExport.js";
import { exportReceiptsPdf } from "../services/pdfExport.js";

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

  const isLocked = useMemo(() => reim?.estado === "enviada" || reim?.estado === "aprobada", [reim]);

  const total = useMemo(() => {
    return (expenses || []).reduce((acc, e) => acc + (Number(e.monto) || 0), 0);
  }, [expenses]);

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
        {reim.estado === "borrador" && (
          <button className="btn" disabled={busy} onClick={async () => {
            setBusy(true);
            setMsg("");
            try {
              await sendReimbursement({ rendicionId: reim.rendicionId });
              setReim(await getReimbursement(reim.rendicionId));
              setMsg("✅ Rendición marcada como ENVIADA (gastos congelados).");
            } catch (e) {
              console.error(e);
              setMsg("❌ No se pudo enviar. Revisa la consola (F12).");
            } finally {
              setBusy(false);
            }
          }}>Enviar</button>
        )}
        {reim.estado === "enviada" && (
          <>
            <button className="btn" disabled={busy} onClick={async () => {
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
            }}>Marcar devuelta</button>
            <button className="btn" disabled={busy} onClick={async () => {
              const ok = window.confirm("¿Aprobar esta rendición?\n\nQuedará cerrada y ya no se podrá re-exportar ni editar.");
              if (!ok) return;
              setBusy(true);
              setMsg("");
              try {
                await approveReimbursement({ rendicionId: reim.rendicionId });
                setReim(await getReimbursement(reim.rendicionId));
                setMsg("✅ Rendición APROBADA.");
              } catch (e) {
                console.error(e);
                setMsg("❌ No se pudo aprobar. Revisa la consola (F12).");
              } finally {
                setBusy(false);
              }
            }}>Aprobar</button>
          </>
        )}
        {reim.estado === "devuelta" && (
          <button className="btn" disabled={busy} onClick={async () => {
            setBusy(true);
            setMsg("");
            try {
              await sendReimbursement({ rendicionId: reim.rendicionId });
              setReim(await getReimbursement(reim.rendicionId));
              setMsg("✅ Rendición re-enviada como ENVIADA (gastos congelados).");
            } catch (e) {
              console.error(e);
              setMsg("❌ No se pudo re-enviar. Revisa la consola (F12).");
            } finally {
              setBusy(false);
            }
          }}>Re-enviar</button>
        )}
          </button>
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
                {isLocked ? (
                  <span className="btn secondary" style={{ opacity: 0.6, cursor: "not-allowed" }}>Editar</span>
                ) : (
                  <Link className="btn secondary" to={`/gastos/${e.gastoId || e.id}`}>Editar</Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
