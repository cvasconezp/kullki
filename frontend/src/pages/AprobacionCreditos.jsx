import { useEffect, useState } from "react";
import { api, usd, fechaCorta } from "../lib/api.js";
import SolicitudesCredito from "../components/SolicitudesCredito.jsx";

export default function AprobacionCreditos() {
  const [creditos, setCreditos] = useState(null);
  const cargar = () => api("/creditos").then(setCreditos).catch(() => setCreditos([]));
  useEffect(() => { cargar(); }, []);

  return (
    <>
      <div className="seccion-titulo"><h2>Créditos</h2></div>
      <p className="detalle" style={{ color: "var(--tinta-suave)", fontSize: 13, margin: "0 0 10px" }}>
        Como directiva, revisas y apruebas (o rechazas) las solicitudes de crédito. El tesorero registra los cobros.
      </p>

      <SolicitudesCredito puedeAprobar={true} onCambio={cargar} />

      <div className="tarjeta">
        <h3>Créditos vigentes</h3>
        {!creditos && <div className="vacio">Cargando…</div>}
        {creditos && creditos.length === 0 && <div className="vacio">No hay créditos todavía.</div>}
        {creditos && creditos.map((c) => (
          <div className="fila" key={c.id}>
            <div>
              <div className="principal">
                {c.socio_nombres}{" "}
                {c.estado === "pagado" ? <span className="pill ok">pagado</span>
                  : c.en_mora ? <span className="pill mora">en mora</span>
                  : <span className="pill neutro">al día</span>}
              </div>
              <div className="detalle">
                {usd(c.monto)} · {c.plazo_meses} meses · {c.destino || "sin destino"}
                {c.tipo === "emergente" ? " · emergente" : ""} · desde {fechaCorta(c.fecha_desembolso)}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div className="cifra">{usd(c.saldo_capital)}</div>
              <div className="detalle">{c.cuotas_pagadas}/{c.plazo_meses} cuotas</div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
