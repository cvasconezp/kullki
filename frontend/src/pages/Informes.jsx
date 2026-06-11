import { useEffect, useState } from "react";
import { api, usd, fechaCorta } from "../lib/api.js";

export default function Informes() {
  const [informe, setInforme] = useState(null);
  const [cierre, setCierre] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/informe-asamblea").then(setInforme).catch((e) => setError(e.message));
    api("/cierre/simulacion").then(setCierre).catch(() => {});
  }, []);

  if (error) return <div className="error">{error}</div>;
  if (!informe) return <div className="vacio">Preparando el informe…</div>;

  const d = informe.dashboard;

  return (
    <div id="informe">
      <div className="seccion-titulo no-print-margin">
        <h2>Informe de asamblea</h2>
        <button className="boton mini no-print" onClick={() => window.print()}>
          🖨 Imprimir / PDF
        </button>
      </div>

      <div className="tarjeta solo-print-header">
        <h3>{informe.caja.nombre}</h3>
        <div className="detalle" style={{ color: "var(--tinta-suave)", fontSize: 13 }}>
          {informe.caja.comunidad} · Informe generado el {fechaCorta(informe.fecha)} · Kullki / Yachay Deep Labs
        </div>
      </div>

      <div className="tarjeta">
        <h3>Estado de la caja</h3>
        <div className="fila"><span>Fondo disponible</span><span className="cifra pos">{usd(d.fondo_disponible)}</span></div>
        <div className="fila"><span>Aportes acumulados</span><span className="cifra">{usd(d.total_aportes)}</span></div>
        <div className="fila"><span>Retiros entregados</span><span className="cifra neg">{usd(d.total_retiros)}</span></div>
        <div className="fila"><span>Capital en la calle</span><span className="cifra">{usd(d.capital_prestado)}</span></div>
        <div className="fila"><span>Intereses ganados</span><span className="cifra pos">{usd(d.intereses_cobrados)}</span></div>
        {d.abonos_en_transito > 0 &&
          <div className="fila"><span>Abonos parciales en tránsito</span><span className="cifra">{usd(d.abonos_en_transito)}</span></div>}
        {d.cuotas_en_mora > 0 &&
          <div className="fila"><span>En mora ({d.cuotas_en_mora} cuotas)</span><span className="cifra neg">{usd(d.monto_en_mora)}</span></div>}
      </div>

      <div className="tarjeta">
        <h3>Detalle por socio</h3>
        <div className="fila encabezado"><span>Socio</span><span>Ahorro / Debe</span></div>
        {informe.filas.map((f) => (
          <div className="fila" key={f.cedula}>
            <div>
              <div className="principal" style={{ fontSize: 14.5 }}>
                {f.socio} {f.en_mora && <span className="pill mora">mora</span>}
              </div>
              <div className="detalle">CI {f.cedula}{f.multas > 0 ? ` · multas ${usd(f.multas)}` : ""}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div className="cifra pos">{usd(f.ahorro_neto)}</div>
              {f.saldo_credito > 0 && <div className="cifra neg" style={{ fontSize: 13 }}>debe {usd(f.saldo_credito)}</div>}
            </div>
          </div>
        ))}
      </div>

      {cierre && cierre.intereses_a_repartir > 0 && (
        <div className="tarjeta">
          <h3>Simulación de cierre de ejercicio</h3>
          <p className="detalle" style={{ color: "var(--tinta-suave)", fontSize: 13, margin: "0 0 8px" }}>
            Si hoy se repartieran los {usd(cierre.intereses_a_repartir)} de intereses ganados,
            proporcional al ahorro de cada socio:
          </p>
          {cierre.filas.map((f) => (
            <div className="fila" key={f.socio}>
              <div>
                <div className="principal" style={{ fontSize: 14.5 }}>{f.socio}</div>
                <div className="detalle">{f.porcentaje}% del ahorro total</div>
              </div>
              <div className="cifra pos">{usd(f.utilidad)}</div>
            </div>
          ))}
        </div>
      )}

      <p className="no-print" style={{ color: "var(--tinta-suave)", fontSize: 12.5, textAlign: "center", marginTop: 14 }}>
        Usa "Imprimir / PDF" para llevar este informe en papel a la asamblea.
      </p>
    </div>
  );
}
