import { useState } from "react";
import { api, getSesion, setSesion } from "../lib/api.js";

export default function CambiarPassword({ sesion, onListo }) {
  const [actual, setActual] = useState("");
  const [n1, setN1] = useState(""); const [n2, setN2] = useState("");
  const [error, setError] = useState(""); const [cargando, setCargando] = useState(false);

  const guardar = async () => {
    setError("");
    if (n1.length < 6) return setError("La nueva contraseña debe tener al menos 6 caracteres.");
    if (n1 !== n2) return setError("Las contraseñas no coinciden.");
    setCargando(true);
    try {
      await api("/auth/cambiar-password", { method: "POST", body: { actual, nueva: n1 } });
      const s = { ...getSesion(), debe_cambiar_password: false };
      setSesion(s); onListo(s);
    } catch (e) { setError(e.message); setCargando(false); }
  };

  return (
    <div className="login">
      <div className="login-card">
        <div className="login-marca" style={{ cursor: "default" }}>
          <img src="/favicon.svg" alt="" width="40" height="40" />
          <span className="logo-grande">Kullki</span>
        </div>
        <p className="lema">Hola, {sesion.nombre.split(" ")[0]}. Por tu seguridad, crea una contraseña nueva antes de continuar.</p>
        {error && <div className="error">{error}</div>}
        <div className="campo"><label>Contraseña actual</label>
          <input type="password" value={actual} autoComplete="current-password"
            onChange={(e) => setActual(e.target.value)} placeholder="Tu cédula, si es la primera vez" /></div>
        <div className="campo"><label>Nueva contraseña</label>
          <input type="password" value={n1} autoComplete="new-password" onChange={(e) => setN1(e.target.value)} /></div>
        <div className="campo"><label>Repite la nueva contraseña</label>
          <input type="password" value={n2} autoComplete="new-password"
            onChange={(e) => setN2(e.target.value)} onKeyDown={(e) => e.key === "Enter" && guardar()} /></div>
        <button className="boton" onClick={guardar} disabled={cargando || !actual || !n1 || !n2}>
          {cargando ? "Guardando…" : "Guardar y continuar"}
        </button>
        <div className="login-hint">Esta contraseña será solo tuya. No la compartas con nadie.</div>
      </div>
    </div>
  );
}
