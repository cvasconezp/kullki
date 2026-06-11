import { useState } from "react";
import { api } from "../lib/api.js";

export default function Login({ onLogin }) {
  const [cedula, setCedula] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  const entrar = async () => {
    setError("");
    setCargando(true);
    try {
      const s = await api("/auth/login", { method: "POST", body: { cedula, password } });
      onLogin(s);
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="login">
      <div className="logo-grande">Kullki</div>
      <p className="lema">Tu caja de ahorro, clara y al día.</p>
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
      <p className="pie">Un producto de Yachay Deep Labs · Pacha Tech</p>
    </div>
  );
}
