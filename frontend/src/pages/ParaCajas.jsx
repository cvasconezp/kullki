import { useState } from "react";
import { navigate } from "../lib/router.js";

const TIERS = [
  { nombre: "Pequeña",  max: 30,  precio: 89,  tag: null },
  { nombre: "Mediana",  max: 80,  precio: 149, tag: "Más popular" },
  { nombre: "Grande",   max: 200, precio: 229, tag: null },
];

export default function ParaCajas() {
  /* ── Calculadora ── */
  const [tierIdx, setTier]       = useState(1);
  const [socios, setSocios]      = useState(20);
  const [anosHistorial, setAnos] = useState(3);

  const tier           = TIERS[tierIdx];
  const porSocioMes    = tier.precio / 12 / socios;
  const porDia         = tier.precio / 365;
  const costoMigracion = 15 + (socios * 0.30) + (anosHistorial * 5);
  const totalAno1      = tier.precio + costoMigracion;

  const fmt = (n) => n.toLocaleString("es-EC", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const usd = (n) => `$${n.toFixed(2)}`;

  /* ── Formulario ── */
  const [form, setForm] = useState({ nombre: "", caja: "", socios_num: "", mensaje: "" });
  const upd = (e) => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const abrirWhatsApp = (e) => {
    e.preventDefault();
    const texto = encodeURIComponent(
      `Hola Kullki 👋 Soy *${form.nombre || "interesado/a"}*.\n` +
      `Mi caja: *${form.caja || "—"}*.\n` +
      (form.socios_num ? `Socios: ${form.socios_num}.\n` : "") +
      (form.mensaje ? `\n${form.mensaje}` : "\nMe gustaría conocer más sobre Kullki.")
    );
    window.open(`https://wa.me/593999213871?text=${texto}`, "_blank");
  };

  return (
    <div className="lp">

      {/* ── NAV ── */}
      <header className="lp-nav">
        <div className="lp-marca" onClick={() => navigate("/")} role="button" tabIndex={0}
             onKeyDown={(e) => e.key === "Enter" && navigate("/")}
             title="Ir al inicio" style={{ cursor: "pointer" }}>
          <img src="/logo-kullki-horizontal.svg" alt="Kullki" className="lp-logo-img" />
        </div>
        <nav className="lp-nav-links" aria-label="Secciones">
          <a onClick={() => navigate("/")} style={{ cursor: "pointer" }}>← Inicio</a>
          <a href="#precios">Precios</a>
          <a href="#adquisicion">Por qué vale</a>
          <a href="#contacto">Contacto</a>
        </nav>
        <button className="lp-cta-mini" onClick={() => navigate("/ingresar")}>Ingresar</button>
      </header>

      {/* ── HERO ── */}
      <section className="lp-hero lp-hero-sm">
        <div className="lp-hero-glow" aria-hidden="true" />
        <div className="lp-hero-in">
          <span className="lp-eyebrow">Para presidentes, tesoreros y directivos</span>
          <h1>Kullki para tu caja<br /><span className="oro">precio fijo, sin sorpresas</span></h1>
          <p className="lp-sub">
            Elige el plan según el tamaño de tu caja. El precio no cambia durante el año
            y la renovación usa las mismas condiciones — a menos que tu caja crezca de tramo.
          </p>
          <div className="lp-acciones">
            <a className="lp-cta" href="#contacto">Solicitar demo →</a>
            <a className="lp-link" href="#precios">Ver precios</a>
          </div>
        </div>
      </section>

      {/* ── CALCULADORA ── */}
      <section id="precios" className="lp-calc">
        <div className="lp-calc-in">
          <span className="lp-eyebrow">Planes anuales · precio fijo</span>
          <h2>Elige el plan de tu caja</h2>
          <p className="lp-calc-sub">El precio es fijo por el tramo de socios. Sin letra chica, sin recálculos sorpresa.</p>

          {/* ── Tier cards ── */}
          <div className="lp-tiers">
            {TIERS.map((t, i) => (
              <div key={i}
                   className={`lp-tier${i === tierIdx ? " lp-tier-sel" : ""}${t.tag ? " lp-tier-pop" : ""}`}
                   onClick={() => setTier(i)}
                   role="button" tabIndex={0}
                   onKeyDown={(e) => e.key === "Enter" && setTier(i)}>
                {t.tag && <div className="lp-tier-tag">{t.tag}</div>}
                <div className="lp-tier-nombre">{t.nombre}</div>
                <div className="lp-tier-max">hasta {t.max} socios</div>
                <div className="lp-tier-precio">${t.precio}<span>/año</span></div>
                <div className="lp-tier-mes">${(t.precio / 12).toFixed(2)}/mes</div>
              </div>
            ))}
          </div>
          <p className="lp-tiers-nota">¿Más de 200 socios? <a href="#contacto">Escríbenos</a> para una propuesta personalizada.</p>

          {/* ── Sliders migración ── */}
          <div className="lp-calc-grid">
            <div className="lp-calc-sliders">
              <div className="lp-calc-row">
                <div className="lp-calc-lbl">
                  <span>Número de socios actuales</span>
                  <strong>{socios} socios</strong>
                </div>
                <input type="range" className="lp-calc-slider"
                  min="5" max={tier.max} step="1" value={Math.min(socios, tier.max)}
                  onChange={e => setSocios(+e.target.value)} />
                <div className="lp-calc-ticks"><span>5</span><span>{tier.max}</span></div>
              </div>
              <div className="lp-calc-row lp-calc-row-mig">
                <div className="lp-calc-lbl">
                  <span>Años de historial a migrar</span>
                  <strong>{anosHistorial} año{anosHistorial !== 1 ? "s" : ""}</strong>
                </div>
                <input type="range" className="lp-calc-slider lp-slider-mig"
                  min="0" max="15" step="1" value={anosHistorial}
                  onChange={e => setAnos(+e.target.value)} />
                <div className="lp-calc-ticks"><span>0 (solo datos actuales)</span><span>15 años</span></div>
              </div>
              <p className="lp-calc-formula">
                El precio no varía con el capital ni los aportes — solo con el tramo de socios.
                Al renovar, si tu caja sigue en el mismo tramo, el precio es idéntico.
              </p>
            </div>

            {/* Resultado */}
            <div className="lp-calc-result">
              <span className="lp-calc-etiq">Tu precio estimado</span>
              <div className="lp-calc-precio">
                ${tier.precio}<span> / año</span>
              </div>
              <div className="lp-calc-desglose">
                <div className="lp-calc-linea">
                  <span>Plan {tier.nombre} · hasta {tier.max} socios</span>
                  <span>${tier.precio}</span>
                </div>
                <div className="lp-calc-linea">
                  <span>Precio mensual</span>
                  <span>${(tier.precio / 12).toFixed(2)}</span>
                </div>
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
                  <div className="lp-calc-kval">{usd(porDia)}</div>
                  <div className="lp-calc-klab">por día</div>
                </div>
              </div>
              <div className="lp-calc-mig-box">
                <div className="lp-calc-mig-header">
                  <span className="lp-calc-mig-ico">📂</span>
                  <span>Activación + migración de datos <em>(solo año 1)</em></span>
                </div>
                <div className="lp-calc-linea">
                  <span>Configuración base</span><span>$15.00</span>
                </div>
                <div className="lp-calc-linea">
                  <span>Migración · {socios} socios × $0.30</span>
                  <span>${(socios * 0.30).toFixed(2)}</span>
                </div>
                <div className="lp-calc-linea">
                  <span>Historial · {anosHistorial} año{anosHistorial !== 1 ? "s" : ""} × $5</span>
                  <span>${(anosHistorial * 5).toFixed(2)}</span>
                </div>
                <div className="lp-calc-mig-total">
                  <span>Total año 1</span>
                  <span>${totalAno1.toFixed(2)}</span>
                </div>
                <div className="lp-calc-mig-rec">
                  Año 2 en adelante: <strong>${tier.precio} / año</strong> — mismo precio si tu caja no cambia de tramo
                </div>
              </div>
              <a className="lp-cta lp-calc-cta" href="#contacto">
                Solicitar demo →
              </a>
              <a href="#adquisicion" className="lp-calc-nudge">
                ¿Qué obtiene tu caja por este precio? ↓
              </a>
            </div>

          </div>
        </div>
      </section>

      {/* ── ANÁLISIS DE ADQUISICIÓN ── */}
      <section id="adquisicion" className="lp-adquisicion">
        <div className="lp-adq-in">
          <span className="lp-eyebrow oscuro">Lo que obtienes a cambio</span>
          <h2>Kullki en perspectiva</h2>
          <p className="lp-adq-intro">
            Plan <strong>{tier.nombre}</strong> — {socios} socios, <strong>${tier.precio} al año</strong>.
            Esto es lo que significa ese número.
          </p>
          <div className="lp-adq-grid">
            <div className="lp-adq-card">
              <div className="lp-adq-val">{usd(porSocioMes)}</div>
              <div className="lp-adq-tit">por socio al mes</div>
              <p>Cada persona de la caja paga menos que un mensaje de texto al mes.
                A cambio: su libreta digital, historial completo y acceso desde el celular.</p>
            </div>
            <div className="lp-adq-card">
              <div className="lp-adq-val">{usd(porDia)}</div>
              <div className="lp-adq-tit">por día</div>
              <p>Menos que una llamada al día. Kullki trabaja los 365 días del año —
                registra, calcula, respalda y mantiene todo al día sin intervención.</p>
            </div>
            <div className="lp-adq-card">
              <div className="lp-adq-val">7</div>
              <div className="lp-adq-tit">servicios incluidos</div>
              <p>Soporte, dominio, backups, seguridad, nuevas funciones, adaptación a tu caja
                y migración de datos — todo en un solo precio, sin módulos adicionales.</p>
            </div>
            <div className="lp-adq-card">
              <div className="lp-adq-val">= año 2</div>
              <div className="lp-adq-tit">precio predecible</div>
              <p>Si tu caja no sube de tramo, el precio de renovación es exactamente el mismo.
                Sin recálculos, sin sorpresas — sabes de antemano lo que pagarás.</p>
            </div>
          </div>
          <div className="lp-adq-nota">
            <strong>Sin costos ocultos.</strong> El precio se fija por tramo de socios y no varía durante el año.
            Si tu caja crece y supera el límite del plan, migras al siguiente en la renovación — no antes.
          </div>

          {/* ── Beneficios cualitativos ── */}
          <div className="lp-inc-tit">Incluido en tu precio</div>
          <div className="lp-inc-grid">
            <div className="lp-inc-item">
              <span className="lp-inc-ico">💬</span>
              <div>
                <strong>Soporte directo</strong>
                <p>Atención por WhatsApp y correo. Te ayudamos a configurar tu caja, resolver dudas y resolver problemas en el momento.</p>
              </div>
            </div>
            <div className="lp-inc-item">
              <span className="lp-inc-ico">🌐</span>
              <div>
                <strong>Dominio propio de tu caja</strong>
                <p>Tu plataforma en línea accesible en <code>kullki.yachaydeep.com/tu-caja</code> — nada que instalar, disponible desde cualquier dispositivo.</p>
              </div>
            </div>
            <div className="lp-inc-item">
              <span className="lp-inc-ico">🗄️</span>
              <div>
                <strong>Base de datos y backups automáticos</strong>
                <p>Tus datos se guardan en servidores seguros y con respaldo diario. Si algo falla, los recuperamos. Tú nunca pierdes un registro.</p>
              </div>
            </div>
            <div className="lp-inc-item">
              <span className="lp-inc-ico">🔒</span>
              <div>
                <strong>Seguridad integral</strong>
                <p>Conexión cifrada HTTPS/SSL, autenticación en dos pasos para tesoreros, control de acceso por roles y protección contra intentos de acceso no autorizados.</p>
              </div>
            </div>
            <div className="lp-inc-item">
              <span className="lp-inc-ico">🚀</span>
              <div>
                <strong>Nuevas funcionalidades incluidas</strong>
                <p>Seguimos desarrollando Kullki. Las mejoras y nuevas herramientas llegan automáticamente a tu caja, sin costos adicionales.</p>
              </div>
            </div>
            <div className="lp-inc-item">
              <span className="lp-inc-ico">⚙️</span>
              <div>
                <strong>Se adapta a tu caja</strong>
                <p>Configuramos los parámetros según las reglas de tu organización: tipos de aporte, plazos de crédito, tasas y estructura de socios.</p>
              </div>
            </div>
            <div className="lp-inc-item">
              <span className="lp-inc-ico">📂</span>
              <div>
                <strong>Migración de datos incluida</strong>
                <p>Si tu caja lleva años en Excel, te ayudamos a importar el historial completo: socios, aportes y créditos. Empiezas en Kullki con todo al día.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── CONTACTO ── */}
      <section id="contacto" className="lp-contacto">
        <div className="lp-contacto-in">
          <span className="lp-eyebrow">Sin compromiso · Respondemos en menos de 24 h</span>
          <h2>Agenda una demo o escríbenos</h2>
          <p className="lp-contacto-sub">
            Cuéntanos de tu caja y te mostramos Kullki en acción. La forma más rápida es por WhatsApp.
          </p>

          <div className="lp-contacto-grid">

            {/* Canales directos */}
            <div className="lp-contacto-canales">
              <a className="lp-canal lp-canal-wa"
                 href="https://wa.me/593999213871"
                 target="_blank" rel="noreferrer">
                <span className="lp-canal-ico">💬</span>
                <div>
                  <div className="lp-canal-tit">WhatsApp</div>
                  <div className="lp-canal-val">+593 99 921 3871</div>
                  <div className="lp-canal-nota">Canal más rápido · llamadas y mensajes</div>
                </div>
              </a>
              <a className="lp-canal lp-canal-mail"
                 href="mailto:yachaydeep@gmail.com?subject=Demo%20Kullki"
                 target="_blank" rel="noreferrer">
                <span className="lp-canal-ico">✉️</span>
                <div>
                  <div className="lp-canal-tit">Correo</div>
                  <div className="lp-canal-val">yachaydeep@gmail.com</div>
                  <div className="lp-canal-nota">Propuestas y temas formales</div>
                </div>
              </a>
              <div className="lp-canal lp-canal-loc">
                <span className="lp-canal-ico">📍</span>
                <div>
                  <div className="lp-canal-tit">Ubicación</div>
                  <div className="lp-canal-val">Cayambe, Ecuador</div>
                  <div className="lp-canal-nota">Atención presencial y remota en todo el país</div>
                </div>
              </div>
            </div>

            {/* Formulario → WhatsApp */}
            <form className="lp-contacto-form" onSubmit={abrirWhatsApp}>
              <p className="lp-form-intro">O déjanos tus datos y te contactamos nosotros:</p>
              <div className="lp-form-row">
                <div className="lp-form-campo">
                  <label>Tu nombre</label>
                  <input name="nombre" required placeholder="María Torres"
                    value={form.nombre} onChange={upd} />
                </div>
                <div className="lp-form-campo">
                  <label>Nombre de la caja</label>
                  <input name="caja" required placeholder="Caja Comunidad Nueva Vida"
                    value={form.caja} onChange={upd} />
                </div>
              </div>
              <div className="lp-form-campo">
                <label>Número de socios <span>(aproximado)</span></label>
                <input name="socios_num" type="number" min="1" placeholder="ej. 45"
                  value={form.socios_num} onChange={upd} />
              </div>
              <div className="lp-form-campo">
                <label>¿Algo más que quieras contarnos? <span>(opcional)</span></label>
                <textarea name="mensaje" rows={3}
                  placeholder="Hace cuánto funciona tu caja, qué usan hoy para administrarla, dudas..."
                  value={form.mensaje} onChange={upd} />
              </div>
              <button type="submit" className="lp-cta lp-form-submit">
                💬 Enviar por WhatsApp →
              </button>
              <p className="lp-form-nota">
                Se abrirá WhatsApp con tu mensaje listo para enviar.
              </p>
            </form>

          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="lp-footer">
        <div className="lp-footer-in">
          <div className="lp-footer-marca">
            <img src="/logo-kullki-negativo.svg" alt="Kullki" className="lp-footer-negativo" />
            <p>El dinero de tu comunidad, claro y a la vista.</p>
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
