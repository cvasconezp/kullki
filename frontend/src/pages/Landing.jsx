import { useState } from "react";
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

  /* ── Calculadora ── */
  const [capital, setCapital]   = useState(5000);
  const [socios, setSocios]     = useState(20);
  const [aporteM, setAporteM]   = useState(20);

  const compCapital     = capital * 0.015;
  const compSocios      = socios * aporteM * 12 * 0.005;
  const precioCalc      = Math.max(120, compCapital + compSocios);
  const enPiso          = precioCalc === 75;
  const porSocioMes     = precioCalc / 12 / socios;
  const pctCapital      = (precioCalc / capital) * 100;
  const aportesAnuales  = socios * aporteM * 12;
  const capitalXdolar   = Math.round(capital / precioCalc);

  const fmt = (n) => n.toLocaleString("es-EC", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const usd = (n) => `$${n.toFixed(2)}`;

  return (
    <div className="lp">
      <header className="lp-nav">
        <div className="lp-marca" onClick={() => navigate("/")} role="button" tabIndex={0}
             onKeyDown={(e) => e.key === "Enter" && navigate("/")}>
          <img src="/favicon.svg" alt="" width="34" height="34" />
          <span className="lp-logo">Kullki</span>
          <span className="lp-labs">por Yachay Deep Labs</span>
        </div>
        <button className="lp-cta-mini" onClick={irApp}>{sesion ? "Ir a mi caja" : "Ingresar"}</button>
      </header>

      {/* HERO */}
      <section className="lp-hero">
        <div className="lp-hero-glow" aria-hidden="true" />
        <div className="lp-hero-in">
          <span className="lp-eyebrow">Cajas de ahorro comunitarias · Kichwa <em>kullki</em>: dinero</span>
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
      <section className="lp-historia">
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
      <section className="lp-seccion">
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
      <section className="lp-roles">
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

      {/* ── CALCULADORA DE PRECIOS ── */}
      <section className="lp-calc">
        <div className="lp-calc-in">
          <span className="lp-eyebrow">Para cada caja, un precio proporcional</span>
          <h2>Calcula cuánto cuesta Kullki para tu caja</h2>
          <p className="lp-calc-sub">
            Mueve los controles y ve el precio en tiempo real. Sin letra chica.
          </p>
          <div className="lp-calc-grid">

            {/* ─ Sliders ─ */}
            <div className="lp-calc-sliders">

              <div className="lp-calc-row">
                <div className="lp-calc-lbl">
                  <span>Capital de la caja</span>
                  <strong>${fmt(capital)}</strong>
                </div>
                <input type="range" className="lp-calc-slider"
                  min="500" max="30000" step="500" value={capital}
                  onChange={e => setCapital(+e.target.value)} />
                <div className="lp-calc-ticks"><span>$500</span><span>$30 000</span></div>
              </div>

              <div className="lp-calc-row">
                <div className="lp-calc-lbl">
                  <span>Número de socios</span>
                  <strong>{socios} socios</strong>
                </div>
                <input type="range" className="lp-calc-slider"
                  min="5" max="150" step="1" value={socios}
                  onChange={e => setSocios(+e.target.value)} />
                <div className="lp-calc-ticks"><span>5</span><span>150</span></div>
              </div>

              <div className="lp-calc-row">
                <div className="lp-calc-lbl">
                  <span>Aporte ordinario mensual</span>
                  <strong>${aporteM} / mes</strong>
                </div>
                <input type="range" className="lp-calc-slider"
                  min="5" max="100" step="5" value={aporteM}
                  onChange={e => setAporteM(+e.target.value)} />
                <div className="lp-calc-ticks"><span>$5</span><span>$100</span></div>
              </div>

              <p className="lp-calc-formula">
                Precio = 1.5 % del capital + 0.5 % de aportes anuales · mínimo $120
              </p>
            </div>

            {/* ─ Resultado ─ */}
            <div className="lp-calc-result">
              <span className="lp-calc-etiq">Tu precio estimado</span>
              <div className="lp-calc-precio">
                ${fmt(precioCalc)}<span> / año</span>
              </div>

              <div className="lp-calc-desglose">
                <div className="lp-calc-linea">
                  <span>1.5 % del capital (${fmt(capital)})</span>
                  <span>${fmt(compCapital)}</span>
                </div>
                <div className="lp-calc-linea">
                  <span>0.5 % aportes anuales · {socios} socios</span>
                  <span>${fmt(compSocios)}</span>
                </div>
                {enPiso && (
                  <div className="lp-calc-piso">⚡ Precio mínimo aplicado ($120)</div>
                )}
              </div>

              <ul className="lp-calc-incluye">
                <li>Libreta digital para cada socio</li>
                <li>Cierres y cálculos automáticos</li>
                <li>Historial permanente de la caja</li>
                <li>Acceso desde el celular, sin instalar nada</li>
              </ul>

              <hr className="lp-calc-sep" />

              <div className="lp-calc-kpis">
                <div>
                  <div className="lp-calc-kval">{usd(porSocioMes)}</div>
                  <div className="lp-calc-klab">por socio al mes</div>
                </div>
                <div>
                  <div className="lp-calc-kval">${(precioCalc / 12).toFixed(2)}</div>
                  <div className="lp-calc-klab">por mes</div>
                </div>
              </div>

              <button className="lp-cta lp-calc-cta" onClick={() => navigate("/ingresar")}>
                Empezar con mi caja →
              </button>
            </div>

          </div>
        </div>
      </section>

      {/* ── ANÁLISIS DE ADQUISICIÓN ── */}
      <section className="lp-adquisicion">
        <div className="lp-adq-in">
          <span className="lp-eyebrow oscuro">Lo que obtienes a cambio</span>
          <h2>Kullki en perspectiva</h2>
          <p className="lp-adq-intro">
            Para la caja que configuraste arriba — {socios} socios, capital de ${fmt(capital)},
            aportes de ${aporteM}/mes — Kullki cuesta <strong>${fmt(precioCalc)} al año</strong>.
            Esto es lo que significa ese número.
          </p>

          <div className="lp-adq-grid">
            <div className="lp-adq-card">
              <div className="lp-adq-val">{usd(porSocioMes)}</div>
              <div className="lp-adq-tit">por socio al mes</div>
              <p>
                Cada persona de la caja paga menos que un mensaje de texto al mes.
                A cambio: su libreta digital, historial completo y acceso desde el celular.
              </p>
            </div>
            <div className="lp-adq-card">
              <div className="lp-adq-val">{capitalXdolar}×</div>
              <div className="lp-adq-tit">capital respaldado por cada $1</div>
              <p>
                Por cada dólar invertido en Kullki, ${capitalXdolar} de capital comunitario
                quedan registrados, visibles y protegidos ante cualquier cambio de tesorero.
              </p>
            </div>
            <div className="lp-adq-card">
              <div className="lp-adq-val">${fmt(aportesAnuales)}</div>
              <div className="lp-adq-tit">en aportes gestionados al año</div>
              <p>
                Kullki administra todos los movimientos — aportes, créditos, intereses,
                multas y cierres — sin hojas de cálculo ni riesgo de error humano.
              </p>
            </div>
            <div className="lp-adq-card">
              <div className="lp-adq-val">{pctCapital.toFixed(1)} %</div>
              <div className="lp-adq-tit">del capital, por un año completo</div>
              <p>
                Una fracción pequeña del capital cubre transparencia total, registros
                permanentes, informes automáticos y la tranquilidad de la comunidad.
              </p>
            </div>
          </div>

          <div className="lp-adq-nota">
            <strong>Sin costos ocultos.</strong> El precio se calcula una sola vez al año,
            proporcional al tamaño real de tu caja. Las cajas pequeñas pagan menos;
            las que crecen, pagan en proporción a lo que gestionan.
            <br />
            <button className="lp-cta" style={{ marginTop: "24px" }} onClick={() => navigate("/ingresar")}>
              Empezar ahora — es gratis el primer mes →
            </button>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="lp-footer">
        <div className="lp-footer-in">
          <div className="lp-footer-marca">
            <span className="lp-logo">Kullki</span>
            <p>El dinero de tu comunidad, claro y a la vista.</p>
          </div>
          <div className="lp-footer-yd">
            <a href="https://www.yachaydeep.com/labs" target="_blank" rel="noreferrer">
              <img src="/logo-hero-dark.svg" alt="Yachay Deep" height="34" />
            </a>
            <span className="lp-foot-meta"><a href="/privacidad" style={{ color: "inherit", textDecoration: "underline" }}>Privacidad</a> · <a href="/terminos" style={{ color: "inherit", textDecoration: "underline" }}>Términos</a> · © {new Date().getFullYear()}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
