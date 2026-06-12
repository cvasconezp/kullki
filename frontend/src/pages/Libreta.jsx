import { useEffect, useState } from "react";
import { api, usd, fechaCorta } from "../lib/api.js";
import ExportarEstado from "../components/ExportarEstado.jsx";

export default function Libreta() {
  const [lib, setLib] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/mi-libreta").then(setLib).catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="error">{error}</div>;
  if (!lib) return <div className="vacio">Cargando tu libreta…</div>;

  const { socio, caja_nombre, aportes, creditos } = lib;
  const activos = creditos.filter((c) => c.estado === "activo");

  return (
    <>
      <div className="libreta">
        <div className="eyebrow">{caja_nombre}</div>
        <div className="lib-titular">
          {socio.nombres}<span className="lib-ci">CI {socio.cedula}</span>
        </div>
        <div className="saldo">
          <span className="moneda">$</span>
          {socio.total_aportes.toLocaleString("es-EC", { minimumFractionDigits: 2 })}
        </div>
        <div className="sub">
          Tus aportes acumulados desde {fechaCorta(socio.fecha_ingreso)}
          {socio.saldo_credito > 0 && <> · debes <strong className="cifra">{usd(socio.saldo_credito)}</strong></>}
        </div>
      </div>

      <ExportarEstado lib={lib} />

      {activos.map((c) => {
        const siguiente = c.cuotas.find((q) => !q.pagada);
        return (
          <div className="tarjeta" key={c.id}>
            <h3>Tu crédito de {usd(c.monto)} {c.en_mora && <span className="pill mora">en mora</span>}</h3>
            <div className="detalle" style={{ color: "var(--tinta-suave)", fontSize: 13 }}>
              {c.destino || "Crédito"} · {c.plazo_meses} meses al {c.tasa_mensual}% mensual ·
              vas {c.cuotas_pagadas} de {c.plazo_meses} cuotas
            </div>
            {siguiente && (
              <div className="fila" style={{ marginTop: 6 }}>
                <div>
                  <div className="principal">Próxima cuota ({siguiente.numero})</div>
                  <div className="detalle">vence {fechaCorta(siguiente.fecha_vencimiento)}</div>
                </div>
                <div className="cifra">{usd(siguiente.total)}</div>
              </div>
            )}
            <details>
              <summary>Ver todas las cuotas</summary>
              {c.cuotas.map((q) => (
                <div className="fila" key={q.id}>
                  <div>
                    <div className="principal" style={{ fontSize: 14 }}>Cuota {q.numero}</div>
                    <div className="detalle">vence {fechaCorta(q.fecha_vencimiento)}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div className="cifra">{usd(q.total)}</div>
                    {q.pagada
                      ? <span className="pill ok">pagada</span>
                      : new Date(q.fecha_vencimiento) < new Date()
                        ? <span className="pill mora">vencida</span>
                        : <span className="pill neutro">pendiente</span>}
                  </div>
                </div>
              ))}
            </details>
          </div>
        );
      })}

      <div className="tarjeta">
        <h3>Tus aportes</h3>
        {aportes.length === 0 && <div className="vacio">Aún no tienes aportes registrados.</div>}
        {aportes.map((a) => (
          <div className="fila" key={a.id}>
            <div>
              <div className="principal">{a.tipo === "ordinario" ? "Aporte mensual" : a.tipo === "multa" ? "Multa" : "Aporte extraordinario"}</div>
              <div className="detalle">{fechaCorta(a.fecha)}{a.nota ? ` · ${a.nota}` : ""}</div>
            </div>
            <div className="cifra pos">{usd(a.monto)}</div>
          </div>
        ))}
      </div>
    </>
  );
}
