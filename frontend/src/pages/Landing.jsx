import { navigate } from "../lib/router.js";

const FEATURES = [
  { ico: "📓", t: "Libreta viva del socio", d: "Cada socio entra con su cédula y ve sus aportes, créditos y próximas cuotas desde el celular, cuando quiera." },
  { ico: "🔒", t: "Transparencia total", d: "Una bitácora de auditoría inmutable, visible para todos los socios. Se acabó el “confía en mí”." },
  { ico: "⚙️", t: "Créditos automáticos", d: "Tabla de amortización francesa generada sola, control de mora y cobros parciales sin hojas de cálculo." },
  { ico: "🏛️", t: "Multi-caja seguro", d: "Una sola plataforma para muchas cajas, con aislamiento estricto de los datos de cada comunidad." },
];

const ROLES = [
  { r: "Tesorero", d: "Registra aportes y créditos, cobra cuotas y ve el balance de la caja en tiempo real." },
  { r: "Socio", d: "Consulta su ahorro y deuda, y vigila la salud de la caja con total transparencia." },
  { r: "Administrador", d: "Crea y configura cajas, y da soporte a cada tesorero cuando lo necesita." },
];

export default function Landing({ sesion }) {
  return (
    <div className="lp">
      <header className="lp-nav">
        <div className="lp-marca">
          <img src="/favicon.svg" alt="" width="30" height="30" />
          <span className="lp-logo">Kullki</span>
          <span className="lp-labs">Yachay Deep Labs</span>
        </div>
        <button className="lp-cta-mini" onClick={() => navigate(sesion ? `/${sesion.caja_slug || "admin"}` : "/ingresar")}>
          {sesion ? "Ir a mi caja" : "Ingresar"}
        </button>
      </header>

      <section className="lp-hero">
        <div className="lp-hero-glow" aria-hidden="true" />
        <div className="lp-hero-in">
          <span className="lp-eyebrow">Yachay Deep Labs · Kichwa <em>kullki</em>: dinero</span>
          <h1>El sistema inteligente para administrar<br /><span className="oro">tus recursos y los de tus socios</span></h1>
          <p className="lp-sub">
            Kullki reemplaza el cuaderno y el Excel del tesorero por una plataforma
            donde cada movimiento queda registrado, auditado y visible. Confianza,
            transparencia y seguridad para tu caja de ahorro comunitaria.
          </p>
          <div className="lp-acciones">
            <button className="lp-cta" onClick={() => navigate("/ingresar")}>Ingresar a mi caja →</button>
            <a className="lp-link" href="https://www.yachaydeep.com/labs" target="_blank" rel="noreferrer">Conoce Yachay Deep</a>
          </div>
          <div className="lp-chips">
            <span>✓ Sin instalar nada</span><span>✓ Funciona en el celular</span><span>✓ Datos cifrados por caja</span>
          </div>
        </div>
      </section>

      <section className="lp-seccion">
        <span className="lp-eyebrow oscuro">Por qué Kullki</span>
        <h2>Todo lo que tu caja necesita, en un solo lugar</h2>
        <div className="lp-grid">
          {FEATURES.map((f) => (
            <div className="lp-card" key={f.t}>
              <div className="lp-card-ico">{f.ico}</div>
              <h3>{f.t}</h3>
              <p>{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="lp-roles">
        <span className="lp-eyebrow">Para cada persona de la caja</span>
        <h2>Un rol claro para cada quién</h2>
        <div className="lp-grid roles">
          {ROLES.map((x) => (
            <div className="lp-rol" key={x.r}>
              <div className="lp-rol-t">{x.r}</div>
              <p>{x.d}</p>
            </div>
          ))}
        </div>
        <button className="lp-cta claro" onClick={() => navigate("/ingresar")}>Comenzar ahora →</button>
      </section>

      <footer className="lp-footer">
        <div>
          <span className="lp-logo">Kullki</span>
          <p>Un producto de <a href="https://www.yachaydeep.com/labs" target="_blank" rel="noreferrer">Yachay Deep Labs</a> · Transformamos datos en conocimiento.</p>
        </div>
        <span className="lp-foot-meta">© {new Date().getFullYear()} Yachay Deep</span>
      </footer>
    </div>
  );
}
