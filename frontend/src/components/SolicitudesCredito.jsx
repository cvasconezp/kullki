import { useEffect, useState } from "react";
import { api, usd, fechaCorta } from "../lib/api.js";

const BADGE = {
  pendiente:      { label: "pendiente",      cls: "neutro" },
  en_aprobacion: { label: "en revisión",     cls: "sara"   },
  aprobada:       { label: "aprobada",        cls: "ok"     },
  rechazada:      { label: "rechazada",       cls: "mora"   },
  correccion:     { label: "pedir corrección",cls: "mora"   },
};

// modo "tesorero": ve todas + puede actuar sobre las pendientes
// modo "directiva": ve en_aprobacion + puede aprobar/rechazar
// modo "historial": solo lista, sin acciones (para panel de socio)
export default function SolicitudesCredito({ onCambio, modo = "tesorero" }) {
  const [sols, setSols] = useState([]);
  const [verTodas, setVerTodas] = useState(false);
  const [error, setError] = useState("");

  const cargar = () => {
    const qs = modo === "directiva"
      ? ""
      : verTodas ? "?estado=todas" : "";
    api(`/creditos/solicitudes${qs}`).then(setSols).catch(() => setSols([]));
  };

  useEffect(() => { cargar(); }, [verTodas]);

  const accion = async (id, ruta, conMotivo) => {
    let qs = "";
    if (conMotivo) {
      const m = window.prompt(conMotivo);
      if (m === null) return;
      qs = `?motivo=${encodeURIComponent(m)}`;
    }
    setError("");
    try {
      await api(`/creditos/solicitudes/${id}/${ruta}${qs}`, { method: "POST" });
      cargar();
      onCambio && onCambio();
    } catch (e) { setError(e.message); }
  };

  const aprobar = (id) => {
    if (!window.confirm("¿Aprobar esta solicitud y otorgar el crédito? Se generará la tabla de cuotas.")) return;
    accion(id, "aprobar");
  };

  const verDoc = async (s) => {
    try {
      const d = await api(`/creditos/solicitudes/${s.id}/documento`);
      if (!d || !d.b64) { alert("Esta solicitud no tiene documento adjunto."); return; }
      const w = window.open();
      if (w) w.document.write(
        `<title>${d.nombre || "Documento"}</title>` +
        (/\.pdf$/i.test(d.nombre || "")
          ? `<iframe src="${d.b64}" style="border:0;width:100%;height:100vh"></iframe>`
          : `<img src="${d.b64}" style="max-width:100%">`));
    } catch (e) { alert(e.message); }
  };

  const pendientes = sols.filter(s => s.estado === "pendiente");
  const enRevision = sols.filter(s => s.estado === "en_aprobacion");
  const resueltas  = sols.filter(s => ["aprobada","rechazada","correccion"].includes(s.estado));

  const tarjeta = (s, acciones = true) => {
    const b = BADGE[s.estado] || BADGE.pendiente;
    return (
      <div key={s.id} style={{ borderBottom: "1px dashed var(--regla)", padding: "10px 0" }}>
        <div className="principal">
          {s.socio_nombre} · {usd(s.monto)} · {s.plazo_meses} meses{" "}
          <span className={"pill " + (s.tipo === "emergente" ? "mora" : "neutro")}>
            {s.tipo === "emergente" ? "emergente" : "ordinario"}
          </span>{" "}
          <span className={"pill " + b.cls}>{b.label}</span>
        </div>
        <div className="detalle" style={{ margin: "2px 0 4px" }}>
          {s.destino || "Sin destino"}
          {s.garante ? ` · garante: ${s.garante}` : ""}
          {s.garante2 ? ` y ${s.garante2}` : ""}
          {" · "}{fechaCorta(s.creado_en)}
        </div>
        {s.motivo && (
          <div className="detalle" style={{ color: "var(--cochinilla)", margin: "0 0 4px" }}>
            💬 {s.motivo}
          </div>
        )}
        <div className="detalle" style={{ margin: "0 0 8px", fontSize: 12.5 }}>
          {s.documento_nombre
            ? <span style={{ color: "var(--kullki)" }}>📎 documento adjunto</span>
            : <span style={{ color: "var(--cochinilla)" }}>⚠ sin documento</span>}
          {" · ahorro: "}{usd(s.ahorro || 0)}
          {" · "}{(s.creditos_activos || 0) > 0
            ? <span style={{ color: "var(--cochinilla)" }}>ya tiene {s.creditos_activos} crédito(s) activo(s)</span>
            : "sin créditos activos"}
        </div>
        {acciones && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {s.documento_nombre && (
              <button className="boton mini secundario" onClick={() => verDoc(s)}>📎 Ver documento</button>
            )}
            {modo === "tesorero" && s.estado === "pendiente" && (
              <>
                <button className="boton mini secundario" onClick={() => accion(s.id, "correccion", "¿Qué debe corregir el socio?")}>Pedir correcciones</button>
                <button className="boton mini secundario" style={{ color: "var(--cochinilla)" }}
                  onClick={() => accion(s.id, "rechazar", "Motivo del rechazo (opcional):")}>Rechazar</button>
                <button className="boton mini" onClick={() => accion(s.id, "derivar")}>Continuar trámite →</button>
              </>
            )}
            {modo === "directiva" && s.estado === "en_aprobacion" && (
              <>
                <button className="boton mini secundario" onClick={() => accion(s.id, "rechazar", "Motivo del rechazo (opcional):")}>Rechazar</button>
                <button className="boton mini" onClick={() => aprobar(s.id)}>Aprobar y otorgar</button>
              </>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {error && <div className="error">{error}</div>}

      {/* ── TESORERO ── */}
      {modo === "tesorero" && (
        <>
          <div className="tarjeta" style={{ borderColor: pendientes.length ? "var(--sara)" : undefined }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3>Solicitudes pendientes ({pendientes.length})</h3>
            </div>
            <div className="detalle" style={{ color: "var(--tinta-suave)", fontSize: 13, margin: "0 0 8px" }}>
              Revisa que los documentos estén completos y que el socio no tenga pendientes.
              Luego deriva a la directiva, pide correcciones o rechaza.
            </div>
            {pendientes.length === 0
              ? <div className="vacio">No hay solicitudes nuevas para revisar.</div>
              : pendientes.map(s => tarjeta(s, true))}
          </div>

          {/* Historial del tesorero */}
          <div className="tarjeta">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3>Historial de solicitudes</h3>
              <button className="boton mini secundario" onClick={() => setVerTodas(v => !v)}>
                {verTodas ? "Solo pendientes" : "Ver todas"}
              </button>
            </div>
            {!verTodas && enRevision.length === 0 && resueltas.length === 0
              ? <div className="vacio">Sin historial. Usa "Ver todas" para ver solicitudes en otros estados.</div>
              : null}
            {enRevision.length > 0 && (
              <>
                <div className="detalle" style={{ fontWeight: 600, margin: "8px 0 2px" }}>En revisión por directiva</div>
                {enRevision.map(s => tarjeta(s, false))}
              </>
            )}
            {resueltas.length > 0 && (
              <>
                <div className="detalle" style={{ fontWeight: 600, margin: "8px 0 2px" }}>Resueltas</div>
                {resueltas.map(s => tarjeta(s, false))}
              </>
            )}
          </div>
        </>
      )}

      {/* ── DIRECTIVA ── */}
      {modo === "directiva" && (
        <>
          <div className="tarjeta" style={{ borderColor: enRevision.length ? "var(--sara)" : undefined }}>
            <h3>Solicitudes derivadas por el tesorero ({enRevision.length})</h3>
            <div className="detalle" style={{ color: "var(--tinta-suave)", fontSize: 13, margin: "0 0 8px" }}>
              El tesorero ya hizo el filtro previo. La directiva decide la aprobación final.
            </div>
            {enRevision.length === 0
              ? <div className="vacio">No hay solicitudes derivadas por ahora.</div>
              : enRevision.map(s => tarjeta(s, true))}
          </div>
          {resueltas.length > 0 && (
            <div className="tarjeta">
              <h3>Historial resuelto</h3>
              {resueltas.map(s => tarjeta(s, false))}
            </div>
          )}
        </>
      )}
    </>
  );
}
