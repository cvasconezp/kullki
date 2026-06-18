import { useEffect } from "react";
import { navigate } from "../lib/router.js";

const BENEFICIOS = [
  { ico: "📓", t: "Una libreta que todos pueden ver",
    d: "Cada aporte y cada préstamo queda escrito a la vista de la comunidad. La confianza deja de ser un acto de fe: ahora se puede comprobar." },
  { ico: "📱", t: "Tu ahorro, en tu bolsillo",
    d: "El socio entra con su cédula y ve crecer su dinero desde el celular, cuando quiera. Sin pedir permiso, sin esperar a la asamblea." },
  { ico: "⏱️", t: "El cierre del mes, en minutos",
    d: "El tesorero deja atrás las noches de Excel. Aportes, créditos, intereses y mora se calculan solos, sin errores ni cuentas a mano." },
  { ico: "🛡️", t: "Nada se pierde, nada se olvida",
    d: "Aunque cambie el tesorero, la historia de la caja queda intacta y protegida. La memoria ya no depende de una sola persona." },
];

const ROLES = [
  { r: "El socio", d: "Ve su ahorro, sus créditos y sus próximas cuotas. Confía porque ve, no porque le dicen." },
  { r: "El tesorero", d: "Registra, cobra y cierra el mes en minutos. Trabaja tranquilo, con todo respaldado." },
  { r: "La directiva", d: "Configura la caja y acompaña a cada tesorero. Una mirada clara sobre toda la comunidad." },
];

