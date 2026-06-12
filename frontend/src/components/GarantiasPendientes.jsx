import { useEffect, useState } from "react";
import { api, usd, fechaCorta } from "../lib/api.js";

// Tarjeta para el socio que fue elegido como garante: aceptar o rechazar.
export default function GarantiasPendientes({ onCambio }) {
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const cargar = () => api("/creditos/garantias").then(setItems).catch(() => setItems([]));
  useEffect(() => { cargar(); }, []);

  const responder = async (id, accion) => {
    const txt = accion === "aceptar"
      ? "¿Aceptas ser garante de este crédito? Te comprometes a responder si el socio no paga."
      : "¿Rechazas ser garante? El solicitante deberá elegir a otra persona.";
    if (!window.confirm(txt)) return;
    setError("");
    try { await api(`/creditos/solicitudes/${id}/garantia?accion=${accion}`, { method: "POST" }); cargar(); onCambio && onCambio(); }
    catch (e) { setError(e.message); }
  };

  if (!items.length) return null;
  return (
    <div className="tarjeta" style={{ borderColor: "var(--sara)" }}>
      <h3>Te pidieron ser garante ({items.length})</h3>
      <div className="detalle" style={{ color: "var(--tinta-suave)", fontSize: 13, margin: "0 0 8px" }}>
        Si aceptas, respaldas el crédito: si el socio no paga, la caja puede cobrarte a ti. Acepta solo si estás de acuerdo.
      </div>
      {error && <div className="error">{error}</div>}
      {items.map((g) => (
        <div key={g.id} style={{ borderBottom: "1px dashed var(--regla)", padding: "9px 0" }}>
          <div className="principal">
            {g.solicitante} · {usd(g.monto)} · {g.plazo_meses} meses{" "}
            <span className={"pill " + (g.tipo === "emergente" ? "mora" : "neutro")}>
              {g.tipo === "emergente" ? "emergente" : "ordinario"}</span>
          </div>
          <div className="detalle" style={{ margin: "2px 0 8px" }}>
            {g.destino || "Sin destino"} · {fechaCorta(g.creado_en)}
          </div>
          <div className="dos-col">
            <button className="boton secundario" style={{ color: "var(--cochinilla)" }}
              onClick={() => responder(g.id, "rechazar")}>Rechazar</button>
            <button className="boton" onClick={() => responder(g.id, "aceptar")}>Aceptar ser garante</button>
          </div>
        </div>
      ))}
    </div>
  );
}
