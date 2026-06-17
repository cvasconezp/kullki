import { useEffect, useState } from "react";
import { api } from "../lib/api.js";

export default function ConfigurarPIN() {
  const [tienePIN, setTienePIN] = useState(null);
  const [paso, setPaso] = useState("idle");   // idle | configurar | borrar
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  const cargar = () =>
    api("/auth/pin/estado").then((r) => setTienePIN(r.tiene_pin)).catch(() => setTienePIN(false));
  useEffect(() => { cargar(); }, []);

  const guardar = async () => {
    setError("");
    if (!/^\d{4,6}$/.test(pin)) { setError("El PIN debe tener 4 a 6 dígitos numéricos."); return; }
    if (pin !== pin2) { setError("Los PINs no coinciden."); return; }
    try {
      await api("/auth/pin/configurar", { method: "POST", body: { pin } });
      setOk("PIN configurado. Ya puedes usarlo para reanudar la sesión."); setPaso("idle"); setPin(""); setPin2(""); cargar();
    } catch (e) { setError(e.message); }
  };

  const borrar = async () => {
    setError("");
    try {
      await api("/auth/pin", { method: "DELETE" });
      setOk("PIN eliminado."); setPaso("idle"); cargar();
    } catch (e) { setError(e.message); }
  };

  if (tienePIN === null) return null;
  return (
    <div className="tarjeta no-print">
      <h3>PIN de desbloqueo rápido</h3>
      {error && <div className="error">{error}</div>}
      {ok && <div className="exito">{ok}</div>}

      {paso === "idle" && (
        <>
          <div className="detalle" style={{ margin: "0 0 10px" }}>
            {tienePIN
              ? "✅ Tienes un PIN activo. Puedes usarlo en lugar de tu contraseña para reanudar sesiones suspendidas."
              : "Configura un PIN de 4–6 dígitos para desbloquear tu sesión más rápido, sin escribir tu contraseña completa."}
          </div>
          <div className="dos-col" style={{ gap: 8 }}>
            <button className="boton" onClick={() => { setPaso("configurar"); setOk(""); setError(""); }}>
              {tienePIN ? "Cambiar PIN" : "Configurar PIN"}
            </button>
            {tienePIN && (
              <button className="boton secundario" style={{ color: "var(--cochinilla)" }} onClick={borrar}>
                Eliminar PIN
              </button>
            )}
          </div>
        </>
      )}

      {paso === "configurar" && (
        <>
          <div className="campo">
            <label>PIN nuevo (4–6 dígitos)</label>
            <input type="password" inputMode="numeric" maxLength={6} value={pin}
              autoFocus onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} placeholder="••••" />
          </div>
          <div className="campo">
            <label>Confirmar PIN</label>
            <input type="password" inputMode="numeric" maxLength={6} value={pin2}
              onChange={(e) => setPin2(e.target.value.replace(/\D/g, ""))} placeholder="••••"
              onKeyDown={(e) => e.key === "Enter" && guardar()} />
          </div>
          <div className="dos-col">
            <button className="boton secundario" onClick={() => { setPaso("idle"); setPin(""); setPin2(""); setError(""); }}>Cancelar</button>
            <button className="boton" onClick={guardar} disabled={pin.length < 4 || pin2.length < 4}>Guardar PIN</button>
          </div>
        </>
      )}
    </div>
  );
}
