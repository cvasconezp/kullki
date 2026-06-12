import { useEffect, useState } from "react";
import { api, usd, fechaCorta } from "../lib/api.js";

// modo "tesorero": filtro previo -> derivar a directiva / pedir corrección / rechazar.
// modo "directiva": aprobar y otorgar / rechazar (solo las que el tesorero ya derivó).
export default function SolicitudesCredito({ onCambio, modo = "tesorero" }) {
  const [sols, setSols] = useState([]);
  const [error, setError] = useState("");
  const cargar = () => api("/creditos/solicitudes").then(setSols).catch(() => setSols([]));
  useEffect(() => { cargar(); }, []);

  const accion = async (id, ruta, conMotivo) => {
    let qs = "";
    if (conMotivo) {
      const m = window.prompt(conMotivo);
      if (m === null) return;
      qs = `?motivo=${encodeURIComponent(m)}`;
    }
    setError("");
    try { await api(`/creditos/solicitudes/${id}/${ruta}${qs}`, { method: "POST" }); cargar(); onCambio && onCambio(); }
    catch (e) { setError(e.message); }
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

  if (!sols.length) {
    return (
      <div className="tarjeta">
        <h3>Solicitudes de crédito</h3>
        <div className="vacio">
          {modo === "directiva"
            ? "No hay solicitudes derivadas por el tesorero por ahora."
            : "No hay solicitudes nuevas para revisar."}
        </div>
      </div>
    );
  }

  return (
    <div className="tarjeta" style={{ borderColor: "var(--sara)" }}>
      <h3>Solicitudes de crédito ({sols.length})</h3>
      <div className="detalle" style={{ color: "var(--tinta-suave)", fontSize: 13, margin: "0 0 8px" }}>
        {modo === "tesorero"
          ? "Revisa que los documentos estén completos y que el socio no tenga pendientes. Luego deriva a la directiva, pide correcciones o rechaza."
          : "El tesorero ya hizo el filtro previo. La directiva (o la asamblea) decide la aprobación final."}
      </div>
      {error && <div className="error">{error}</div>}
      {sols.map((s) => (
        <div key={s.id} style={{ borderBottom: "1px dashed var(--regla)", padding: "10px 0" }}>
          <div className="principal">
            {s.socio_nombre} · {usd(s.monto)} · {s.plazo_meses} meses{" "}
            <span className={"pill " + (s.tipo === "emergente" ? "mora" : "neutro")}>
              {s.tipo === "emergente" ? "emergente" : "ordinario"}
            </span>
          </div>
          <div className="detalle" style={{ margin: "2px 0 4px" }}>
            {s.destino || "Sin destino"}
            {s.garante ? ` · garante: ${s.garante}` : ""}
            {s.garante2 ? ` y ${s.garante2}` : ""}
            {" · "}{fechaCorta(s.creado_en)}
          </div>
          <div className="detalle" style={{ margin: "0 0 8px", fontSize: 12.5 }}>
            {s.documento_nombre
              ? <span style={{ color: "var(--kullki)" }}>📎 documento adjunto</span>
              : <span style={{ color: "var(--cochinilla)" }}>⚠ sin documento</span>}
            {" · ahorro: "}{usd(s.ahorro || 0)}
            {" · "}{(s.creditos_activos || 0) > 0
              ? <span style={{ color: "var(--cochinilla)" }}>ya tiene {s.creditos_activos} crédito(s) activo(s)</span>
              : "sin créditos activos"}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {s.documento_nombre && (
              <button className="boton mini secundario" onClick={() => verDoc(s)}>📎 Ver documento</button>
            )}
            {modo === "tesorero" ? (
              <>
                <button className="boton mini secundario" onClick={() => accion(s.id, "correccion", "¿Qué debe corregir el socio?")}>Pedir correcciones</button>
                <button className="boton mini secundario" style={{ color: "var(--cochinilla)" }}
                  onClick={() => accion(s.id, "rechazar", "Motivo del rechazo (opcional):")}>Rechazar</button>
                <button className="boton mini" onClick={() => accion(s.id, "derivar")}>Continuar trámite →</button>
              </>
            ) : (
              <>
                <button className="boton mini secundario" onClick={() => accion(s.id, "rechazar", "Motivo del rechazo (opcional):")}>Rechazar</button>
                <button className="boton mini" onClick={() => aprobar(s.id)}>Aprobar y otorgar</button>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
