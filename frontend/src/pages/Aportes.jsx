import { useEffect, useState } from "react";
import { api, usd, fechaCorta, getSesion } from "../lib/api.js";
import { imprimirBoucher } from "../lib/exportar.js";

function CobroCuota() {
  const [socios, setSocios] = useState([]);
  const [creditosPorSocio, setCreditosPorSocio] = useState({}); // socio_id → cuota pendiente
  const [socioId, setSocioId] = useState("");
  const [cuotaDetalle, setCuotaDetalle] = useState(null); // { cuota, credito_id, socio_nombres, plazo_meses, destino }
  const [abono, setAbono] = useState("");
  const [cargando, setCargando] = useState(false);
  const [ok, setOk] = useState(""); const [error, setError] = useState("");

  useEffect(() => {
    api("/socios").then((s) => setSocios(s.filter((x) => x.activo))).catch(() => {});
    // Carga todos los créditos activos y agrupa la primera cuota pendiente por socio
    api("/creditos").then((lista) => {
      const mapa = {};
      lista.filter((c) => c.saldo_capital > 0).forEach((c) => {
        if (!mapa[c.socio_id]) mapa[c.socio_id] = c;
      });
      setCreditosPorSocio(mapa);
    }).catch(() => {});
  }, []);

  const seleccionarSocio = async (sid) => {
    setSocioId(sid); setCuotaDetalle(null); setAbono(""); setOk(""); setError("");
    if (!sid || !creditosPorSocio[+sid]) return;
    const credito = creditosPorSocio[+sid];
    const d = await api(`/creditos/${credito.id}`).catch(() => null);
    if (!d) return;
    const primeraPendiente = d.cuotas.find((q) => !q.pagada);
    if (primeraPendiente) setCuotaDetalle({ cuota: primeraPendiente, credito_id: d.id, socio_nombres: d.socio_nombres, plazo_meses: d.plazo_meses, destino: d.destino });
  };

  const cobrar = async (parcial) => {
    if (!cuotaDetalle) return;
    setCargando(true); setOk(""); setError("");
    const ses = getSesion() || {};
    try {
      let d;
      if (parcial) {
        d = await api(`/creditos/cuotas/${cuotaDetalle.cuota.id}/abonar`, { method: "POST", body: { monto: +abono } });
      } else {
        d = await api(`/creditos/cuotas/${cuotaDetalle.cuota.id}/pagar`, { method: "POST", body: {} });
      }
      const cuotaActualizada = d.cuotas.find((c) => c.id === cuotaDetalle.cuota.id);
      const montoImpreso = parcial ? +abono : cuotaDetalle.cuota.total;
      imprimirBoucher({
        tipo: parcial ? "abono" : "pago_cuota",
        monto: montoImpreso,
        fecha: cuotaActualizada?.fecha_pago || new Date().toISOString().slice(0, 10),
        socio: { nombres: cuotaDetalle.socio_nombres },
        nota: `Cuota ${cuotaDetalle.cuota.numero} de ${cuotaDetalle.plazo_meses} · ${cuotaDetalle.destino || ""}`,
        registradoPor: ses.nombre,
        cajaInfo: { nombre: ses.caja_nombre, color_primario: ses.color_primario, color_acento: ses.color_acento, logo: ses.logo },
      });
      setOk(`${parcial ? "Abono" : "Cuota"} de ${usd(montoImpreso)} registrado para ${cuotaDetalle.socio_nombres}.`);
      setAbono("");
      // Refrescar cuotas del mismo socio
      await seleccionarSocio(socioId);
      // Actualizar mapa de créditos activos
      api("/creditos").then((lista) => {
        const mapa = {};
        lista.filter((c) => c.saldo_capital > 0).forEach((c) => { if (!mapa[c.socio_id]) mapa[c.socio_id] = c; });
        setCreditosPorSocio(mapa);
      }).catch(() => {});
    } catch (e) { setError(e.message); }
    finally { setCargando(false); }
  };

  const tieneCreditoActivo = socioId && creditosPorSocio[+socioId];
  const pendiente = cuotaDetalle ? +(cuotaDetalle.cuota.total - (cuotaDetalle.cuota.abonado || 0)).toFixed(2) : 0;
  const vencida = cuotaDetalle && new Date(cuotaDetalle.cuota.fecha_vencimiento) < new Date();

  return (
    <div className="tarjeta">
      <h3>Cobrar cuota de crédito</h3>
      {error && <div className="error">{error}</div>}
      {ok && <div className="exito">{ok}</div>}
      <div className="campo">
        <label htmlFor="cc-socio">Socio</label>
        <select id="cc-socio" value={socioId} onChange={(e) => seleccionarSocio(e.target.value)}>
          <option value="">Elige un socio…</option>
          {socios.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombres}{creditosPorSocio[s.id] ? " 🏦" : ""}
            </option>
          ))}
        </select>
      </div>

      {socioId && !tieneCreditoActivo && (
        <div className="vacio">Este socio no tiene créditos activos.</div>
      )}

      {cuotaDetalle && (
        <>
          <div className="tarjeta" style={{ margin: "12px 0 0", background: vencida ? "rgba(220,38,38,.06)" : "var(--superficie)", border: `1px solid ${vencida ? "var(--cochinilla)" : "var(--regla)"}` }}>
            <div className="fila" style={{ borderBottom: "none" }}>
              <div>
                <div className="principal">
                  Cuota {cuotaDetalle.cuota.numero} de {cuotaDetalle.plazo_meses}
                  {vencida
                    ? <span className="pill mora" style={{ marginLeft: 6 }}>vencida</span>
                    : <span className="pill neutro" style={{ marginLeft: 6 }}>pendiente</span>}
                </div>
                <div className="detalle">
                  vence {fechaCorta(cuotaDetalle.cuota.fecha_vencimiento)} · capital {usd(cuotaDetalle.cuota.capital)} + interés {usd(cuotaDetalle.cuota.interes)}
                  {cuotaDetalle.destino && ` · ${cuotaDetalle.destino}`}
                </div>
                {cuotaDetalle.cuota.abonado > 0 && (
                  <div className="detalle" style={{ color: "var(--tinta-suave)" }}>
                    Abonado: {usd(cuotaDetalle.cuota.abonado)} · Pendiente: {usd(pendiente)}
                  </div>
                )}
              </div>
              <div className="cifra" style={{ color: vencida ? "var(--cochinilla)" : undefined }}>
                {usd(pendiente)}
              </div>
            </div>
          </div>

          <button className="boton" style={{ marginTop: 12, background: vencida ? "var(--cochinilla)" : undefined }}
            disabled={cargando} onClick={() => cobrar(false)}>
            {cargando ? "Registrando…" : `Cobrar ${usd(pendiente)} (cuota completa)`}
          </button>

          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <input inputMode="decimal" placeholder="Abono parcial (USD)"
              value={abono} onChange={(e) => setAbono(e.target.value)}
              style={{ flex: 1, padding: "10px 12px", border: "1px solid var(--regla)", borderRadius: 10, fontFamily: "var(--cuerpo)", fontSize: 14 }} />
            <button className="boton secundario" disabled={cargando || !(+abono > 0) || +abono >= pendiente}
              onClick={() => cobrar(true)}>
              Registrar abono
            </button>
          </div>
        </>
      )}

      {!cuotaDetalle && tieneCreditoActivo && (
        <div className="vacio">Cargando cuota…</div>
      )}
    </div>
  );
}

export default function Aportes() {
  const [socios, setSocios] = useState([]);
  const [aportes, setAportes] = useState(null);
  const [retiros, setRetiros] = useState([]);
  const [error, setError] = useState(""); const [ok, setOk] = useState("");
  const [modo, setModo] = useState("aporte");
  const [form, setForm] = useState({ socio_id: "", monto: "", tipo: "ordinario", nota: "", cantidad_kg: "" });
  const [guardando, setGuardando] = useState(false);
  const [permiteRetiros, setPermiteRetiros] = useState(true);
  const [editId, setEditId] = useState(null);   // `${_t}${id}`
  const [editMonto, setEditMonto] = useState("");

  const ses = getSesion() || {};
  const sinLimite = ses.rol === "superadmin" || ses.es_impersonacion;

  const cargar = () => {
    api("/socios").then((s) => setSocios(s.filter((x) => x.activo))).catch((e) => setError(e.message));
    api("/aportes?limit=40").then(setAportes).catch((e) => setError(e.message));
    api("/retiros?limit=40").then(setRetiros).catch(() => {});
    api("/dashboard").then((d) => { setPermiteRet