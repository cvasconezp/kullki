import { navigate } from "../lib/router.js";
import { getSesion } from "../lib/api.js";

export default function Bienvenida() {
  const sesion = getSesion() || {};
  const slug   = sesion.caja_slug || "";

  const ir = (ruta) => navigate(`/${slug}/${ruta}`);

  return (
    <div className="bienvenida">
      <div className="bienvenida-glow" aria-hidden="true" />
      <div className="bienvenida-in">

        <div className="bienvenida-hero">
          <span className="bienvenida-ico">🎉</span>
          <h1>¡Tu caja está lista en Kullki!</h1>
          <p>Sigue estos tres pasos para empezar a trabajar.</p>
        </div>

        <div className="bienvenida-pasos">

          <div className="bienvenida-paso hecho">
            <div className="bienvenida-num">✓</div>
            <div className="bienvenida-paso-body">
              <strong>Caja configurada</strong>
              <p>Tu espacio en Kullki ya está activo. La plataforma está lista para registrar socios, aportes y créditos.</p>
            </div>
          </div>

          <div className="bienvenida-paso">
            <div className="bienvenida-num">1</div>
            <div className="bienvenida-paso-body">
              <strong>Agrega a tus socios</strong>
              <p>Registra a cada miembro de la caja con su cédula, nombre y datos de contacto.</p>
              <div className="bienvenida-acciones">
                <button className="bienvenida-btn" onClick={() => ir("socios")}>
                  Ir a Socios →
                </button>
                <button className="bienvenida-btn-sec" onClick={() => ir("importar")}>
                  📂 Importar desde Excel
                </button>
              </div>
            </div>
          </div>

          <div className="bienvenida-paso">
            <div className="bienvenida-num">2</div>
            <div className="bienvenida-paso-body">
              <strong>Registra el primer aporte</strong>
              <p>Una vez que tengas socios, ingresa los aportes ordinarios del mes para activar el fondo.</p>
              <button className="bienvenida-btn" onClick={() => ir("movimientos")}>
                Ir a Movimientos →
              </button>
            </div>
          </div>

          <div className="bienvenida-paso">
            <div className="bienvenida-num">3</div>
            <div className="bienvenida-paso-body">
              <strong>Revisa el dashboard</strong>
              <p>Cuando tengas datos, el tablero principal mostrará el fondo, alertas y la evolución de la caja en tiempo real.</p>
            </div>
          </div>

        </div>

        <div className="bienvenida-ayuda">
          <span>¿Tienes dudas?</span>
          <a href="https://wa.me/593999213871" target="_blank" rel="noreferrer">
            💬 Escríbenos por WhatsApp
          </a>
        </div>

      </div>
    </div>
  );
}
