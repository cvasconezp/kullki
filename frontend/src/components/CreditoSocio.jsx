import { useEffect, useState } from "react";
import { api, usd } from "../lib/api.js";
import { imprimirSolicitudCredito } from "../lib/exportar.js";

export default function CreditoSocio({ lib }) {
  const tasa = lib.caja_tasa || 0;
  const [monto, setMonto] = useState(""); const [plazo, setPlazo] = useState("6");
  const [destino, setDestino] = useState(""); const [garante, setGarante] = useState(""); const [docs, setDocs] = useState("");
  const [pend, setPend] = useState(null); const [error, setError] = useState(""); const [ok, setOk] = useState(""); const [enviando, setEnviando] = useState(false);
  const cargar = () => api("/creditos/solicitud").then(setPend).catch(() => setPend(null));
  useEffect(() => { cargar(); }, []);
  const m = +monto, n = +plazo, i = tasa / 100;
  const cuota = (m > 0 && n > 0) ? (i > 0 ? m * (i * (1 + i) ** n) / ((1 + i) ** n - 1) : m / n) : null;
  const enviar = async () => {
    setError(""); setOk(""); setEnviando(true);
    try {
      await api("/creditos/solicitud", { method: "POST", body: { monto: m, plazo_meses: n, destino, garante, documentos: docs } });
      setOk("Solicitud enviada. El tesorero la revisará."); cargar();
    } catch (e) { setError(e.message); } finally { setEnviando(false); }
  };
  return (
    <div className="tarjeta no-print">
      <h3>Solicitar un crédito</h3>
      {error && <div className="error">{error}</div>}
      {ok && <div className="exito">{ok}</div>}
      {pend ? (
        <>
          <div className="login-hint">Tienes una <strong>solicitud pendiente</strong>: {usd(pend.monto)} a {pend.plazo_meses} meses
            {pend.destino ? ` (${pend.destino})` : ""}. El tesorero la revisará.</div>
          <button className="boton secundario" style={{ marginTop: 10 }} onClick={() => imprimirSolicitudCredito(lib, pend)}>
            🖨 Descargar solicitud (PDF)</button>
        </>
      ) : (
        <>
          <p className="detalle" style={{ color: "var(--tinta-suave)", fontSize: 12.5, margin: "0 0 8px" }}>
            Calcula tu cuota y envía la solicitud. La directiva la revisa y aprueba.
          </p>
          <div className="dos-col">
            <div className="campo"><label>Monto (USD)</label><input inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="500" /></div>
            <div className="campo"><label>Plazo (meses)</label><input inputMode="numeric" value={plazo} onChange={(e) => setPlazo(e.target.value)} /></div>
          </div>
          {cuota && <div className="login-hint">Cuota estimada: <strong>{usd(cuota)}</strong> al mes · total aprox. {usd(cuota * n)} (tasa {tasa}% mensual).</div>}
          <div className="campo"><label>Destino del crédito</label><input value={destino} onChange={(e) => setDestino(e.target.value)} placeholder="Siembra, negocio, salud…" /></div>
          <div className="campo"><label>Garante / aval (nombre y cédula)</label><input value={garante} onChange={(e) => setGarante(e.target.value)} /></div>
          <div className="campo"><label>Documentos (describe o enlaces)</label><input value={docs} onChange={(e) => setDocs(e.target.value)} placeholder="Copia de cédula, rol de pagos…" /></div>
          <button className="boton" onClick={enviar} disabled={enviando || !(m > 0) || !(n > 0)}>{enviando ? "Enviando…" : "Enviar solicitud"}</button>
        </>
      )}
    </div>
  );
}
