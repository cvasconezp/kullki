import { useEffect, useState } from "react";
import { getSesion, setSesion, getAdminSesion, setAdminSesion } from "./lib/api.js";
import { applyTheme, resetTheme, logoDe } from "./lib/theme.js";
import { useRuta, navigate } from "./lib/router.js";
import Landing from "./pages/Landing.jsx";
import Privacidad from "./pages/Privacidad.jsx";
import Terminos from "./pages/Terminos.jsx";
import Login from "./pages/Login.jsx";
import Balances from "./pages/Balances.jsx";
import Socios from "./pages/Socios.jsx";
import Aportes from "./pages/Aportes.jsx";
import Creditos from "./pages/Creditos.jsx";
import AprobacionCreditos from "./pages/AprobacionCreditos.jsx";
import Notificaciones from "./pages/Notificaciones.jsx";
import Libreta from "./pages/Libreta.jsx";
import Bitacora from "./pages/Bitacora.jsx";
import Informes from "./pages/Informes.jsx";
import Cajas from "./pages/Cajas.jsx";
import Estadisticas from "./pages/Estadisticas.jsx";
import AnalisisAdmin from "./components/AnalisisAdmin.jsx";
import CambiarPassword from "./components/CambiarPassword.jsx";
import Lock from "./components/Lock.jsx";
import Campana from "./components/Campana.jsx";
import Tutorial from "./components/Tutorial.jsx";

// id interno · ruta (URL) · etiqueta · ícono · color del ícono
const NAV_TESORERO = [
  { id: "inicio", ruta: "balances", label: "Balances", ico: "📊", c: "#0E7A5C" },
  { id: "socios", ruta: "socios", label: "Socios", ico: "👥", c: "#2563EB" },
  { id: "aportes", ruta: "movimientos", label: "Movim.", ico: "💸", c: "#D9A116" },
  { id: "creditos", ruta: "creditos", label: "Créditos", ico: "🏦", c: "#7C3AED" },
  { id: "notif", ruta: "notificaciones", label: "Notif.", ico: "🔔", c: "#DC2626" },
  { id: "informes", ruta: "informe", label: "Informe", ico: "📄", c: "#0891B2" },
  { id: "bitacora", ruta: "bitacora", label: "Bitácora", ico: "📜", c: "#6B7280" },
];
const NAV_SOCIO = [
  { id: "libreta", ruta: "libreta", label: "Mi libreta", ico: "📒", c: "#0E7A5C" },
  { id: "credito", ruta: "credito", label: "Crédito", ico: "💰", c: "#D9A116" },
  { id: "perfil", ruta: "perfil", label: "Perfil", ico: "👤", c: "#2563EB" },
  { id: "bitacora", ruta: "bitacora", label: "Bitácora", ico: "📜", c: "#6B7280" },
];
const NAV_SUPER = [
  { id: "cajas", ruta: "", label: "Cajas", ico: "🏛", c: "#0E7A5C" },
  { id: "analisis", ruta: "analisis", label: "Análisis", ico: "📈", c: "#7C3AED" },
  { id: "uso", ruta: "uso", label: "Uso", ico: "📊", c: "#2563EB" },
];
const NAV_DIRECTIVA = [
  { id: "inicio", ruta: "balances", label: "Resumen", ico: "📊", c: "#0E7A5C" },
  { id: "socios", ruta: "socios", label: "Socios", ico: "👥", c: "#2563EB" },
  { id: "creditos", ruta: "creditos", label: "Créditos", ico: "🏦", c: "#7C3AED" },
  { id: "informes", ruta: "informe", label: "Informe", ico: "📄", c: "#0891B2" },
  { id: "bitacora", ruta: "bitacora", label: "Bitácora", ico: "📜", c: "#6B7280" },
];
const SECCION_DEF = { tesorero: "balances", socio: "libreta", directiva: "balances" };

function rutaDe(s) {
  if (!s) return "/ingresar";
  if (s.rol === "superadmin") return "/admin";
  return `/${s.caja_slug}/${SECCION_DEF[s.rol] || ""}`;
}

