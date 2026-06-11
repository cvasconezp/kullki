import { useState } from "react";
import { api } from "../lib/api.js";

export default function Login({ onLogin }) {
  const [cedula, setCedula] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  const [seleccion, setSeleccion] = useState(null); // {token, nombre, cajas} si hay varias

  const entrar = async () => {
    setError("");
    setCargando(true);
    try {
      const r = await api("/auth/login", { method: "POST", body: { cedula, password } });
      if (r.requiere_seleccion) {
        setSeleccion({ token: r.access_token, nombre: r.nombre, cajas: r.cajas });
      } else {
        onLogin(r);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  };

  const elegirCaja = async (caja) => {
    setError("");
    setCargando(true);
    try {
      const r = await api("/auth/seleccionar-caja", {
        method: "POST",
        body: { caja_id: caja.caja_id },
        token: seleccion.token, // token temporal de la selección
      });
      onLogin(r);
    } catch (e) {
      setError(e.message);
      setCargando(false);
    }
  };

  if (seleccion) {
    return (
      <div className="login">
        <div className="logo-grande">Kullki</div>
        <p className="lema">Hola, {seleccion.nombre.split(" ")[0]}. ¿A qué caja quieres entrar?</p>
        {error && <div className="error">{error}</div>}
        {seleccion.cajas.map((c) => (
          <button key={c.caja_id} className="selector-caja"
            disabled={cargando} onClick={() => elegirCaja(c)}>
            <div>
              <div className="nombre">{c.caja_nombre}</div>
              <div className="meta">
                {(c.comunidad || "—")} · entras como {c.rol === "tesorero" ? "tesorero/a" : "socio/a"}
              </div>
            </div>
            <span className="chevron" aria-hidden="true">›</span>
          </button>
        ))}
        <button className="boton secundario" style={{ marginTop: 12 }}
          onClick={() => { setSeleccion(null); setPassword(""); }}>
          Volver
        </button>
        <p className="pie">Un producto de Yachay Deep Labs</p>
      </div>
    );
  }

  return (
    <div className="login">
      <div className="logo-grande">Kullki</div>
      <p className="lema">El sistema inteligente para administrar los recursos de tu comunidad.</p>
      {error && <div className="error">{error}</div>}
      <div className="campo">
        <label htmlFor="ced">Cédula</label>
        <input id="ced" inputMode="numeric" value={cedula}
          onChange={(e) => setCedula(e.target.value.trim())} placeholder="1700000000" />
      </div>
      <div className="campo">
        <label htmlFor="pwd">Contraseña</label>
        <input id="pwd" type="password" value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && entrar()} />
      </div>
      <button className="boton" onClick={entrar} disabled={cargando || !cedula || !password}>
        {cargando ? "Entrando…" : "Entrar"}
      </button>
      <p className="pie">Un producto de Yachay Deep Labs</p>
    </div>
  );
}
