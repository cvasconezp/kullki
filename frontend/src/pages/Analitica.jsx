import { useEffect, useMemo, useState } from "react";
import { api, usd } from "../lib/api.js";

const PAL = ["#1B3A6B", "#E8A838", "#2B5AA0", "#0a7a4a", "#b3372b", "#7A4FA3", "#5EA9D5", "#C98A2B"];
const fmtK = (n) => { const a = Math.abs(n); return a >= 1000 ? "$" + (n / 1000).toFixed(1).replace(/\.0$/, "") + "k" : "$" + Math.round(n); };

/* Dona genérica */
function Dona({ items, money = true }) {
  const [hi, setHi] = useState(null);
  const total = items.reduce((a, b) => a + b.valor, 0);
  if (total <= 0) return <div className="vacio">Sin datos.</div>;
  const R = 54, C = 2 * Math.PI * R; let off = 0;
  return (
    <div className="dona-wrap">
      <svg viewBox="0 0 140 140" className="dona">
        <g transform="translate(70,70) rotate(-90)">
          {items.map((x, i) => {
            const len = (x.valor / total) * C;
            const el = <circle key={i} r={R} fill="none" stroke={PAL[i % PAL.length]}
              strokeWidth={hi === i ? 24 : 18} strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-off}
              onMouseEnter={() => setHi(i)} onMouseLeave={() => setHi(null)} />;
            off += len; return el;
          })}
        </g>
        <text x="70" y="66" textAnchor="middle" className="dona-c1">{money ? fmtK(total) : total}</text>
        <text x="70" y="82" textAnchor="middle" className="dona-c2">total</text>
      </svg>
      <div className="dona-leg">
        {items.map((x, i) => (
          <div key={i} className={"dl" + (hi === i ? " on" : "")} onMouseEnter={() => setHi(i)} onMouseLeave={() => setHi(null)}>
            <span className="dl-dot" style={{ background: PAL[i % PAL.length] }} />
            <span className="dl-l">{x.etiqueta}{x.count ? ` (${x.count})` : ""}</span>
            <span className="dl-v cifra">{money ? usd(x.valor) : x.valor} · {Math.round((x.valor / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* Línea/área multi-serie */
function LineasMulti({ serie, series }) {
  const [hi, setHi] = useState(null);
  const W = 720, H = 230, P = { t: 14, r: 14, b: 28, l: 44 };
  if (!serie.length) return <div className="vacio">Sin movimientos.</div>;
  const max = Math.max(1, ...serie.flatMap((p) => series.map((s) => p[s.key]))) * 1.1;
  const ix = W - P.l - P.r, iy = H - P.t - P.b;
  const x = (i) => P.l + (serie.length === 1 ? ix / 2 : (i / (serie.length - 1)) * ix);
  const y = (v) => P.t + iy - (v / max) * iy;
  const path = (key) => serie.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p[key])}`).join(" ");
  return (
    <>
      <div className="g-legend">
        {series.map((s) => <span key={s.key} className="g-leg"><span className="g-dotleg" style={{ background: s.color }} /> {s.label}</span>)}
      </div>
      <svg className="g-svg" viewBox={`0 0 ${W} ${H}`} onMouseLeave={() => setHi(null)}>
        {[0, .5, 1].map((f, k) => { const yy = y(max * f);
          return <g key={k}><line x1={P.l} x2={W - P.r} y1={yy} y2={yy} className="g-grid" />
            <text x={P.l - 6} y={yy + 3} className="g-axis" textAnchor="end">{fmtK(max * f)}</text></g>; })}
        {series.map((s) => <g key={s.key}>
          <path d={`${path(s.key)} L${x(serie.length - 1)},${P.t + iy} L${x(0)},${P.t + iy} Z`} fill={s.color} opacity=".08" />
          <path d={path(s.key)} fill="none" stroke={s.color} strokeWidth="2.4" strokeLinejoin="round" />
        </g>)}
        {serie.map((p, i) => <g key={i}>
          <rect x={x(i) - ix / serie.length / 2} y={P.t} width={Math.max(8, ix / serie.length)} height={iy}
            fill="transparent" onMouseEnter={() => setHi(i)} />
          {i % Math.ceil(serie.length / 6 || 1) === 0 && <text x={x(i)} y={H - 8} className="g-axis" textAnchor="middle">{p.etiqueta}</text>}
        </g>)}
        {hi != null && <foreignObject x={Math.min(x(hi) + 8, W - 150)} y={P.t} width="150" height={20 + series.length * 16}>
          <div className="g-tip"><b>{serie[hi].etiqueta}</b>{series.map((s) => <span key={s.key}>{s.label}: {usd(serie[hi][s.key])}</span>)}</div>
        </foreignObject>}
      </svg>
    </>
  );
}

/* Barras horizontales */
function BarrasH({ items, money = true, color = "var(--kullki)" }) {
  if (!items.length) return <div className="vacio">Sin datos.</div>;
  const max = Math.max(1, ...items.map((i) => i.valor));
  return (
    <div className="ranking">
      {items.map((it, i) => (
        <div className="rk" key={i}>
          <div className="rk-top"><span>{it.etiqueta}</span><span className="cifra">{money ? usd(it.valor) : it.valor}</span></div>
          <div className="rk-bar"><div style={{ width: `${(it.valor / max) * 100}%`, background: color }} /></div>
        </div>
      ))}
    </div>
  );
}

export default function Analitica({ cajaId }) {
  const [d, setD] = useState(null); const [error, setError] = useState("");
  useEffect(() => {
    setD(null); setError("");
    api("/analitica" + (cajaId ? `?caja_id=${cajaId}` : "")).then(setD).catch((e) => setError(e.message));
  }, [cajaId]);
  if (error) return <div className="error">{error}</div>;
  if (!d) return <div className="vacio">Analizando datos…</div>;
  const rc = d.resumen_creditos;

  return (
    <>
      <div className="kpis">
        <div className="kpi"><div className="v">{rc.total}</div><div className="l">Créditos otorgados</div></div>
        <div className="kpi k-in"><div className="v">{usd(rc.monto_total)}</div><div className="l">Monto colocado</div></div>
        <div className="kpi"><div className="v">{usd(rc.monto_promedio)}</div><div className="l">Crédito promedio</div></div>
        <div className="kpi"><div className="v">{rc.plazo_promedio} m</div><div className="l">Plazo promedio</div></div>
        <div className={"kpi" + (rc.en_mora > 0 ? " alerta" : "")}><div className="v">{rc.en_mora}</div><div className="l">Créditos en mora</div></div>
      </div>

      <div className="balances-grid">
        <div className="tarjeta g-card ancho">
          <div className="g-head"><h3>Ingresos vs. egresos por mes</h3></div>
          <LineasMulti serie={d.serie} series={[
            { key: "aportes", label: "Aportes", color: "#0a7a4a" },
            { key: "recuperado", label: "Recuperado", color: "#2B5AA0" },
            { key: "desembolsos", label: "Préstamos", color: "#E8A838" },
            { key: "retiros", label: "Retiros", color: "#b3372b" },
          ]} />
        </div>

        <div className="tarjeta g-card">
          <div className="g-head"><h3>¿A qué se destinan los créditos?</h3></div>
          <Dona items={d.destinos} />
        </div>

        <div className="tarjeta g-card">
          <div className="g-head"><h3>Composición de aportes</h3></div>
          <Dona items={d.tipos_aporte} />
        </div>

        <div className="tarjeta g-card">
          <div className="g-head"><h3>Meses de mayor ingreso</h3></div>
          <BarrasH items={d.top_ingresos} color="#0a7a4a" />
        </div>

        <div className="tarjeta g-card">
          <div className="g-head"><h3>Meses de más préstamos</h3></div>
          <BarrasH items={d.top_desembolsos} color="#E8A838" />
        </div>

        <div className="tarjeta g-card">
          <div className="g-head"><h3>Meses de más retiros</h3></div>
          <BarrasH items={d.top_retiros} color="#b3372b" />
        </div>

        <div className="tarjeta g-card">
          <div className="g-head"><h3>Tamaño de los créditos</h3></div>
          <BarrasH items={d.distribucion_montos} money={false} color="var(--kullki)" />
        </div>
      </div>
    </>
  );
}
