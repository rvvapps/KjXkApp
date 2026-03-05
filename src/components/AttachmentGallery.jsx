import React from "react";

/**
 * AttachmentGallery
 * - 1 adjunto:   el ícono 📎 abre el lightbox directamente
 * - 2+ adjuntos: el ícono 📎 despliega thumbnails; click en thumbnail abre lightbox
 * Props:
 *   atts[]     — array de adjuntos con { adjuntoId, blob, mimeType, filename }
 *   locked     — bool, si true no muestra botón eliminar
 *   onRemove   — fn(adjuntoId), opcional
 *   showIcon   — bool (default true), muestra el ícono 📎 como trigger
 */
export default function AttachmentGallery({ atts, locked, onRemove, showIcon = true }) {
  const [expanded, setExpanded] = React.useState(false);
  const [lightbox, setLightbox] = React.useState(null); // { url, filename }

  const items = React.useMemo(() => {
    return (atts || []).map((a) => ({
      ...a,
      objectUrl: a.blob ? URL.createObjectURL(a.blob) : null,
      isImage: a.mimeType?.startsWith("image/") ?? true,
    }));
  }, [atts]);

  React.useEffect(() => {
    return () => { items.forEach((i) => { if (i.objectUrl) URL.revokeObjectURL(i.objectUrl); }); };
  }, [items]);

  const hasAtts = items.length > 0;
  const single = items.length === 1;

  function handleIconClick() {
    if (!hasAtts) return;
    if (single) {
      // Abrir lightbox directo si es imagen, o nueva pestaña si es PDF
      const a = items[0];
      if (a.isImage && a.objectUrl) setLightbox({ url: a.objectUrl, filename: a.filename });
      else if (a.objectUrl) window.open(a.objectUrl, "_blank");
    } else {
      setExpanded((v) => !v);
    }
  }

  return (
    <>
      {/* Ícono trigger */}
      {showIcon && (
        <span
          title={
            !hasAtts ? "Sin imagen adjunta"
            : single ? "Ver adjunto"
            : `${items.length} adjuntos — click para ver`
          }
          onClick={handleIconClick}
          style={{
            fontSize: 15,
            opacity: hasAtts ? 1 : 0.25,
            cursor: hasAtts ? "pointer" : "default",
            userSelect: "none",
          }}
        >📎</span>
      )}

      {/* Thumbnails — solo si hay 2+ y está expandido */}
      {!single && expanded && (
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
              {onRemove && !locked && (
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
                >×</button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Galería standalone (sin ícono, showIcon=false) — usada en EditExpense */}
      {!showIcon && (
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
              {onRemove && !locked && (
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
                >×</button>
              )}
            </div>
          ))}
        </div>
      )}

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
            >Descargar</a>
            <button
              className="btn secondary"
              onClick={() => setLightbox(null)}
              style={{ fontSize: 13 }}
            >Cerrar</button>
          </div>
        </div>
      )}
    </>
  );
}