export default function Landing({ sesion }) {
  const irApp = () => navigate(sesion ? `/${sesion.caja_slug || "admin"}` : "/ingresar");

  useEffect(() => {
    const ids = ["inicio", "historia", "beneficios", "roles"];
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries.find(e => e.isIntersecting);
        if (visible) history.replaceState(null, "", "#" + visible.target.id);
      },
      { rootMargin: "-40% 0px -55% 0px", threshold: 0 }
    );
    ids.forEach(id => { const el = document.getElementById(id); if (el) obs.observe(el); });
    return () => obs.disconnect();
  }, []);

  return (
    <div className="lp">
      <header className="lp-nav">
        <div className="lp-marca" onClick={() => navigate("/")} role="button" tabIndex={0}
             onKeyDown={(e) => e.key === "Enter" && navigate("/")}
             title="Ir al inicio" style={{ cursor: "pointer" }}>
          <img src="/logo-kullki-horizontal.svg" alt="Kullki" className="lp-logo-img" />
        </div>
        <nav className="lp-nav-links" aria-label="Secciones">
          <a href="#historia">Por qué</a>
          <a href="#beneficios">Beneficios</a>
          <a href="#roles">Roles</a>
          <a onClick={() => navigate("/para-cajas")} style={{ cursor: "pointer" }}>Para tu caja</a>
        </nav>
        <button className="lp-cta-mini" onClick={irApp}>{sesion ? "Ir a mi caja" : "Ingresar"}</button>
      </header>

      {/* HERO */}
      <section id="inicio" className="lp-hero">
        <div className="lp-hero-glow" aria-hidden="true" />
        <div className="lp-hero-in">
          <span className="lp-eyebrow">Cajas de ahorro comunitarias</span>
          <h1>El dinero de tu comunidad,<br /><span className="oro">claro y a la vista de todos</span></h1>
          <p className="lp-sub">
            Kullki es el sistema inteligente para administrar tus recursos y los de tus
            socios. Convierte el cuaderno del tesorero en una libreta viva que toda la
            caja puede ver — con la transparencia que construye confianza y la seguridad
            que tu comunidad merece.
          </p>
          <div className="lp-acciones">
            <button className="lp-cta" onClick={() => navigate("/ingresar")}>Ingresar a mi caja →</button>
            <a className="lp-link" href="https://www.yachaydeep.com/labs" target="_blank" rel="noreferrer">Conoce Yachay Deep</a>
          </div>
          <div className="lp-chips">
            <span>✓ Sin instalar nada</span><span>✓ Funciona en el celular</span><span>✓ Datos protegidos por caja</span>
          </div>
        </div>
      </section>

      {/* HISTORIA / EL PROBLEMA */}
      <section id="historia" className="lp-historia">
        <div className="lp-historia-in">
          <span className="lp-eyebrow oscuro">Por qué existe Kullki</span>
          <h2>Tu caja nació de la confianza. Es hora de cuidarla.</h2>
          <p className="lp-parrafo">
            Una caja de ahorro es vecinos que juntan su dinero para prestarse entre sí y
            crecer juntos. Es esfuerzo, es comunidad, es confianza. Pero durante años todo
            ese esfuerzo vivió en un cuaderno que solo el tesorero entendía. Cuando algo no
            cuadraba, la confianza se resquebrajaba. Cuando el tesorero cambiaba, la
            historia se perdía. <strong>El dinero de muchos dependía de la memoria de uno.</strong>
          </p>
          <div className="lp-antes-despues">
            <div className="lp-ad antes">
              <span className="lp-ad-tag">Antes</span>
              <ul>
                <li>El cuaderno o el Excel del tesorero</li>
                <li>"Confía en mí" como única garantía</li>
                <li>Cuentas a mano, errores y discusiones</li>
                <li>Si cambia el tesorero, se pierde todo</li>
              </ul>
            </div>
            <div className="lp-ad despues">
              <span className="lp-ad-tag oro">Con Kullki</span>
              <ul>
                <li>Una libreta viva que todos ven</li>
                <li>Cada movimiento queda registrado y a la vista</li>
                <li>Cálculos automáticos, sin errores</li>
                <li>La historia de la caja, intacta para siempre</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* BENEFICIOS */}
      <section id="beneficios" className="lp-seccion">
        <span className="lp-eyebrow oscuro">Lo que cambia para tu comunidad</span>
        <h2>Confianza que se puede comprobar</h2>
        <div className="lp-grid">
          {BENEFICIOS.map((f) => (
            <div className="lp-card" key={f.t}>
              <div className="lp-card-ico">{f.ico}</div>
              <h3>{f.t}</h3>
              <p>{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CITA DE MARCA */}
      <section className="lp-cita">
        <p>"El dinero de la comunidad, <span className="oro">a la vista de todos.</span>"</p>
      </section>

      {/* ROLES */}
      <section id="roles" className="lp-roles">
        <div className="lp-roles-in">
          <span className="lp-eyebrow">Para cada persona de la caja</span>
          <h2>Todos miran la misma verdad</h2>
          <div className="lp-grid roles">
            {ROLES.map((x) => (
              <div className="lp-rol" key={x.r}>
                <div className="lp-rol-t">{x.r}</div>
                <p>{x.d}</p>
              </div>
            ))}
          </div>
          <button className="lp-cta claro" onClick={() => navigate("/ingresar")}>Comenzar ahora →</button>
        </div>
      </section>

      {/* CALLOUT — Para cajas interesadas */}
      <section className="lp-para-cajas">
        <div className="lp-para-cajas-in">
          <span className="lp-eyebrow">¿Tu caja no usa Kullki todavía?</span>
          <h2>Lleva la transparencia a tu comunidad</h2>
          <p>Calcula el precio exacto para tu caja y agenda una demostración sin compromiso.</p>
          <button className="lp-cta" onClick={() => navigate("/para-cajas")}>
            Ver precios y solicitar demo →
          </button>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="lp-footer">
        <div className="lp-footer-in">
          <div className="lp-footer-marca">
            <img src="/favicon.svg" alt="Kullki" className="lp-footer-isotipo" />
            <div>
              <span className="lp-logo">Kullki</span>
              <p>El dinero de tu comunidad, claro y a la vista.</p>
            </div>
          </div>
          <div className="lp-footer-yd">
            <span className="lp-foot-attrib">Kullki por <a href="https://www.yachaydeep.com" target="_blank" rel="noreferrer">Yachay Deep Labs</a></span>
            <span className="lp-foot-meta">
              <a href="/privacidad" style={{ color: "inherit", textDecoration: "underline" }}>Privacidad</a>
              {" · "}
              <a href="/terminos" style={{ color: "inherit", textDecoration: "underline" }}>Términos</a>
              {" · © "}{new Date().getFullYear()}
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
