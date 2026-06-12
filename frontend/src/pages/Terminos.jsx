import { navigate } from "../lib/router.js";

export default function Terminos() {
  return (
    <div className="lp">
      <header className="lp-nav">
        <div className="lp-marca" onClick={() => navigate("/")} role="button" tabIndex={0}>
          <img src="/favicon.svg" alt="" width="32" height="32" />
          <span className="lp-logo">Kullki</span>
        </div>
        <button className="lp-cta-mini" onClick={() => navigate("/")}>Volver al inicio</button>
      </header>
      <div className="doc-legal">
        <h1>Términos y condiciones de uso</h1>
        <p className="doc-meta">Kullki — un producto de Yachay Deep Labs.</p>

        <h2>1. Objeto</h2>
        <p>Kullki es una herramienta para que las cajas de ahorro comunitarias registren y consulten sus aportes, retiros y créditos de forma transparente. Yachay Deep Labs provee el software; la administración del dinero y las decisiones financieras corresponden a cada caja y su directiva.</p>

        <h2>2. Cuentas y responsabilidades</h2>
        <p>Cada persona es responsable de la confidencialidad de su contraseña. El tesorero y la directiva son responsables de la veracidad de la información que registran. Kullki no custodia ni transfiere dinero: es un sistema de registro.</p>

        <h2>3. Uso aceptable</h2>
        <p>No se permite usar la plataforma para fines ilícitos, ni intentar acceder a datos de otras cajas. Cada caja ve únicamente su propia información.</p>

        <h2>4. Disponibilidad</h2>
        <p>Procuramos la mayor disponibilidad del servicio, pero puede haber interrupciones por mantenimiento o causas externas. La información cuenta con bitácora y respaldos, pero recomendamos a cada caja conservar también sus actas físicas.</p>

        <h2>5. Limitación de responsabilidad</h2>
        <p>Kullki es una herramienta de apoyo. Las cifras mostradas dependen de lo que registra cada caja. Yachay Deep Labs no se responsabiliza por errores de registro, decisiones financieras o pérdidas derivadas del mal uso.</p>

        <h2>6. Datos personales</h2>
        <p>El tratamiento de datos se rige por nuestra <a href="/privacidad">Política de privacidad</a>, conforme a la LOPDP del Ecuador.</p>

        <h2>7. Contacto</h2>
        <p>Yachay Deep Labs — <a href="mailto:cvasconezp@gmail.com">cvasconezp@gmail.com</a>.</p>
        <p className="doc-meta" style={{ marginTop: 24 }}>Documento de referencia; cada caja puede adaptarlo a su reglamento interno.</p>
      </div>
      <footer className="lp-footer"><div className="lp-footer-in">
        <div className="lp-footer-marca"><span className="lp-logo">Kullki</span></div>
        <span className="lp-foot-meta">© {new Date().getFullYear()} Yachay Deep Labs</span>
      </div></footer>
    </div>
  );
}
