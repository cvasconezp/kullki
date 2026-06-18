import { useState } from "react";
import { navigate } from "../lib/router.js";

export default function ParaCajas() {
  /* ── Calculadora ── */
  const [capital, setCapital]   = useState(5000);
  const [socios, setSocios]     = useState(20);
  const [aporteM, setAporteM]   = useState(20);

  const compCapital    = capital * 0.015;
  const compSocios     = socios * aporteM * 12 * 0.010;
  const precioCalc     = Math.max(120, compCapital + compSocios);
  const enPiso         = precioCalc === 120;
  const porSocioMes    = precioCalc / 12 / socios;
  const pctCapital     = (precioCalc / capital) * 100;
  const aportesAnuales = socios * aporteM * 12;
  const capitalXdolar  = Math.round(capital / precioCalc);

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
          <h1>Kullki para tu caja<br /><span className="oro">a un precio proporcional</span></h1>
          <p className="lp-sub">
            Calcula exactamente cuánto cuesta para tu caja, entiende lo que obtienes
            a cambio, y agenda una demostración cuando quieras.
          </p>
          <div className="lp-acciones">
            <a className="lp-cta" href="#contacto">Solicitar demo →</a>
            <a className="lp-link" href="#precios">Calcular precio</a>
          </div>
        </div>
      </section>

      {/* ── CALCULADORA ── */}
      <section id="precios" className="lp-calc">
        <div className="lp-calc-in">
          <span className="lp-eyebrow">Para cada caja, un precio proporcional</span>
          <h2>Calcula cuánto cuesta Kullki para tu caja</h2>
          <p className="lp-calc-sub">Mueve los controles y ve el precio en tiempo real. Sin letra chica.</p>
          <div className="lp-calc-grid">

            {/* Sliders */}
            <div className="lp-calc-sliders">
              <div className="lp-calc-row">
                <div className="lp-calc-lbl">
                  <span>Capital de la caja</span>
                  <strong>${fmt(capital)}</strong>
                </div>
                <input type="range" className="lp-calc-slider"
                  min="500" max="50000" step="500" value={capital}
                  onChange={e => setCapital(+e.target.value)} />
                <div className="lp-calc-ticks"><span>$500</span><span>$50 000</span></div>
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
                Precio = 1.5 % del capital + 1 % de aportes anuales · mínimo $120
              </p>
            </div>

            {/* Resultado */}
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
                  <span>1 % aportes anuales · {socios} socios</span>
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
            Para la caja que configuraste arriba — {socios} socios, capital de ${fmt(capital)},
            aportes de ${aporteM}/mes — Kullki cuesta <strong>${fmt(precioCalc)} al año</strong>.
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
              <div className="lp-adq-val">{capitalXdolar}×</div>
              <div className="lp-adq-tit">capital respaldado por cada $1</div>
              <p>Por cada dólar invertido en Kullki, ${capitalXdolar} de capital comunitario
                quedan registrados, visibles y protegidos ante cualquier cambio de tesorero.</p>
            </div>
            <div className="lp-adq-card">
              <div className="lp-adq-val">${fmt(aportesAnuales)}</div>
              <div className="lp-adq-tit">en aportes gestionados al año</div>
              <p>Kullki administra todos los movimientos — aportes, créditos, intereses,
                multas y cierres — sin hojas de cálculo ni riesgo de error humano.</p>
            </div>
            <div className="lp-adq-card">
              <div className="lp-adq-val">{pctCapital.toFixed(1)} %</div>
              <div className="lp-adq-tit">del capital, por un año completo</div>
              <p>Una fracción pequeña del capital cubre transparencia total, registros
                permanentes, informes automáticos y la tranquilidad de la comunidad.</p>
            </div>
          </div>
          <div className="lp-adq-nota">
            <strong>Sin costos ocultos.</strong> El precio se calcula una sola vez al año,
            proporcional al tamaño real de tu caja. Las cajas pequeñas pagan menos;
            las que crecen, pagan en proporción a lo que gestionan.
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
