import { useState } from "react";
import { api } from "../lib/api.js";

export default function Lock({ sesion, onUnlock, onLogout }) {
  const [pw, setPw] = useState(""); const [err, setErr] = useState(""); const [cargando, setCargando] = useState(false);
  const reanudar = async () => {
    setErr(""); setCargando(true);
    try { await api("/auth/verificar", { method: "POST", body: { password: pw } }); onUnlock(); }
    catch (e) { setErr(e.message); setCargando(false); setPw(""); }
  };
  return (
    <div className="login">
      <div className="login-card">
        <div className="login-marca" style={{ cursor: "default" }}>
          <span style={{ fontSize: 34 }}>🔒</span>
          <span className="logo-grande">Sesión suspendida</span>
        </div>
        <p className="lema">Hola, {(sesion.nombre || "").split(" ")[0]}. Ingresa tu contraseña o PIN para continuar donde lo dejaste.</p>
        {err && <div className="error">{err}</div>}
        <div className="campo">
          <label htmlFor="pw">Contraseña / PIN</label>
          <input id="pw" type="password" value={pw} autoFocus autoComplete="current-password"
            onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && reanudar()} />
        </div>
        <button className="boton" onClick={reanudar} disabled={cargando || !pw}>
          {cargando ? "Verificando…" : "Reanudar sesión"}
        </button>
        <button className="login-volver" onClick={onLogout}>Cerrar sesión</button>
      </div>
    </div>
  );
}
