import { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import QRCode from "qrcode";

export default function Seguridad2FA() {
  const [activo, setActivo] = useState(null);
  const [paso, setPaso] = useState("idle");      // idle | enrolando
  const [qr, setQr] = useState(""); const [secret, setSecret] = useState("");
  const [codigo, setCodigo] = useState(""); const [error, setError] = useState(""); const [ok, setOk] = useState("");

  const estado = () => api("/auth/2fa/estado").then((r) => setActivo(r.activo)).catch(() => setActivo(false));
  useEffect(() => { estado(); }, []);

  const iniciar = async () => {
    setError(""); setOk("");
    try {
      const r = await api("/auth/2fa/iniciar", { method: "POST" });
      setSecret(r.secret); setQr(await QRCode.toDataURL(r.otpauth, { width: 180 })); setPaso("enrolando");
    } catch (e) { setError(e.message); }
  };
  const activar = async () => {
    setError("");
    try { await api("/auth/2fa/activar", { method: "POST", body: { codigo } });
      setOk("Verificación en dos pasos activada."); setPaso("idle"); setCodigo(""); estado(); }
    catch (e) { setError(e.message); }
  };
  const desactivar = async () => {
    setError("");
    const c = window.prompt("Ingresa un código de tu app para desactivar el 2FA:");
    if (!c) return;
    try { await api("/auth/2fa/desactivar", { method: "POST", body: { codigo: c } }); setOk("2FA desactivado."); estado(); }
    catch (e) { setError(e.message); }
  };

  if (activo === null) return null;
  return (
    <div className="tarjeta no-print">
      <h3>Verificación en dos pasos (2FA)</h3>
      {error && <div className="error">{error}</div>}
      {ok && <div className="exito">{ok}</div>}
      {activo ? (
        <>
          <div className="detalle" style={{ color: "var(--verde)", margin: "0 0 8px" }}>✅ Activada. Tu cuenta pide un código además de tu contraseña.</div>
          <button className="boton secundario" onClick={desactivar}>Desactivar 2FA</button>
        </>
      ) : paso === "idle" ? (
        <>
          <div className="detalle" style={{ color: "var(--tinta-suave)", margin: "0 0 8px" }}>
            Añade una capa extra: necesitarás un código de una app (Google Authenticator, Authy…) para ingresar.
          </div>
          <button className="boton" onClick={iniciar}>Activar 2FA</button>
        </>
      ) : (
        <>
          <div className="detalle" style={{ margin: "0 0 8px" }}>1) Escanea el código con tu app autenticadora:</div>
          {qr && <img src={qr} alt="QR 2FA" style={{ display: "block", margin: "0 auto 8px", borderRadius: 8 }} />}
          <div className="detalle" style={{ wordBreak: "break-all", fontFamily: "var(--mono)", fontSize: 12, margin: "0 0 10px" }}>
            o ingresa la clave manual: <strong>{secret}</strong></div>
          <div className="campo"><label>2) Escribe el código de 6 dígitos</label>
            <input inputMode="numeric" value={codigo} onChange={(e) => setCodigo(e.target.value.trim())} placeholder="123456" /></div>
          <div className="dos-col">
            <button className="boton secundario" onClick={() => setPaso("idle")}>Cancelar</button>
            <button className="boton" onClick={activar} disabled={codigo.length < 6}>Confirmar y activar</button>
          </div>
        </>
      )}
    </div>
  );
}
