import { useEffect, useState } from "react";
import { api, usd, fechaCorta } from "../lib/api.js";

// Lista de solicitudes de crédito.
// puedeAprobar=true  -> directiva/superadmin: puede aprobar/rechazar.
// puedeAprobar=false -> tesorero: solo ve (la solicitud "llegó"), aprueba la directiva.
export default function SolicitudesCredito({ onCambio, puedeAprobar = false }) {
  const [sols, setSols] = useState([]);
  const [error, setError] = useState("");
  const cargar = () => api("/creditos/solicitudes").then(setSols).catch(() => setSols([]));
  useEffect(() => { cargar(); }, []);

  const aprobar = async (id) => {
    if (!window.confirm("¿Aprobar esta solicitud y otorgar el crédito? Se generará la tabla de cuotas.")) return;
    setError("");
    try { await api(`/creditos/solicitudes/${id}/aprobar`, { method: "POST" }); cargar(); onCambio && onCambio(); }
    catch (e) { setError(e.message); }
  };
  const rechazar = async (id) => {
    const m = window.prompt("Motivo del rechazo (opcional):") || "";
    setError("");
    try { await api(`/creditos/solicitudes/${id}/rechazar?motivo=${encodeURIComponent(m)}`, { method: "POST" }); cargar(); onCambio && onCambio(); }
    catch (e) { setError(e.message); }
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

  if (!sols.length) return null;
  return (
    <div className="tarjeta" style={{ borderColor: "var(--sara)" }}>
      <h3>Solicitudes de crédito ({sols.length})</h3>
      {!puedeAprobar && (
        <div className="detalle" style={{ color: "var(--tinta-suave)", fontSize: 13, margin: "0 0 8px" }}>
          Estas solicitudes las aprueba la <strong>directiva o la asamblea</strong>. Aquí las ves y das seguimiento.
        </div>
      )}
      {error && <div className="error">{error}</div>}
      {sols.map((s) => (
        <div key={s.id} style={{ borderBottom: "1px dashed var(--regla)", padding: "8px 0" }}>
          <div className="principal">
            {s.socio_nombre} · {usd(s.monto)} · {s.plazo_meses} meses{" "}
            <span className={"pill " + (s.tipo === "emergente" ? "mora" : "neutro")}>
              {s.tipo === "emergente" ? "emergente" : "ordinario"}
            </span>
          </div>
          <div className="detalle" style={{ margin: "2px 0 8px" }}>
            {s.destino || "Sin destino"}
            {s.garante ? ` · garante: ${s.garante}` : ""}
            {s.garante2 ? ` y ${s.garante2}` : ""}
            {" · "}{fechaCorta(s.creado_en)}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {s.documento_nombre && (
              <button className="boton mini secundario" onClick={() => verDoc(s)}>📎 Ver documento</button>
            )}
            {puedeAprobar && (
              <>
                <button className="boton mini secundario" onClick={() => rechazar(s.id)}>Rechazar</button>
                <button className="boton mini" onClick={() => aprobar(s.id)}>Aprobar y otorgar</button>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
