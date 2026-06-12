import { navigate } from "../lib/router.js";

export default function Privacidad() {
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
        <h1>Política de privacidad y tratamiento de datos</h1>
        <p className="doc-meta">Kullki — un producto de Yachay Deep Labs · Conforme a la Ley Orgánica de Protección de Datos Personales (LOPDP) del Ecuador.</p>

        <h2>1. Quiénes somos</h2>
        <p>Kullki es una plataforma para la gestión de cajas de ahorro comunitarias. Cada caja de ahorro es responsable de los datos de sus socios; Yachay Deep Labs actúa como encargado del tratamiento, proveyendo la tecnología.</p>

        <h2>2. Qué datos tratamos</h2>
        <p>Datos de identificación y contacto (nombres, cédula, teléfono, WhatsApp, correo, dirección), datos demográficos opcionales (fecha de nacimiento, género, estado civil, nivel de instrucción, ocupación, cargas familiares) y datos financieros propios de la caja (aportes, retiros, créditos, cuotas).</p>

        <h2>3. Para qué los usamos</h2>
        <p>Únicamente para administrar la caja de ahorro: registrar movimientos, calcular créditos e intereses, generar informes y estados de cuenta, y elaborar estadísticas agregadas que ayuden a la comunidad a entenderse mejor. No vendemos ni cedemos datos a terceros con fines comerciales.</p>

        <h2>4. Base legal</h2>
        <p>El tratamiento se realiza con el <strong>consentimiento</strong> del socio, otorgado al momento de su registro, y para la ejecución de su relación con la caja.</p>

        <h2>5. Tus derechos</h2>
        <p>Como socio puedes ejercer tus derechos de <strong>acceso</strong> (consultar y descargar tu estado de cuenta), <strong>rectificación</strong> (solicitar la actualización de tus datos, que el tesorero aprueba), <strong>eliminación</strong> (“derecho al olvido”: solicitar la anonimización de tus datos personales, conservándose solo los registros contables exigidos) y <strong>portabilidad</strong> (obtener tu información en PDF o Excel).</p>

        <h2>6. Seguridad</h2>
        <p>Las contraseñas se almacenan cifradas; el acceso es por roles; cada movimiento queda en una bitácora inmutable; la conexión es cifrada (HTTPS); hay bloqueo por intentos fallidos y suspensión de sesión por inactividad. Ningún dato se elimina físicamente sin trazabilidad.</p>

        <h2>7. Conservación</h2>
        <p>Los datos se conservan mientras la persona sea socia de la caja y por el tiempo que la normativa contable exija. Tras la baja, los datos personales pueden anonimizarse conservando los registros financieros estrictamente necesarios.</p>

        <h2>8. Contacto</h2>
        <p>Para ejercer tus derechos o consultas: a través de tu tesorero/a, o a Yachay Deep Labs en <a href="mailto:cvasconezp@gmail.com">cvasconezp@gmail.com</a>.</p>

        <p className="doc-meta" style={{ marginTop: 24 }}>Este documento es una plantilla de referencia y no constituye asesoría legal. Cada caja debe revisarlo con su asesor.</p>
      </div>
      <footer className="lp-footer"><div className="lp-footer-in">
        <div className="lp-footer-marca"><span className="lp-logo">Kullki</span></div>
        <span className="lp-foot-meta">© {new Date().getFullYear()} Yachay Deep Labs</span>
      </div></footer>
    </div>
  );
}
