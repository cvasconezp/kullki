import { useEffect, useState } from "react";
import { api, fechaCorta } from "../lib/api.js";

export default function Bitacora() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/auditoria").then(setItems).catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="error">{error}</div>;
  if (!items) return <div className="vacio">Cargando…</div>;

  return (
    <>
      <div className="seccion-titulo"><h2>Bitácora de la caja</h2></div>
      <p style={{ color: "var(--tinta-suave)", fontSize: 13, margin: "0 0 8px" }}>
        Todo movimiento queda registrado y a la vista de todos los socios.
      </p>
      <div className="tarjeta">
        {items.length === 0 && <div className="vacio">Aún no hay movimientos registrados.</div>}
        {items.map((a) => (
          <div className="fila" key={a.id}>
            <div>
              <div className="principal" style={{ fontSize: 14.5 }}>{a.detalle}</div>
              <div className="detalle">{a.usuario_nombre} · {fechaCorta(a.fecha)}</div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
