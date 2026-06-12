import { useEffect, useState } from "react";
import { api, fechaCorta, getSesion } from "../lib/api.js";
import { navigate } from "../lib/router.js";
import SolicitudesCredito from "../components/SolicitudesCredito.jsx";

export default function Notificaciones() {
  const [datos, setDatos] = useState([]);
  const ses = getSesion() || {};
  useEffect(() => { api("/socios/solicitudes").then(setDatos).catch(() => setDatos([])); }, []);

  const irSocios = () => navigate(`/${ses.caja_slug}/socios`);

  return (
    <>
      <div className="seccion-titulo"><h2>Notificaciones</h2></div>

      <SolicitudesCredito puedeAprobar={false} />

      <div className="tarjeta" style={{ borderColor: "var(--sara)" }}>
        <h3>Solicitudes de cambio de datos ({datos.length})</h3>
        {datos.length === 0 && <div className="vacio">No hay solicitudes de cambio de datos.</div>}
        {datos.map((s) => (
          <div key={s.id} style={{ borderBottom: "1px dashed var(--regla)", padding: "8px 0" }}>
            <div className="principal">{s.socio_nombre}</div>
            <div className="detalle" style={{ margin: "2px 0 8px" }}>
              {Object.entries(s.campos || {}).map(([k, v]) => `${k}: ${v}`).join(" · ") || "Actualización de datos"}
              {" · "}{fechaCorta(s.creado_en)}
            </div>
            <button className="boton mini" onClick={irSocios}>Revisar en Socios →</button>
          </div>
        ))}
      </div>

      {datos.length === 0 && (
        <div className="tarjeta">
          <div className="detalle" style={{ color: "var(--tinta-suave)" }}>
            Aquí verás las solicitudes de crédito y los pedidos de cambio de datos de los socios apenas lleguen.
          </div>
        </div>
      )}
    </>
  );
}
