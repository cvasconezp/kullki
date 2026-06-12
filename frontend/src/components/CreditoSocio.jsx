import { useEffect, useState } from "react";
import { api, usd } from "../lib/api.js";
import { imprimirSolicitudCredito } from "../lib/exportar.js";

const DESTINOS = ["Capital de trabajo / negocio", "Siembra / agricultura", "Ganadería",
  "Salud", "Educación", "Vivienda / mejoras", "Emergencia familiar", "Compra de insumos", "Otro"];
const MAX_DOC = 4 * 1024 * 1024; // 4 MB

export default function CreditoSocio({ lib }) {
  const tasa = lib.caja_tasa || 0;
  const [tipo, setTipo] = useState("ordinario");
  const [monto, setMonto] = useState(""); const [plazo, setPlazo] = useState("6");
  const [destino, setDestino] = useState(""); const [destinoOtro, setDestinoOtro] = useState("");
  const [garante, setGarante] = useState(""); const [garante2, setGarante2] = useState("");
  const [docNombre, setDocNombre] = useState(""); const [docB64, setDocB64] = useState("");
  const [garantes, setGarantes] = useState([]);
  const [pend, setPend] = useState(null);
  const [error, setError] = useState(""); const [ok, setOk] = useState(""); const [enviando, setEnviando] = useState(false);
  const [corrigiendo, setCorrigiendo] = useState(false);

  const cargar = () => api("/creditos/solicitud").then(setPend).catch(() => setPend(null));
  useEffect(() => {
    cargar();
    api("/creditos/garantes").then(setGarantes).catch(() => setGarantes([]));
  }, []);

  const m = +monto, n = +plazo, i = tasa / 100;
  const cuota = (m > 0 && n > 0) ? (i > 0 ? m * (i * (1 + i) ** n) / ((1 + i) ** n - 1) : m / n) : null;
  const destinoFinal = destino === "Otro" ? destinoOtro.trim() : destino;
  const completo = m > 0 && n > 0 && destinoFinal && garante && docB64;

  const onArchivo = (e) => {
    setError("");
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    if (!/(pdf|jpe?g|png)$/i.test(f.name)) { setError("El documento debe ser PDF, JPG o PNG."); return; }
    if (f.size > MAX_DOC) { setError("El documento no debe superar 4 MB."); return; }
    const r = new FileReader();
    r.onload = () => { setDocB64(r.result); setDocNombre(f.name); };
    r.readAsDataURL(f);
  };

  const enviar = async () => {
    setError(""); setOk("");
    if (!completo) { setError("Completa todos los campos: monto, plazo, destino, garante y documento."); return; }
    if (garante2 && garante2 === garante) { setError("Los dos garantes deben ser personas distintas."); return; }
    setEnviando(true);
    try {
      await api("/creditos/solicitud", { method: "POST", body: {
        monto: m, plazo_meses: n, tipo, destino: destinoFinal,
        garante, garante2, documentos: docNombre,
        documento_nombre: docNombre, documento_b64: docB64,
      }});
      setOk("✓ Solicitud enviada. Llega al tesorero y la aprueba la directiva o la asamblea.");
      setMonto(""); setDestino(""); setDestinoOtro(""); setGarante(""); setGarante2("");
      setDocNombre(""); setDocB64(""); setCorrigiendo(false);
      cargar();
    } catch (e) { setError(e.message); } finally { setEnviando(false); }
  };

  return (
    <div className="tarjeta no-print">
      <h3>Solicitar un crédito</h3>
      {error && <div className="error">{error}</div>}
      {ok && <div className="exito">{ok}</div>}
      {pend && !corrigiendo ? (
        <>
          {pend.estado === "correccion" ? (
            <div className="error" style={{ background: "#FEF3C7", color: "#92400E", border: "1px solid #FCD34D" }}>
              El tesorero pidió correcciones: <strong>{pend.motivo || "revisa los datos y el documento."}</strong>
            </div>
          ) : (
            <div className="login-hint">
              Tu solicitud de <strong>{usd(pend.monto)}</strong> a {pend.plazo_meses} meses
              {pend.destino ? ` (${pend.destino})` : ""} · {pend.tipo === "emergente" ? "emergente" : "ordinario"}.{" "}
              {pend.estado === "en_aprobacion"
                ? "El tesorero la revisó y la derivó a la directiva para su aprobación."
                : "Llegó al tesorero; está en revisión antes de pasar a la directiva."}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            <button className="boton secundario" onClick={() => imprimirSolicitudCredito(lib, pend)}>
              🖨 Descargar solicitud (PDF)</button>
            {pend.estado === "correccion" && (
              <button className="boton" onClick={() => {
                setTipo(pend.tipo || "ordinario"); setMonto(String(pend.monto || ""));
                setPlazo(String(pend.plazo_meses || "6")); setGarante(pend.garante || ""); setGarante2(pend.garante2 || "");
                setCorrigiendo(true);
              }}>Corregir y reenviar</button>
            )}
          </div>
        </>
      ) : (
        <>
          <p className="detalle" style={{ color: "var(--tinta-suave)", fontSize: 12.5, margin: "0 0 8px" }}>
            Todos los campos son obligatorios. La solicitud llega al tesorero y la aprueba la directiva o la asamblea.
          </p>
          <div className="campo"><label>Tipo de crédito</label>
            <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
              <option value="ordinario">Ordinario</option>
              <option value="emergente">Emergente (extraordinario)</option>
            </select>
          </div>
          <div className="dos-col">
            <div className="campo"><label>Monto (USD)</label>
              <input inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="500" /></div>
            <div className="campo"><label>Plazo (meses)</label>
              <input inputMode="numeric" value={plazo} onChange={(e) => setPlazo(e.target.value)} /></div>
          </div>
          {cuota && <div className="login-hint">Cuota estimada: <strong>{usd(cuota)}</strong> al mes · total aprox. {usd(cuota * n)} (tasa {tasa}% mensual).</div>}

          <div className="campo"><label>Destino del crédito</label>
            <select value={destino} onChange={(e) => setDestino(e.target.value)}>
              <option value="">Elige un destino…</option>
              {DESTINOS.map((d) => <option key={d} value={d === "Otro" ? "Otro" : d}>{d}</option>)}
            </select>
          </div>
          {destino === "Otro" && (
            <div className="campo"><label>Especifica el destino</label>
              <input value={destinoOtro} onChange={(e) => setDestinoOtro(e.target.value)} placeholder="Describe para qué es el crédito" /></div>
          )}

          <div className="campo"><label>Garante (socio de la caja)</label>
            <select value={garante} onChange={(e) => setGarante(e.target.value)}>
              <option value="">Elige un garante…</option>
              {garantes.map((g) => <option key={g.id} value={g.nombre}>{g.nombre}</option>)}
            </select>
          </div>
          <div className="campo"><label>Segundo garante (si la caja lo exige)</label>
            <select value={garante2} onChange={(e) => setGarante2(e.target.value)}>
              <option value="">— Ninguno —</option>
              {garantes.filter((g) => g.nombre !== garante).map((g) => <option key={g.id} value={g.nombre}>{g.nombre}</option>)}
            </select>
          </div>

          <div className="campo"><label>Documento (letra de cambio u otro · PDF/JPG/PNG)</label>
            <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={onArchivo} />
            {docNombre && <div className="detalle" style={{ marginTop: 4 }}>Adjuntado: <strong>{docNombre}</strong></div>}
          </div>

          <button className="boton" onClick={enviar} disabled={enviando || !completo}>
            {enviando ? "Enviando…" : "Enviar solicitud"}
          </button>
          {!completo && <div className="detalle" style={{ color: "var(--tinta-suave)", fontSize: 12, marginTop: 6 }}>
            Faltan campos por completar (incluye el documento adjunto).
          </div>}
        </>
      )}
    </div>
  );
}
