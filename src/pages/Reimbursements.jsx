import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  createReimbursement,
  addReimbursementItems,
  markExpensesReimbursed,
  listPendingExpenses,
  getSettings,
  saveSettings,
  listReimbursements,
  listAttachmentsForExpense,
  listConcepts,
  getExpense, // ✅ IMPORTANTE: lo traemos directo, sin dynamic import
} from "../db.js";
import { buildExportItems, exportBatchXlsx, splitIntoBatches } from "../services/excelExport.js";
import { exportReceiptsPdf } from "../services/pdfExport.js";


function pad(n, width = 4) {
  return String(n).padStart(width, "0");
}

export default function Reimbursements() {
  const [pending, setPending] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [settings, setSettings] = useState(null);
  const [reims, setReims] = useState([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      setPending(await listPendingExpenses());
      setSettings(await getSettings());
      setReims(await listReimbursements());
    })();
  }, []);

  const totalSelected = useMemo(() => {
    let s = 0;
    for (const e of pending) if (selected.has(e.gastoId)) s += Number(e.monto) || 0;
    return s;
  }, [pending, selected]);

  function toggle(id) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  // ✅ Validación BLOQUEANTE
  async function validateBeforeExport(gastoIds) {
    const concepts = await listConcepts(); // activos
    const conceptById = new Map(concepts.map((c) => [c.conceptId, c]));

    const problems = [];

    for (const id of gastoIds) {
      const exp = await getExpense(id);
      if (!exp) continue;

      const concept = conceptById.get(exp.conceptId);
      const requiereDoc = !!concept?.requiereDoc;
      const requiereRespaldo = !!concept?.requiereRespaldo;

      if (requiereDoc) {
        const noDoc = exp.docTipo === "SinDoc" || !String(exp.docNumero || "").trim();
        if (noDoc) {
          problems.push({
            gastoId: id,
            tipo: "DOC",
            msg: `Falta documento (tipo/número) en: "${exp.detalle || "Gasto"}"`,
          });
        }
      }

      if (requiereRespaldo) {
        const atts = await listAttachmentsForExpense(id);
        if (!atts || atts.length === 0) {
          problems.push({
            gastoId: id,
            tipo: "RESPALDO",
            msg: `Falta respaldo (foto) en: "${exp.detalle || "Gasto"}"`,
          });
        }
      }
    }

    return problems;
  }

  async function createAndExport() {
    setMsg("");
    const gastoIds = Array.from(selected);
    if (gastoIds.length === 0) return setMsg("Selecciona al menos un gasto.");

    setBusy(true);
    try {
      // ✅ Validar antes de crear/guardar rendición
      const problems = await validateBeforeExport(gastoIds);
      if (problems.length > 0) {
        const first = problems.slice(0, 6).map((p) => `• ${p.msg}`).join("\n");
        const more = problems.length > 6 ? `\n…y ${problems.length - 6} más.` : "";
        setMsg(
          `❌ No puedes crear la rendición todavía.\n\n` +
            `Corrige estos puntos:\n${first}${more}\n\n` +
            `Tip: usa el botón “Editar” en el gasto con problema, corrige y vuelve a intentar.`
        );
        return;
      }

      const prefix = settings?.correlativoPrefix || "RC";
      const num = settings?.correlativoNextNumber || 1;
      const correlativo = `${prefix}-${new Date().getFullYear()}-${pad(num, 4)}`;

      // Crear rendición
      const rendicionId = await createReimbursement({ correlativo });
      await addReimbursementItems({ rendicionId, gastoIds });

      // Marcar gastos rendidos
      await markExpensesReimbursed({ gastoIds, rendicionId });

      // Avanzar correlativo
      await saveSettings({ correlativoNextNumber: num + 1 });
      setSettings(await getSettings());

      // Export Excel por lotes (42 items)
      const exportItems = await buildExportItems(gastoIds);
      const batches = splitIntoBatches(exportItems);

      for (let i = 0; i < batches.length; i++) {
        const corr = batches.length === 1 ? correlativo : `${correlativo}_P${i + 1}`;
        await exportBatchXlsx({ correlativo: corr, items: batches[i] });

        // PDF por batch, alineado al orden
        const batchIds = gastoIds.slice(i * 42, i * 42 + 42);
        await exportReceiptsPdf({ correlativo: corr, orderedGastoIds: batchIds });
      }

      setMsg("✅ Rendición creada y exportada (Excel + PDF).");
      setSelected(new Set());
      setPending(await listPendingExpenses());
      setReims(await listReimbursements());
    } catch (e) {
      console.error(e);
      setMsg("Error al crear/exportar rendición. Revisa la consola (F12) en el navegador.");
      // ✅ Importante: aunque falle un export, la rendición puede haber quedado creada en IndexedDB.
      // Refrescamos listas para que el borrador quede accesible.
      setPending(await listPendingExpenses());
      setReims(await listReimbursements());
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid2">
      <div className="card">
        <h2>Crear rendición</h2>
        <div className="small">Selecciona gastos pendientes y exporta en tu formato.</div>

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
          <div style={{ flex: 1 }}>
            <div className="small">Seleccionados</div>
            <div className="kpi">{selected.size}</div>
          </div>
          <div style={{ flex: 1 }}>
            <div className="small">Total</div>
            <div className="kpi">${totalSelected.toLocaleString("es-CL")}</div>
          </div>
        </div>

        <hr />

        <button className="btn" disabled={busy} onClick={createAndExport}>
          {busy ? "Exportando..." : "Crear rendición + Exportar Excel/PDF"}
        </button>

        <hr />

<h3>Pendientes</h3>
{pending.length === 0 ? (
  <div className="small">No hay gastos pendientes 🎉</div>
) : (
  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
    {pending
      .slice()
      .sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""))
      .map((e) => (
        <div key={e.gastoId} className="card" style={{ padding: 12 }}>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 800 }}>{e.detalle || "Gasto"}</div>
              
              {/* TEMP: mostrar ID */}
              <div className="small">ID: {e.gastoId}</div>
              
              <div className="small">
                {new Date(e.fecha).toLocaleDateString("es-CL")} · {e.docTipo} {e.docNumero || ""} · CR {e.crCodigo} ·
                CTA {e.ctaCodigo} · Part {e.partidaCodigo}
              </div>
            </div>

            <div style={{ textAlign: "right" }}>
              <div style={{ fontWeight: 900 }}>${Number(e.monto || 0).toLocaleString("es-CL")}</div>

              <div className="row" style={{ justifyContent: "flex-end", marginTop: 8 }}>
                {/* Botón Editar */}
                <Link className="btn secondary" to={`/gastos/${e.gastoId}`}>
                  Editar
                </Link>

                {/* Checkbox incluir */}
                <label style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={selected.has(e.gastoId)}
                    onChange={() => toggle(e.gastoId)}
                  />
                  <span className="small">Incluir</span>
                </label>
              </div>
            </div>
          </div>
        </div>
      ))}
  </div>
)}
      </div>

      <div className="card">
        <h2>Historial</h2>
        {reims.length === 0 ? (
          <div className="small">Aún no hay rendiciones.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {reims.map((r) => (
              <div key={r.rendicionId} className="card" style={{ padding: 12 }}>
                <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 900 }}>{r.correlativo}</div>
                    <div className="small">{new Date(r.fechaCreacion).toLocaleString("es-CL")}</div>
                  </div>
                  <span className="pill">{r.estado}</span>
                </div>
                <div className="small" style={{ marginTop: 8 }}>
                  Click para abrir la rendición (Borrador/Enviada) y re-exportar Excel/PDF.
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
