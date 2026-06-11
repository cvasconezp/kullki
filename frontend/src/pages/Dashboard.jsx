import { useEffect, useState } from "react";
import { api, usd } from "../lib/api.js";

export default function Dashboard() {
  const [d, setD] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/dashboard").then(setD).catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="error">{error}</div>;
  if (!d) return <div className="vacio">Cargando…</div>;

  return (
    <>
      <div className="libreta">
        <div className="eyebrow">{d.caja.nombre}</div>
        <div className="saldo">
          <span className="moneda">$</span>
          {d.fondo_disponible.toLocaleString("es-EC", { minimumFractionDigits: 2 })}
        </div>
        <div className="sub">Fondo disponible para nuevos créditos</div>
      </div>

      <div className="kpis">
        <div className="kpi"><div className="v">{usd(d.total_aportes)}</div><div className="l">Aportes acumulados</div></div>
        <div className="kpi"><div className="v">{usd(d.capital_prestado)}</div><div className="l">Capital en la calle</div></div>
        <div className="kpi"><div className="v pos">{usd(d.intereses_cobrados)}</div><div className="l">Intereses ganados</div></div>
        <div className="kpi"><div className="v">{d.socios_activos}</div><div className="l">Socios activos</div></div>
        <div className="kpi"><div className="v">{d.creditos_activos}</div><div className="l">Créditos activos</div></div>
        <div className={"kpi" + (d.cuotas_en_mora > 0 ? " alerta" : "")}>
          <div className="v">{d.cuotas_en_mora > 0 ? usd(d.monto_en_mora) : "—"}</div>
          <div className="l">{d.cuotas_en_mora > 0 ? `${d.cuotas_en_mora} cuota(s) vencidas` : "Sin mora"}</div>
        </div>
      </div>
    </>
  );
}
