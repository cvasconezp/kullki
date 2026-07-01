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
        <p>Para administrar la caja de ahorro: registrar movimientos, calcular créditos e intereses, y generar informes y estados de cuenta. No vendemos ni cedemos datos a terceros con fines comerciales.</p>

        <h2>4. Uso con fines de investigación y estadística</h2>
        <p>Kullki puede usar información sobre las <strong>características</strong> de los socios y de los créditos —por ejemplo género, ocupación, nivel de instrucción, cargas familiares y el destino de los préstamos— para elaborar <strong>estudios, estadísticas y caracterizaciones</strong> que ayuden a entender y mejorar el ahorro comunitario en el Ecuador.</p>
        <p>Estos estudios se realizan sobre datos <strong>seudonimizados</strong>: los identificadores directos (cédula, nombres, teléfono, correo, dirección) se almacenan <strong>cifrados</strong> y separados de las características que se analizan, de modo que los estudios no identifican a personas concretas. No se publican datos individuales, solo resultados agregados.</p>
        <p>Este uso es <strong>voluntario y separable</strong> de tu membresía: puedes <strong>oponerte</strong> en cualquier momento, sin que ello afecte tu participación en la caja ni tu acceso al servicio.</p>

        <h2>5. Base legal</h2>
        <p>El tratamiento para administrar la caja se realiza con el <strong>consentimiento</strong> del socio, otorgado al registrarse, y para la ejecución de su relación con la caja. El uso con fines de investigación y estadística se apoya en un <strong>consentimiento específico, libre e informado</strong> (Art. 8 de la LOPDP), independiente del anterior y revocable en cualquier momento.</p>

        <h2>6. Tus derechos</h2>
        <p>Como socio puedes ejercer tus derechos de <strong>acceso</strong> (consultar y descargar tu estado de cuenta), <strong>rectificación</strong> (solicitar la actualización de tus datos, que el tesorero aprueba), <strong>eliminación</strong> (“derecho al olvido”: solicitar la anonimización de tus datos personales, conservándose solo los registros contables exigidos), <strong>portabilidad</strong> (obtener tu información en PDF o Excel) y <strong>oposición</strong> (pedir que tus datos no se usen para investigación, estadística o elaboración de perfiles).</p>

        <h2>7. Seguridad</h2>
        <p>Los datos personales sensibles —cédula, nombres y datos de contacto— se almacenan <strong>cifrados en la base de datos</strong> (cifrado en reposo), de modo que no son legibles ante una copia no autorizada. Las contraseñas se guardan con hash; el acceso es por roles; cada movimiento queda en una bitácora inmutable; la conexión es cifrada (HTTPS); hay bloqueo por intentos fallidos y verificación en dos pasos. Ningún dato se elimina físicamente sin trazabilidad.</p>

        <h2>8. Conservación</h2>
        <p>Los datos se conservan mientras la persona sea socia de la caja y por el tiempo que la normativa contable exija. Tras la baja, los datos personales pueden anonimizarse conservando los registros financieros estrictamente necesarios.</p>

        <h2>9. Contacto</h2>
        <p>Para ejercer tus derechos o consultas: a través de tu tesorero/a, o a Yachay Deep Labs en <a href="mailto:kullki@yachaydeep.com">kullki@yachaydeep.com</a>.</p>

        <p className="doc-meta" style={{ marginTop: 24 }}>Este documento es una plantilla de referencia y no constituye asesoría legal. Cada caja debe revisarlo con su asesor.</p>
      </div>
      <footer className="lp-footer"><div className="lp-footer-in">
        <div className="lp-footer-marca"><span className="lp-logo">Kullki</span></div>
        <span className="lp-foot-meta">© {new Date().getFullYear()} Yachay Deep Labs</span>
      </div></footer>
    </div>
  );
}
