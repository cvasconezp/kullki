import { useEffect, useState } from "react";
import { api, usd, fechaCorta, mascaraCedula } from "../lib/api.js";
import ExportarEstado from "../components/ExportarEstado.jsx";
import MisDatos from "../components/MisDatos.jsx";
import Seguridad2FA from "../components/Seguridad2FA.jsx";
import CreditoSocio from "../components/CreditoSocio.jsx";

// vista: "libreta" (Mi libreta) | "credito" (Crédito) | "perfil" (Perfil)
export default function Libreta({ vista = "libreta" }) {
  const [lib, setLib] = useState(null);
  const [error, setError] = useState("");
  const [verCedula, setVerCedula] = useState(false);

  const cargar = () => api("/mi-libreta").then(setLib).catch((e) => setError(e.message));
  useEffect(() => { cargar(); }, []);

  if (error) return <div className="error">{error}</div>;
  if (!lib) return <div className="vacio">Cargando…</div>;

  const { socio, caja_nombre, aportes, creditos } = lib;
  const activos = creditos.filter((c) => c.estado === "activo");

  // ---------------- Crédito ----------------
  if (vista === "credito") {
    return (
      <>
        <div className="seccion-titulo"><h2>Crédito</h2></div>
        <CreditoSocio lib={lib} />
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
      </>
    );
  }

  // ---------------- Perfil ----------------
  if (vista === "perfil") {
    return (
      <>
        <div className="seccion-titulo"><h2>Mi perfil</h2></div>
        <MisDatos socio={socio} onActualizado={cargar} />
        <Seguridad2FA />
      </>
    );
  }

  // ---------------- Mi libreta (por defecto) ----------------
  const depositado = aportes.filter((a) => a.tipo !== "multa" && a.tipo !== "ingreso").reduce((t, a) => t + a.monto, 0);
  const totalRetiros = (lib.retiros || []).reduce((t, r) => t + r.monto, 0);
  const interesesPagados = creditos.reduce((t, c) =>
    t + c.cuotas.filter((q) => q.pagada).reduce((u, q) => u + q.interes, 0), 0);

  const etiquetaAporte = (t) =>
    t === "ordinario" ? "Aporte mensual"
      : t === "multa" ? "Multa"
      : t === "ingreso" ? "Cuota de ingreso"
      : "Aporte extraordinario";

  return (
    <>
      <div className="libreta">
        <div className="eyebrow">{caja_nombre}</div>
        <div className="lib-titular">
          {socio.nombres}
          <span className="lib-ci">CI {verCedula ? socio.cedula : mascaraCedula(socio.cedula)}
            <button className="ojo" onClick={() => setVerCedula((v) => !v)}
              aria-label={verCedula ? "Ocultar cédula" : "Ver cédula"} title={verCedula ? "Ocultar" : "Ver"}>
              {verCedula ? "🙈" : "👁"}</button>
          </span>
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

      <div className="kpis">
        <div className="kpi k-in"><div className="v">{usd(depositado)}</div><div className="l">Depositado</div></div>
        <div className="kpi k-out"><div className="v">{usd(totalRetiros)}</div><div className="l">Retirado</div></div>
        <div className="kpi k-in"><div className="v">{usd(socio.total_aportes)}</div><div className="l">Ahorro neto</div></div>
        <div className="kpi k-out"><div className="v">{usd(socio.saldo_credito)}</div><div className="l">Debes (crédito)</div></div>
        <div className="kpi k-warn"><div className="v">{usd(interesesPagados)}</div><div className="l">Intereses pagados</div></div>
        <div className="kpi k-warn"><div className="v">{usd(socio.total_multas)}</div><div className="l">Multas</div></div>
      </div>

      <ExportarEstado lib={lib} />

      <div className="tarjeta">
        <h3>Tus aportes</h3>
        {aportes.length === 0 && <div className="vacio">Aún no tienes aportes registrados.</div>}
        {aportes.map((a) => (
          <div className="fila" key={a.id}>
            <div>
              <div className="principal">{etiquetaAporte(a.tipo)}</div>
              <div className="detalle">{fechaCorta(a.fecha)}{a.nota ? ` · ${a.nota}` : ""}
                {a.tipo === "ingreso" ? " · no cuenta como ahorro" : ""}</div>
            </div>
            <div className="cifra pos">{usd(a.monto)}</div>
          </div>
        ))}
      </div>
    </>
  );
}
