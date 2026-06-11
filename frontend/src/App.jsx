import { useEffect, useState } from "react";
import { getSesion, setSesion, getAdminSesion, setAdminSesion } from "./lib/api.js";
import { applyTheme, resetTheme, logoDe } from "./lib/theme.js";
import { useRuta, navigate } from "./lib/router.js";
import Landing from "./pages/Landing.jsx";
import Login from "./pages/Login.jsx";
import Balances from "./pages/Balances.jsx";
import Socios from "./pages/Socios.jsx";
import Aportes from "./pages/Aportes.jsx";
import Creditos from "./pages/Creditos.jsx";
import Libreta from "./pages/Libreta.jsx";
import Bitacora from "./pages/Bitacora.jsx";
import Informes from "./pages/Informes.jsx";
import Cajas from "./pages/Cajas.jsx";

const NAV_TESORERO = [
  { id: "inicio", label: "Balances", ico: "▦" },
  { id: "socios", label: "Socios", ico: "👥" },
  { id: "aportes", label: "Movim.", ico: "⊕" },
  { id: "creditos", label: "Créditos", ico: "⇄" },
  { id: "informes", label: "Informe", ico: "🗎" },
  { id: "bitacora", label: "Bitácora", ico: "≡" },
];
const NAV_SOCIO = [
  { id: "libreta", label: "Mi libreta", ico: "▤" },
  { id: "bitacora", label: "Bitácora", ico: "≡" },
];

function rutaDe(s) {
  if (!s) return "/ingresar";
  if (s.rol === "superadmin") return "/admin";
  return "/" + (s.caja_slug || "");
}

export default function App() {
  const ruta = useRuta();
  const [sesion, setS] = useState(getSesion());
  const [vista, setVista] = useState(null);

  // Acopla el tema a la caja activa (o marca Yachay Deep si no hay caja)
  useEffect(() => {
    if (sesion && sesion.rol !== "superadmin") applyTheme(sesion);
    else resetTheme();
  }, [sesion, ruta]);

  const entrar = (s) => {
    setAdminSesion(null);
    setSesion(s); setS(s); setVista(null);
    navigate(rutaDe(s));
  };

  const salir = () => {
    setAdminSesion(null);
    setSesion(null); setS(null); setVista(null);
    navigate("/");
  };

  // El superadmin entra a una caja como tesorero/socio sin cerrar su sesión
  const asumir = (s) => {
    setAdminSesion(getSesion());     // guarda la sesión del admin
    setSesion(s); setS(s); setVista(null);
    navigate("/" + (s.caja_slug || ""));
  };

  // El superadmin vuelve de "actuar como" a su panel
  const volverAdmin = () => {
    const admin = getAdminSesion();
    setAdminSesion(null);
    setSesion(admin); setS(admin); setVista(null);
    navigate("/admin");
  };

  // ---------- Rutas públicas ----------
  if (ruta === "/" ) return <Landing sesion={sesion} />;

  if (ruta === "/ingresar") {
    if (sesion) { navigate(rutaDe(sesion)); return null; }
    return <Login onLogin={entrar} />;
  }

  // ---------- Requiere sesión ----------
  if (!sesion) { navigate("/ingresar"); return null; }

  const esTesorero = sesion.rol === "tesorero";
  const esSocio = sesion.rol === "socio";
  const esSuper = sesion.rol === "superadmin";

  // Coherencia ruta ↔ sesión
  if (esSuper && ruta !== "/admin") { navigate("/admin"); return null; }
  if (!esSuper && ruta === "/admin") { navigate(rutaDe(sesion)); return null; }
  if (!esSuper && sesion.caja_slug && ruta !== "/" + sesion.caja_slug) {
    navigate("/" + sesion.caja_slug); return null;
  }

  const nav = esTesorero ? NAV_TESORERO : esSocio ? NAV_SOCIO : [];
  const activa = vista || (esTesorero ? "inicio" : esSocio ? "libreta" : "cajas");
  const impersonando = !!sesion.es_impersonacion && !!getAdminSesion();

  return (
    <div className="app">
      <header className="topbar">
        <div className="marca">
          {!esSuper && <span className="caja-logo" aria-hidden="true">{logoDe(sesion)}</span>}
          <div className="marca-txt">
            <span className="logo">{esSuper ? "Kullki" : (sesion.caja_nombre || "Kullki")}</span>
            <span className="labs">{esSuper ? "Panel de administración" : "Kullki · Yachay Deep Labs"}</span>
          </div>
        </div>
        <button className="salir" onClick={impersonando ? volverAdmin : salir}>
          {impersonando ? "↩ Admin" : "Salir"}
        </button>
      </header>

      {impersonando && (
        <div className="imp-banner no-print">
          Estás viendo como <b>{sesion.rol === "tesorero" ? "tesorero/a" : "socio/a"}</b> de{" "}
          <b>{sesion.caja_nombre}</b>. Las acciones quedan en la bitácora a tu nombre.
          <button onClick={volverAdmin}>Volver a administrador</button>
        </div>
      )}

      <div className="shell">
        {nav.length > 0 && (
          <nav className="nav" aria-label="Navegación principal">
            {nav.map((n) => (
              <button key={n.id} className={activa === n.id ? "activo" : ""}
                      onClick={() => setVista(n.id)}>
                <span className="ico" aria-hidden="true">{n.ico}</span>{n.label}
              </button>
            ))}
          </nav>
        )}

        <main className="contenido">
          {esSuper && <Cajas onAsumir={asumir} />}
          {esTesorero && activa === "inicio" && <Balances />}
          {esTesorero && activa === "socios" && <Socios />}
          {esTesorero && activa === "aportes" && <Aportes />}
          {esTesorero && activa === "creditos" && <Creditos />}
          {esTesorero && activa === "informes" && <Informes />}
          {esSocio && activa === "libreta" && <Libreta sesion={sesion} />}
          {activa === "bitacora" && !esSuper && <Bitacora />}
        </main>
      </div>
    </div>
  );
}
