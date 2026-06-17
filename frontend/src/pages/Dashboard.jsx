import { useEffect, useState } from "react";
import { api, usd } from "../lib/api.js";
import EgresosCaja from "../components/EgresosCaja.jsx";

const SEMAFORO = {
  verde:    { emoji: "🟢", color: "var(--ok)",      label: "Saludable" },
  amarillo: { emoji: "🟡", color: "var(--sara)",    label: "Atención" },
  rojo:     { emoji: "🔴", color: "var(--cochinilla)", label: "Crítico" },
};

export default function Dashboard() {
  const [d, setD] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/dashboard").then(setD).catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="error">{error}</div>;
  if (!d) return <div className="vacio">Cargando…</div>;

  const sem = SEMAFORO[d.semaforo] || SEMAFORO.verde;
  const esFestiva = d.caja?.tipo_caja === "festiva";

  return (
    <>
      {/* ── Cabecera con semáforo ── */}
      <div className="libreta" style={{ borderColor: sem.color }}>
        <div className="eyebrow" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>{d.caja.nombre}</span>
          <span title={sem.label} style={{ fontSize: 22 }}>{sem.emoji}</span>
        </div>
        <div className="saldo">
          <span className="moneda">$</span>
          {d.fondo_disponible.toLocaleString("es-EC", { minimumFractionDigits: 2 })}
        </div>
        <div className="sub">
          {esFestiva ? "Fondo acumulado de la caja" : "Fondo disponible para nuevos créditos"}
        </div>
      </div>

      {/* ── Alertas ── */}
      {d.alertas && d.alertas.length > 0 && (
        <div className="tarjeta" style={{ borderColor: sem.color }}>
          {d.alertas.map((a, i) => (
            <div key={i} style={{ padding: "4px 0", fontSize: 14 }}>{a}</div>
          ))}
        </div>
      )}

      {/* ── KPIs principales ── */}
      <div className="kpis">
        <div className="kpi">
          <div className="v">{usd(d.total_aportes)}</div>
          <div className="l">Aportes acumulados</div>
        </div>
        {!esFestiva && (
          <>
            <div className="kpi">
              <div className="v">{usd(d.capital_prestado)}</div>
              <div className="l">Capital en la calle</div>
            </div>
            <div className="kpi">
              <div className="v pos">{usd(d.intereses_cobrados)}</div>
              <div className="l">Intereses ganados</div>
            </div>
          </>
        )}
        <div className="kpi">
          <div className="v">{d.socios_activos}</div>
          <div className="l">Socios activos</div>
        </div>
        {!esFestiva && (
          <div className="kpi">
            <div className="v">{d.creditos_activos}</div>
            <div className="l">Créditos activos</div>
          </div>
        )}
        <div className={"kpi" + (d.cuotas_en_mora > 0 ? " alerta" : "")}>
          <div className="v">{d.cuotas_en_mora > 0 ? usd(d.monto_en_mora) : "—"}</div>
          <div className="l">{d.cuotas_en_mora > 0 ? `${d.cuotas_en_mora} cuota(s) vencidas` : "Sin mora"}</div>
        </div>
        {d.cuota_sri > 0 && (
          <div className="kpi">
            <div className="v" style={{ fontSize: 15 }}>{usd(d.cuota_sri)}</div>
            <div className="l">Contribución SRI 0,05%</div>
          </div>
        )}
      </div>

      {/* ── Métricas ejecutivas (solo caja normal) ── */}
      {!esFestiva && (
        <div className="tarjeta">
          <h3>Indicadores de salud financiera</h3>
          <div className="kpis" style={{ marginTop: 8 }}>
            {/* Índice de liquidez */}
            <div className="kpi" style={{ borderColor: d.indice_liquidez < 15 ? "var(--cochinilla)" : d.indice_liquidez < 30 ? "var(--sara)" : "var(--ok)" }}>
              <div className="v" style={{ color: d.indice_liquidez < 15 ? "var(--cochinilla)" : d.indice_liquidez < 30 ? "var(--sara)" : "var(--ok)" }}>
                {d.indice_liquidez?.toFixed(1)}%
              </div>
              <div className="l">Liquidez (fondo/aportes)</div>
            </div>
            {/* % Mora */}
            <div className="kpi" style={{ borderColor: d.porcentaje_mora > 15 ? "var(--cochinilla)" : d.porcentaje_mora > 5 ? "var(--sara)" : "var(--ok)" }}>
              <div className="v" style={{ color: d.porcentaje_mora > 15 ? "var(--cochinilla)" : d.porcentaje_mora > 5 ? "var(--sara)" : "var(--ok)" }}>
                {d.porcentaje_mora?.toFixed(1)}%
              </div>
              <div className="l">% Mora (vencido/cartera)</div>
            </div>
            {/* Cartera en riesgo */}
            <div className="kpi" style={{ borderColor: d.cartera_en_riesgo > 0 ? "var(--cochinilla)" : "var(--regla)" }}>
              <div className="v" style={{ color: d.cartera_en_riesgo > 0 ? "var(--cochinilla)" : undefined }}>
                {d.cartera_en_riesgo > 0 ? usd(d.cartera_en_riesgo) : "—"}
              </div>
              <div className="l">Cartera en riesgo (&gt;30 días)</div>
            </div>
            {/* Proyección cobros 30 días */}
            <div className="kpi">
              <div className="v pos">{usd(d.proyeccion_cobros_30d)}</div>
              <div className="l">Cobros próximos 30 días</div>
            </div>
          </div>
        </div>
      )}

      {/* ── Egresos institucionales (cajas festivas y cualquier caja) ── */}
      {esFestiva && <EgresosCaja />}
    </>
  );
}
