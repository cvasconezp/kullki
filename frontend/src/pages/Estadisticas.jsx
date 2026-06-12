import { useEffect, useState } from "react";
import { api, mascaraCedula } from "../lib/api.js";
import Seguridad2FA from "../components/Seguridad2FA.jsx";

const fdt = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso.endsWith("Z") || iso.includes("+") ? iso : iso + "Z");
  const M = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
  return `${d.getDate()} ${M[d.getMonth()]} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
};

function BarrasAcceso({ serie }) {
  const W = 720, H = 180, P = { t: 12, r: 8, b: 26, l: 30 };
  const max = Math.max(1, ...serie.map((p) => p.accesos));
  const ix = W - P.l - P.r, iy = H - P.t - P.b, bw = ix / serie.length;
  const [hi, setHi] = useState(null);
  return (
    <svg className="g-svg" viewBox={`0 0 ${W} ${H}`} onMouseLeave={() => setHi(null)}>
      {[0, 0.5, 1].map((f, k) => { const y = P.t + iy - f * iy;
        return <g key={k}><line x1={P.l} x2={W - P.r} y1={y} y2={y} className="g-grid" />
          <text x={P.l - 5} y={y + 3} className="g-axis" textAnchor="end">{Math.round(max * f)}</text></g>; })}
      {serie.map((p, i) => {
        const h = (p.accesos / max) * iy, x = P.l + i * bw;
        return (
          <g key={i} onMouseEnter={() => setHi(i)}>
            <rect x={x} y={P.t} width={bw} height={iy} fill="transparent" />
            <rect x={x + bw * 0.18} y={P.t + iy - h} width={bw * 0.64} height={h}
              fill="var(--kullki)" rx="2" opacity={hi == null || hi === i ? 1 : .5} />
            {i % 5 === 0 && <text x={x + bw / 2} y={H - 8} className="g-axis" textAnchor="middle">{p.etiqueta}</text>}
          </g>
        );
      })}
      {hi != null && (
        <foreignObject x={Math.min(P.l + hi * bw, W - 120)} y={P.t} width="120" height="40">
          <div className="g-tip"><b>{serie[hi].etiqueta}</b><span>{serie[hi].accesos} ingresos</span></div>
        </foreignObject>
      )}
    </svg>
  );
}

export default function Estadisticas() {
  const [d, setD] = useState(null); const [error, setError] = useState("");
  const [seg, setSeg] = useState(null);
  useEffect(() => {
    api("/admin/estadisticas").then(setD).catch((e) => setError(e.message));
    api("/admin/seguridad").then(setSeg).catch(() => {});
  }, []);
  if (error) return <div className="error">{error}</div>;
  if (!d) return <div className="vacio">Cargando estadísticas…</div>;
  const r = d.resumen;

  return (
    <>
      <div className="seccion-titulo"><h2>Uso de la plataforma</h2></div>

      <div className="kpis">
        <div className="kpi"><div className="v">{r.cajas}</div><div className="l">Cajas ({r.cajas_activas} activas)</div></div>
        <div className="kpi"><div className="v">{r.socios}</div><div className="l">Socios activos</div></div>
        <div className="kpi"><div className="v">{r.usuarios}</div><div className="l">Usuarios totales</div></div>
        <div className="kpi"><div className="v pos">{r.accesos_30d}</div><div className="l">Ingresos (30 días)</div></div>
        <div className="kpi"><div className="v pos">{r.usuarios_activos_7d}</div><div className="l">Activos (7 días)</div></div>
      </div>

      <div className="tarjeta g-card">
        <div className="g-head"><h3>Ingresos por día (últimos 30)</h3></div>
        <BarrasAcceso serie={d.accesos_por_dia} />
      </div>

      <div className="tarjeta">
        <h3>Actividad por caja</h3>
        <div className="fila encabezado"><span>Caja</span><span>Ingresos 30d · última actividad</span></div>
        {d.por_caja.map((c) => (
          <div className="fila" key={c.slug}>
            <div><div className="principal">{c.caja} {!c.activa && <span className="pill neutro">inactiva</span>}</div>
              <div className="detalle">{c.socios} socios · {c.acciones} acciones</div></div>
            <div style={{ textAlign: "right" }}>
              <div className="cifra">{c.accesos_30d}</div>
              <div className="detalle">{fdt(c.ultima_actividad)}</div></div>
          </div>
        ))}
      </div>

      <div className="tarjeta">
        <h3>Usuarios</h3>
        <div className="fila encabezado"><span>Persona</span><span>Último acceso · ingresos 30d</span></div>
        {d.usuarios.map((u, i) => (
          <div className="fila" key={i}>
            <div><div className="principal">{u.nombre} <span className="pill neutro">{u.roles.join(", ")}</span></div>
              <div className="detalle">CI {mascaraCedula(u.cedula)} · {u.acciones} acciones</div></div>
            <div style={{ textAlign: "right" }}>
              <div className="cifra">{u.accesos_30d}</div>
              <div className="detalle">{fdt(u.ultimo_acceso)}</div></div>
          </div>
        ))}
      </div>

      {seg && (
        <div className="tarjeta">
          <h3>Estado de seguridad ({seg.puntaje}/{seg.total})</h3>
          {seg.usuarios_con_clave_inicial_pendiente > 0 &&
            <div className="detalle" style={{ color: "var(--cochinilla)", margin: "0 0 6px" }}>
              {seg.usuarios_con_clave_inicial_pendiente} usuario(s) aún no cambian su contraseña inicial.</div>}
          {seg.checks.map((c, i) => (
            <div className="fila" key={i}>
              <div><div className="principal" style={{ fontSize: 14 }}>{c.ok ? "✅" : "⚠️"} {c.clave}</div>
                <div className="detalle">{c.detalle}</div></div>
            </div>
          ))}
        </div>
      )}

      <Seguridad2FA />

      <p className="vacio" style={{ fontSize: 12.5 }}>
        Nota: se registran los ingresos (logins) y la última actividad. El “tiempo conectado”
        exacto no se mide porque la sesión es sin estado; puede añadirse con señales periódicas si se requiere.
      </p>
    </>
  );
}
