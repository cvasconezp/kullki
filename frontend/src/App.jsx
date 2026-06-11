import { useState } from "react";
import { getSesion, setSesion } from "./lib/api.js";
import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Socios from "./pages/Socios.jsx";
import Aportes from "./pages/Aportes.jsx";
import Creditos from "./pages/Creditos.jsx";
import Libreta from "./pages/Libreta.jsx";
import Bitacora from "./pages/Bitacora.jsx";
import Cajas from "./pages/Cajas.jsx";

const NAV_TESORERO = [
  { id: "inicio", label: "Inicio", ico: "⌂" },
  { id: "socios", label: "Socios", ico: "👥" },
  { id: "aportes", label: "Aportes", ico: "⊕" },
  { id: "creditos", label: "Créditos", ico: "⇄" },
  { id: "bitacora", label: "Bitácora", ico: "≡" },
];
const NAV_SOCIO = [
  { id: "libreta", label: "Mi libreta", ico: "▤" },
  { id: "bitacora", label: "Bitácora", ico: "≡" },
];

export default function App() {
  const [sesion, setS] = useState(getSesion());
  const [vista, setVista] = useState(null);

  if (!sesion) {
    return (
      <Login
        onLogin={(s) => {
          setSesion(s);
          setS(s);
          setVista(null);
        }}
      />
    );
  }

  const esTesorero = sesion.rol === "tesorero";
  const esSocio = sesion.rol === "socio";
  const esSuper = sesion.rol === "superadmin";
  const nav = esTesorero ? NAV_TESORERO : esSocio ? NAV_SOCIO : [];
  const activa = vista || (esTesorero ? "inicio" : esSocio ? "libreta" : "cajas");

  const salir = () => {
    setSesion(null);
    setS(null);
  };

  return (
    <>
      <header className="topbar">
        <div className="marca">
          <span className="logo">Kullki</span>
          <span className="labs">Yachay Deep Labs</span>
        </div>
        <button className="salir" onClick={salir}>Salir</button>
      </header>
      <main className="contenido">
        {esSuper && <Cajas />}
        {esTesorero && activa === "inicio" && <Dashboard sesion={sesion} />}
        {esTesorero && activa === "socios" && <Socios />}
        {esTesorero && activa === "aportes" && <Aportes />}
        {esTesorero && activa === "creditos" && <Creditos />}
        {esSocio && activa === "libreta" && <Libreta sesion={sesion} />}
        {activa === "bitacora" && !esSuper && <Bitacora />}
      </main>
      {nav.length > 0 && (
        <nav className="nav" aria-label="Navegación principal">
          {nav.map((n) => (
            <button
              key={n.id}
              className={activa === n.id ? "activo" : ""}
              onClick={() => setVista(n.id)}
            >
              <span className="ico" aria-hidden="true">{n.ico}</span>
              {n.label}
            </button>
          ))}
        </nav>
      )}
    </>
  );
}