export default function App() {
  const ruta = useRuta();
  const [sesion, setS] = useState(getSesion());
  const [bloqueado, setBloqueado] = useState(() => localStorage.getItem("kullki_lock") === "1");
  const [verTut, setVerTut] = useState(false);
  const bloquear = () => { localStorage.setItem("kullki_lock", "1"); setBloqueado(true); };
  const desbloquear = () => { localStorage.removeItem("kullki_lock"); setBloqueado(false); };

  useEffect(() => {
    if (sesion && sesion.rol !== "superadmin") applyTheme(sesion);
    else resetTheme();
  }, [sesion, ruta]);

  // Tutorial del socio: se abre solo la primera vez
  useEffect(() => {
    if (sesion && sesion.rol === "socio" && localStorage.getItem("kullki_tut_socio") !== "1") {
      setVerTut(true);
    }
  }, [sesion]);
  const cerrarTut = () => { localStorage.setItem("kullki_tut_socio", "1"); setVerTut(false); };

  // Auto-bloqueo por inactividad (5 minutos)
  useEffect(() => {
    if (!sesion || bloqueado) return;
    let t;
    const reset = () => { clearTimeout(t); t = setTimeout(bloquear, 5 * 60 * 1000); };
    const evs = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    evs.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => { clearTimeout(t); evs.forEach((e) => window.removeEventListener(e, reset)); };
  }, [sesion, bloqueado]);

  const entrar = (s) => { setAdminSesion(null); setSesion(s); setS(s); navigate(rutaDe(s)); };
  const salir = () => { setAdminSesion(null); setSesion(null); setS(null); desbloquear(); navigate("/"); };
  const asumir = (s) => { setAdminSesion(getSesion()); setSesion(s); setS(s); navigate(rutaDe(s)); };
  const volverAdmin = () => {
    const admin = getAdminSesion(); setAdminSesion(null);
    setSesion(admin); setS(admin); navigate("/admin");
  };

  // ---------- Rutas públicas ----------
  if (ruta === "/") return <Landing sesion={sesion} />;
  if (ruta === "/privacidad") return <Privacidad />;
  if (ruta === "/terminos") return <Terminos />;
  if (ruta === "/ingresar") {
    if (sesion) { navigate(rutaDe(sesion)); return null; }
    return <Login onLogin={entrar} />;
  }

  // ---------- Requiere sesión ----------
  if (!sesion) { navigate("/ingresar"); return null; }

  // Cambio de contraseña obligatorio en el primer ingreso
  if (sesion.debe_cambiar_password) {
    return <CambiarPassword sesion={sesion} onListo={(s) => setS(s)} />;
  }

  // Sesión suspendida (bloqueo de pantalla): se reanuda con contraseña/PIN
  if (bloqueado) {
    return <Lock sesion={sesion} onUnlock={desbloquear} onLogout={salir} />;
  }

  const partes = ruta.split("/").filter(Boolean);   // [slug, seccion?]
  const esTesorero = sesion.rol === "tesorero";
  const esSocio = sesion.rol === "socio";
  const esSuper = sesion.rol === "superadmin";
  const esDirectiva = sesion.rol === "directiva";

  // Coherencia ruta ↔ sesión
  if (esSuper && partes[0] !== "admin") { navigate("/admin"); return null; }
  if (!esSuper && partes[0] === "admin") { navigate(rutaDe(sesion)); return null; }
  if (!esSuper && sesion.caja_slug && partes[0] !== sesion.caja_slug) {
    navigate(rutaDe(sesion)); return null;
  }

  const nav = esTesorero ? NAV_TESORERO : esSocio ? NAV_SOCIO : esDirectiva ? NAV_DIRECTIVA : esSuper ? NAV_SUPER : [];
  const seccionUrl = partes[1];
  const item = nav.find((n) => n.ruta === seccionUrl);
  const activa = item ? item.id : (esTesorero ? "inicio" : esSocio ? "libreta" : esDirectiva ? "inicio" : "cajas");
  const impersonando = !!sesion.es_impersonacion && !!getAdminSesion();
  const irA = (n) => navigate(esSuper ? (n.ruta ? `/admin/${n.ruta}` : "/admin") : `/${sesion.caja_slug}/${n.ruta}`);

  return (
    <div className="app">
      {esSocio && verTut && <Tutorial onCerrar={cerrarTut} />}
      <header className="topbar">
        <div className="marca">
          {!esSuper && <span className="caja-logo" aria-hidden="true">{logoDe(sesion)}</span>}
          <div className="marca-txt">
            <span className="logo" title={esSuper ? "Kullki" : (sesion.caja_nombre || "Kullki")}>
              {esSuper ? "Kullki" : (sesion.caja_nombre || "Kullki")}</span>
            <span className="labs">{esSuper ? "Panel de administración" : "Kullki · Yachay Deep Labs"}</span>
          </div>
        </div>
        <div className="topbar-acc">
          {esTesorero && <Campana slug={sesion.caja_slug} />}
          {esSocio && (
            <button className="suspender" onClick={() => setVerTut(true)} title="Ver tutorial" aria-label="Tutorial">❔</button>
          )}
          <button className="suspender" onClick={bloquear} title="Suspender sesión" aria-label="Suspender">🔒</button>
          <button className="salir" onClick={impersonando ? volverAdmin : salir}>
            {impersonando ? "↩ Admin" : "Salir"}
          </button>
        </div>
      </header>

      {impersonando && (
        <div className="imp-banner no-print">
          Estás viendo como <b>{sesion.rol === "tesorero" ? "tesorero/a" : sesion.rol === "directiva" ? "directiva" : "socio/a"}</b> de{" "}
          <b>{sesion.caja_nombre}</b>. Las acciones quedan en la bitácora a tu nombre.
          <button onClick={volverAdmin}>Volver a administrador</button>
        </div>
      )}

      <div className="shell">
        {nav.length > 0 && (
          <nav className="nav" aria-label="Navegación principal">
            {nav.map((n) => (
              <button key={n.id} className={activa === n.id ? "activo" : ""} onClick={() => irA(n)}>
                <span className="ico" aria-hidden="true" style={{ "--c": n.c }}>{n.ico}</span>{n.label}
              </button>
            ))}
          </nav>
        )}

        <main className="contenido">
          {esSuper && activa === "uso" && <Estadisticas />}
          {esSuper && activa === "analisis" && <AnalisisAdmin />}
          {esSuper && activa !== "uso" && activa !== "analisis" && <Cajas onAsumir={asumir} />}
          {(esTesorero || esDirectiva) && activa === "inicio" && <Balances />}
          {(esTesorero || esDirectiva) && activa === "socios" && <Socios />}
          {(esTesorero || esDirectiva) && activa === "informes" && <Informes />}
          {esTesorero && activa === "aportes" && <Aportes />}
          {esTesorero && activa === "creditos" && <Creditos />}
          {esTesorero && activa === "notif" && <Notificaciones />}
          {esDirectiva && activa === "creditos" && <AprobacionCreditos />}
          {esSocio && activa === "libreta" && <Libreta vista="libreta" />}
          {esSocio && activa === "credito" && <Libreta vista="credito" />}
          {esSocio && activa === "perfil" && <Libreta vista="perfil" />}
          {activa === "bitacora" && !esSuper && <Bitacora />}
        </main>
      </div>
    </div>
  );
}
