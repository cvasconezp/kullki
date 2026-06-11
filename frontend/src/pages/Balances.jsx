import { useEffect, useMemo, useState } from "react";
import { api, usd } from "../lib/api.js";

const fmtK = (n) => {
  const a = Math.abs(n);
  if (a >= 1000) return "$" + (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  return "$" + Math.round(n);
};

/* ---------- Área + línea: evolución del fondo ---------- */
function GraficoFondo({ serie }) {
  const [hi, setHi] = useState(null);
  const W = 720, H = 240, P = { t: 16, r: 16, b: 28, l: 44 };
  if (!serie.length) return <div className="vacio">Sin movimientos todavía.</div>;
  const vals = serie.map((p) => p.fondo_acumulado);
  const max = Math.max(...vals, 1) * 1.1, min = Math.min(...vals, 0);
  const ix = W - P.l - P.r, iy = H - P.t - P.b;
  const x = (i) => P.l + (serie.length === 1 ? ix / 2 : (i / (serie.length - 1)) * ix);
  const y = (v) => P.t + iy - ((v - min) / (max - min || 1)) * iy;
  const linea = serie.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.fondo_acumulado)}`).join(" ");
  const area = `${linea} L${x(serie.length - 1)},${P.t + iy} L${x(0)},${P.t + iy} Z`;
  const ticks = 4;
  return (
    <svg className="g-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Evolución del fondo"
         onMouseLeave={() => setHi(null)}>
      {Array.from({ length: ticks + 1 }).map((_, k) => {
        const v = min + ((max - min) * k) / ticks, yy = y(v);
        return (
          <g key={k}>
            <line x1={P.l} x2={W - P.r} y1={yy} y2={yy} className="g-grid" />
            <text x={P.l - 6} y={yy + 3} className="g-axis" textAnchor="end">{fmtK(v)}</text>
          </g>
        );
      })}
      <path d={area} className="g-area" />
      <path d={linea} className="g-line" />
      {serie.map((p, i) => (
        <g key={i}>
          <rect x={x(i) - ix / serie.length / 2} y={P.t} width={Math.max(8, ix / serie.length)}
                height={iy} fill="transparent" onMouseEnter={() => setHi(i)} />
          <circle cx={x(i)} cy={y(p.fondo_acumulado)} r={hi === i ? 5 : 3}
                  className={"g-dot" + (hi === i ? " on" : "")} />
          {i % Math.ceil(serie.length / 6 || 1) === 0 &&
            <text x={x(i)} y={H - 8} className="g-axis" textAnchor="middle">{p.etiqueta}</text>}
        </g>
      ))}
      {hi != null && (
        <g>
          <line x1={x(hi)} x2={x(hi)} y1={P.t} y2={P.t + iy} className="g-cursor" />
          <foreignObject x={Math.min(x(hi) + 8, W - 150)} y={P.t} width="150" height="58">
            <div className="g-tip">
              <b>{serie[hi].etiqueta}</b>
              <span>Fondo: {usd(serie[hi].fondo_acumulado)}</span>
            </div>
          </foreignObject>
        </g>
      )}
    </svg>
  );
}

/* ---------- Barras: movimientos por mes ---------- */
const METRICAS = [
  { k: "aportes", l: "Aportes", c: "var(--kullki)" },
  { k: "recuperado", l: "Recuperado", c: "var(--sara)" },
  { k: "desembolsos", l: "Préstamos", c: "var(--cochinilla)" },
];
function GraficoBarras({ serie }) {
  const [activas, setActivas] = useState({ aportes: true, recuperado: true, desembolsos: true });
  const [hi, setHi] = useState(null);
  const W = 720, H = 240, P = { t: 16, r: 12, b: 28, l: 44 };
  const ms = METRICAS.filter((m) => activas[m.k]);
  if (!serie.length) return <div className="vacio">Sin movimientos todavía.</div>;
  const max = Math.max(1, ...serie.flatMap((p) => ms.map((m) => p[m.k])));
  const ix = W - P.l - P.r, iy = H - P.t - P.b;
  const bw = ix / serie.length, gw = bw * 0.62, sub = ms.length ? gw / ms.length : gw;
  const y = (v) => P.t + iy - (v / max) * iy;
  return (
    <>
      <div className="g-legend">
        {METRICAS.map((m) => (
          <button key={m.k} className={"g-leg" + (activas[m.k] ? "" : " off")}
                  onClick={() => setActivas((a) => ({ ...a, [m.k]: !a[m.k] }))}>
            <span className="g-dotleg" style={{ background: m.c }} /> {m.l}
          </button>
        ))}
      </div>
      <svg className="g-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Movimientos por mes"
           onMouseLeave={() => setHi(null)}>
        {[0, 0.5, 1].map((f, k) => {
          const yy = y(max * f);
          return <g key={k}><line x1={P.l} x2={W - P.r} y1={yy} y2={yy} className="g-grid" />
            <text x={P.l - 6} y={yy + 3} className="g-axis" textAnchor="end">{fmtK(max * f)}</text></g>;
        })}
        {serie.map((p, i) => {
          const x0 = P.l + i * bw + (bw - gw) / 2;
          return (
            <g key={i} onMouseEnter={() => setHi(i)}>
              <rect x={P.l + i * bw} y={P.t} width={bw} height={iy} fill="transparent" />
              {ms.map((m, j) => (
                <rect key={m.k} x={x0 + j * sub} y={y(p[m.k])} width={sub * 0.86}
                      height={Math.max(0, P.t + iy - y(p[m.k]))} fill={m.c} rx="2"
                      opacity={hi == null || hi === i ? 1 : 0.45} />
              ))}
              {i % Math.ceil(serie.length / 6 || 1) === 0 &&
                <text x={P.l + i * bw + bw / 2} y={H - 8} className="g-axis" textAnchor="middle">{p.etiqueta}</text>}
            </g>
          );
        })}
        {hi != null && (
          <foreignObject x={Math.min(P.l + hi * bw + bw, W - 160)} y={P.t} width="160" height={26 + ms.length * 16}>
            <div className="g-tip">
              <b>{serie[hi].etiqueta}</b>
              {ms.map((m) => <span key={m.k}>{m.l}: {usd(serie[hi][m.k])}</span>)}
            </div>
          </foreignObject>
        )}
      </svg>
    </>
  );
}

/* ---------- Dona: composición del fondo ---------- */
function Dona({ comp }) {
  const items = [
    { l: "Ahorros disponibles", v: comp.ahorros_disponibles, c: "var(--kullki)" },
    { l: "Capital en la calle", v: comp.capital_en_calle, c: "var(--sara)" },
    { l: "Intereses ganados", v: comp.intereses, c: "var(--kullki-oscuro)" },
  ].filter((x) => x.v > 0);
  const total = items.reduce((a, b) => a + b.v, 0);
  const [hi, setHi] = useState(null);
  if (total <= 0) return <div className="vacio">Aún no hay fondo para componer.</div>;
  const R = 52, C = 2 * Math.PI * R; let off = 0;
  return (
    <div className="dona-wrap">
      <svg viewBox="0 0 140 140" className="dona">
        <g transform="translate(70,70) rotate(-90)">
          {items.map((x, i) => {
            const frac = x.v / total, len = frac * C;
            const el = (
              <circle key={i} r={R} fill="none" stroke={x.c} strokeWidth={hi === i ? 22 : 18}
                      strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-off}
                      onMouseEnter={() => setHi(i)} onMouseLeave={() => setHi(null)} />
            );
            off += len; return el;
          })}
        </g>
        <text x="70" y="66" textAnchor="middle" className="dona-c1">{fmtK(total)}</text>
        <text x="70" y="82" textAnchor="middle" className="dona-c2">fondo total</text>
      </svg>
      <div className="dona-leg">
        {items.map((x, i) => (
          <div key={i} className={"dl" + (hi === i ? " on" : "")} onMouseEnter={() => setHi(i)} onMouseLeave={() => setHi(null)}>
            <span className="dl-dot" style={{ background: x.c }} />
            <span className="dl-l">{x.l}</span>
            <span className="dl-v cifra">{usd(x.v)} · {Math.round((x.v / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Balances() {
  const [d, setD] = useState(null);
  const [error, setError] = useState("");
  const [rango, setRango] = useState(12);

  useEffect(() => { api("/balances").then(setD).catch((e) => setError(e.message)); }, []);

  const serie = useMemo(() => {
    if (!d) return [];
    return rango ? d.serie.slice(-rango) : d.serie;
  }, [d, rango]);

  if (error) return <div className="error">{error}</div>;
  if (!d) return <div className="vacio">Cargando balances…</div>;
  const k = d.dashboard;

  return (
    <>
      <div className="seccion-titulo"><h2>Balances</h2></div>

      <div className="libreta">
        <div className="eyebrow">{k.caja.nombre}</div>
        <div className="saldo"><span className="moneda">$</span>
          {k.fondo_disponible.toLocaleString("es-EC", { minimumFractionDigits: 2 })}</div>
        <div className="sub">Fondo disponible para nuevos créditos</div>
      </div>

      <div className="kpis">
        <div className="kpi"><div className="v">{usd(k.total_aportes)}</div><div className="l">Aportes acumulados</div></div>
        <div className="kpi"><div className="v">{usd(k.capital_prestado)}</div><div className="l">Capital en la calle</div></div>
        <div className="kpi"><div className="v pos">{usd(k.intereses_cobrados)}</div><div className="l">Intereses ganados</div></div>
        <div className={"kpi" + (k.cuotas_en_mora > 0 ? " alerta" : "")}>
          <div className="v">{k.cuotas_en_mora > 0 ? usd(k.monto_en_mora) : "—"}</div>
          <div className="l">{k.cuotas_en_mora > 0 ? `${k.cuotas_en_mora} cuota(s) en mora` : "Sin mora"}</div>
        </div>
      </div>

      <div className="balances-grid">
        <div className="tarjeta g-card ancho">
          <div className="g-head">
            <h3>Evolución del fondo</h3>
            <div className="segmentos chico">
              {[6, 12, 0].map((r) => (
                <button key={r} className={"seg" + (rango === r ? " activo" : "")} onClick={() => setRango(r)}>
                  {r ? `${r}m` : "Todo"}
                </button>
              ))}
            </div>
          </div>
          <GraficoFondo serie={serie} />
        </div>

        <div className="tarjeta g-card ancho">
          <div className="g-head"><h3>Movimientos por mes</h3></div>
          <GraficoBarras serie={serie} />
        </div>

        <div className="tarjeta g-card">
          <div className="g-head"><h3>Composición del fondo</h3></div>
          <Dona comp={d.composicion_fondo} />
        </div>

        <div className="tarjeta g-card">
          <div className="g-head"><h3>Mayores ahorristas</h3></div>
          {d.top_socios.length === 0 ? <div className="vacio">Sin ahorros aún.</div> :
            <div className="ranking">
              {d.top_socios.map((s, i) => {
                const max = d.top_socios[0].ahorro_neto || 1;
                return (
                  <div className="rk" key={i}>
                    <div className="rk-top"><span>{s.socio}</span><span className="cifra">{usd(s.ahorro_neto)}</span></div>
                    <div className="rk-bar"><div style={{ width: `${(s.ahorro_neto / max) * 100}%` }} /></div>
                  </div>
                );
              })}
            </div>}
        </div>
      </div>
    </>
  );
}
