import { useState } from "react";
import { api } from "../lib/api.js";
import { navigate } from "../lib/router.js";

export default function Login({ onLogin }) {
  const [cedula, setCedula] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  const [seleccion, setSeleccion] = useState(null);

  const Marca = () => (
    <button className="login-marca" onClick={() => navigate("/")} title="Volver al inicio">
      <img src="/favicon.svg" alt="" width="40" height="40" />
      <span className="logo-grande">Kullki</span>
    </button>
  );

  const entrar = async () => {
    setError(""); setCargando(true);
    try {
      const r = await api("/auth/login", { method: "POST", body: { cedula, password } });
      if (r.requiere_seleccion) setSeleccion({ token: r.access_token, nombre: r.nombre, cajas: r.cajas });
      else onLogin(r);
    } catch (e) { setError(e.message); }
    finally { setCargando(false); }
  };

  const elegirCaja = async (caja) => {
    setError(""); setCargando(true);
    try {
      const r = await api("/auth/seleccionar-caja", {
        method: "POST", body: { caja_id: caja.caja_id }, token: seleccion.token });
      onLogin(r);
    } catch (e) { setError(e.message); setCargando(false); }
  };

  if (seleccion) {
    return (
      <div className="login">
        <div className="login-card">
          <Marca />
          <p className="lema">Hola, {seleccion.nombre.split(" ")[0]}. ¿A qué caja quieres entrar?</p>
          {error && <div className="error">{error}</div>}
          {seleccion.cajas.map((c) => (
            <button key={c.caja_id} className="selector-caja" disabled={cargando} onClick={() => elegirCaja(c)}>
              <div>
                <div className="nombre">{c.caja_nombre}</div>
                <div className="meta">{(c.comunidad || "—")} · entras como {c.rol === "tesorero" ? "tesorero/a" : "socio/a"}</div>
              </div>
              <span className="chevron" aria-hidden="true">›</span>
            </button>
          ))}
          <button className="boton secundario" style={{ marginTop: 12 }}
            onClick={() => { setSeleccion(null); setPassword(""); }}>Volver</button>
          <p className="pie">Un producto de Yachay Deep Labs</p>
        </div>
      </div>
    );
  }

  return (
    <div className="login">
      <div className="login-card">
        <Marca />
        <p className="lema">El sistema inteligente para administrar los recursos de tu comunidad.</p>
        {error && <div className="error">{error}</div>}
        <div className="campo">
          <label htmlFor="ced">Cédula</label>
          <input id="ced" inputMode="numeric" value={cedula} autoComplete="username"
            onChange={(e) => setCedula(e.target.value.trim())} placeholder="1700000000" />
        </div>
        <div className="campo">
          <label htmlFor="pwd">Contraseña</label>
          <input id="pwd" type="password" value={password} autoComplete="current-password"
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && entrar()} />
        </div>
        <button className="boton" onClick={entrar} disabled={cargando || !cedula || !password}>
          {cargando ? "Entrando…" : "Entrar"}
        </button>
        <div className="login-hint">
          ¿Eres socio? Tu <strong>usuario</strong> y tu <strong>contraseña</strong> son tu número de cédula
          (sin espacios). Si ya la cambiaste, usa tu contraseña nueva.
        </div>
        <button className="login-volver" onClick={() => navigate("/")}>← Volver al inicio</button>
        <p className="pie">Un producto de Yachay Deep Labs</p>
      </div>
    </div>
  );
}
