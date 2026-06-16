import { useState } from "react";
import { api } from "../lib/api.js";
import { navigate } from "../lib/router.js";
import QRCode from "qrcode";

export default function Login({ onLogin }) {
  const [cedula, setCedula] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  const [seleccion, setSeleccion] = useState(null);
  const [totp, setTotp] = useState(""); const [pide2fa, setPide2fa] = useState(false);
  // 2FA obligatorio para tesorero
  const [setup2fa, setSetup2fa] = useState(null); // { token, loginData, qr, secret }
  const [codigo2fa, setCodigo2fa] = useState("");
  const [ok2fa, setOk2fa] = useState("");

  const Marca = () => (
    <button className="login-marca" onClick={() => navigate("/")} title="Volver al inicio">
      <img src="/favicon.svg" alt="" width="40" height="40" />
      <span className="logo-grande">Kullki</span>
    </button>
  );

  const entrar = async () => {
    setError(""); setCargando(true);
    try {
      const r = await api("/auth/login", { method: "POST", body: { cedula, password, totp: totp || undefined } });
      if (r.requiere_seleccion) setSeleccion({ token: r.access_token, nombre: r.nombre, cajas: r.cajas });
      else if (r.requiere_activar_2fa) await iniciar2faSetup(r);
      else onLogin(r);
    } catch (e) {
      if (/2FA|verificaci/i.test(e.message)) setPide2fa(true);
      setError(e.message);
    }
    finally { setCargando(false); }
  };

  const iniciar2faSetup = async (loginData) => {
    const r = await api("/auth/2fa/iniciar", { method: "POST", token: loginData.access_token });
    const qr = await QRCode.toDataURL(r.otpauth, { width: 200 });
    setSetup2fa({ token: loginData.access_token, loginData, qr, secret: r.secret });
  };

  const confirmar2fa = async () => {
    setError(""); setCargando(true);
    try {
      await api("/auth/2fa/activar", { method: "POST", body: { codigo: codigo2fa }, token: setup2fa.token });
      setOk2fa("¡2FA activado! Ya puedes ingresar.");
      setTimeout(() => { onLogin(setup2fa.loginData); }, 1200);
    } catch (e) { setError(e.message); }
    finally { setCargando(false); }
  };

  const elegirCaja = async (caja) => {
    setError(""); setCargando(true);
    try {
      const r = await api("/auth/seleccionar-caja", {
        method: "POST", body: { caja_id: caja.caja_id }, token: seleccion.token });
      if (r.requiere_activar_2fa) await iniciar2faSetup(r);
      else onLogin(r);
    } catch (e) { setError(e.message); setCargando(false); }
  };

  // Pantalla de activación de 2FA obligatoria para tesoreros
  if (setup2fa) {
    return (
      <div className="login">
        <div className="login-card">
          <Marca />
          <p className="lema" style={{ fontWeight: 700, color: "var(--kullki)" }}>
            🔐 Activa la verificación en dos pasos
          </p>
          <div className="detalle" style={{ margin: "0 0 12px", fontSize: 13.5, lineHeight: 1.5 }}>
            Como <strong>tesorero/a</strong>, el 2FA es obligatorio para proteger los fondos de la caja.
            Instala <strong>Google Authenticator</strong> o <strong>Authy</strong> en tu teléfono y escanea este código:
          </div>
          {error && <div className="error">{error}</div>}
          {ok2fa && <div className="exito">{ok2fa}</div>}
          {setup2fa.qr && (
            <img src={setup2fa.qr} alt="QR 2FA" style={{ display: "block", margin: "0 auto 10px", borderRadius: 10, border: "2px solid var(--kullki)" }} />
          )}
          <div className="detalle" style={{ fontFamily: "var(--mono)", fontSize: 11, wordBreak: "break-all", margin: "0 0 12px", background: "var(--superficie)", padding: "6px 10px", borderRadius: 8 }}>
            Clave manual: <strong>{setup2fa.secret}</strong>
          </div>
          <div className="campo">
            <label>Código de 6 dígitos de tu app</label>
            <input inputMode="numeric" value={codigo2fa} placeholder="123456" autoFocus
              onChange={(e) => setCodigo2fa(e.target.value.trim())}
              onKeyDown={(e) => e.key === "Enter" && codigo2fa.length >= 6 && confirmar2fa()} />
          </div>
          <button className="boton" onClick={confirmar2fa} disabled={cargando || codigo2fa.length < 6}>
            {cargando ? "Verificando…" : "Confirmar y activar 2FA"}
          </button>
          <p className="pie">Un producto de Yachay Deep Labs</p>
        </div>
      </div>
    );
  }

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
        {pide2fa && (
          <div className="campo">
            <label htmlFor="totp">Código de verificación (2FA)</label>
            <input id="totp" inputMode="numeric" value={totp} autoFocus placeholder="123456"
              onChange={(e) => setTotp(e.target.value.trim())} onKeyDown={(e) => e.key === "Enter" && entrar()} />
          </div>
        )}
        <button className="boton" onClick={entrar} disabled={cargando || !cedula || !password || (pide2fa && !totp)}>
          {cargando ? "Entrando…" : pide2fa ? "Verificar e ingresar" : "Entrar"}
        </button>
        <div className="login-hint">
          Tu <strong>usuario</strong> es tu número de cédula. La <strong>contraseña</strong> te la entregó el
          tesorero/a al registrarte. Cámbiala en tu primer ingreso.
        </div>
        <button className="login-volver" onClick={() => navigate("/")}>← Volver al inicio</button>
        <p className="pie">Un producto de Yachay Deep Labs · <a href="/privacidad" style={{ color: "var(--kullki)" }}>Privacidad</a> · <a href="/terminos" style={{ color: "var(--kullki)" }}>Términos</a></p>
      </div>
    </div>
  );
}
