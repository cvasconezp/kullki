import { useEffect, useState } from "react";
import { api, usd, fechaCorta, getSesion } from "../lib/api.js";
import { imprimirBoucher } from "../lib/exportar.js";

const _hora = (ts) => ts ? new Date(ts).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit', hour12: false }) : new Date().toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit', hour12: false });
function CobroCuota() {
  const [socios, setSocios] = useState([]);
  const [creditosPorSocio, setCreditosPorSocio] = useState({});
  const [socioId, setSocioId] = useState("");
  const [cuotaDetalle, setCuotaDetalle] = useState(null);
  const [abono, setAbono] = useState("");
  const [cargando, setCargando] = useState(false);
  const [ok, setOk] = useState(""); const [error, setError] = useState("");

  const recargarCreditos = () => {
    api("/creditos").then((lista) => {
      const mapa = {};
      lista.filter((c) => c.saldo_capital > 0).forEach((c) => {
        if (!mapa[c.socio_id]) mapa[c.socio_id] = c;
      });
      setCreditosPorSocio(mapa);
    }).catch(() => {});
  };

  useEffect(() => {
    api("/socios").then((s) => setSocios(s.filter((x) => x.activo))).catch(() => {});
    recargarCreditos();
  }, []);

  const seleccionarSocio = async (sid) => {
    setSocioId(sid); setCuotaDetalle(null); setAbono(""); setOk(""); setError("");
    if (!sid || !creditosPorSocio[+sid]) return;
    const credito = creditosPorSocio[+sid];
    const d = await api(`/creditos/${credito.id}`).catch(() => null);
    if (!d) return;
    const primeraPendiente = d.cuotas.find((q) => !q.pagada);
    if (primeraPendiente) {
      setCuotaDetalle({ cuota: primeraPendiente, credito_id: d.id,
        socio_nombres: d.socio_nombres, plazo_meses: d.plazo_meses, destino: d.destino });
    }
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
        hora: _hora(cuotaActualizada?.creado_en),
        transaccionId: cuotaActualizada?.id,
        socioId: +socioId,
        socio: { nombres: cuotaDetalle.socio_nombres },
        nota: `Cuota ${cuotaDetalle.cuota.numero} de ${cuotaDetalle.plazo_meses} · ${cuotaDetalle.destino || ""}`,
        registradoPor: ses.nombre,
        cajaInfo: { nombre: ses.caja_nombre, color_primario: ses.color_primario, color_acento: ses.color_acento, logo: ses.logo },
      });
      setOk(`${parcial ? "Abono" : "Cuota"} de ${usd(montoImpreso)} registrado para ${cuotaDetalle.socio_nombres}.`);
      setAbono(""); setCuotaDetalle(null); setSocioId("");
      recargarCreditos();
    } catch (e) { setError(e.message); }
    finally { setCargando(false); }
  };

  const tieneCreditoActivo = socioId && !!creditosPorSocio[+socioId];
  const pendiente = cuotaDetalle ? +(cuotaDetalle.cuota.total - (cuotaDetalle.cuota.abonado || 0)).toFixed(2) : 0;
  const vencida = cuotaDetalle && new Date(cuotaDetalle.cuota.fecha_vencimiento) < new Date();

  return (
    <div>
      {error && <div className="error">{error}</div>}
      {ok && <div className="exito">{ok}</div>}
      <div className="campo">
        <label htmlFor="cc-socio">Socio con crédito activo</label>
        <select id="cc-socio" value={socioId} onChange={(e) => seleccionarSocio(e.target.value)}>
          <option value="">Elige un socio…</option>
          {socios.filter((s) => !!creditosPorSocio[s.id]).map((s) => (
            <option key={s.id} value={s.id}>{s.nombres}</option>
          ))}
        </select>
      </div>
      {socioId && !tieneCreditoActivo && (
        <div className="vacio">Este socio no tiene crédito activo.</div>
      )}
      {cuotaDetalle && (
        <>
          <div className="fila" style={{ borderBottom: "none", padding: "10px 0" }}>
            <div>
              <div className="principal">
                Cuota {cuotaDetalle.cuota.numero} de {cuotaDetalle.plazo_meses}
                {vencida && <span className="pill mora" style={{ marginLeft: 6 }}>vencida</span>}
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
    api("/dashboard").then((d) => { setPermiteRetiros(d.caja.permite_retiros !== false); if (d.caja.permite_retiros === false) setModo("aporte"); }).catch(() => {});
  };
  useEffect(() => { cargar(); }, []);

  const registrar = async () => {
    setError(""); setOk(""); setGuardando(true);
    try {
      if (modo === "aporte") {
        const a = await api("/aportes", { method: "POST", body: { ...form, socio_id: +form.socio_id, monto: +form.monto } });
        setOk(`Aporte de ${usd(a.monto)} de ${a.socio_nombres} registrado.`);
        imprimirBoucher({ tipo: form.tipo, monto: a.monto, fecha: a.fecha, hora: _hora(a.creado_en), transaccionId: a.id, socioId: a.socio_id, socio: { nombres: a.socio_nombres, cedula: a.socio_cedula }, nota: form.nota, registradoPor: ses.nombre, cajaInfo: { nombre: ses.caja_nombre, color_primario: ses.color_primario, color_acento: ses.color_acento, logo: ses.logo } });
      } else {
        const r = await api("/retiros", { method: "POST", body: { socio_id: +form.socio_id, monto: +form.monto, nota: form.nota } });
        setOk(`Retiro de ${usd(r.monto)} de ${r.socio_nombres} registrado.`);
        imprimirBoucher({ tipo: "retiro", monto: r.monto, fecha: r.fecha, hora: _hora(r.creado_en), transaccionId: r.id, socioId: r.socio_id, socio: { nombres: r.socio_nombres, cedula: r.socio_cedula }, nota: form.nota, registradoPor: ses.nombre, cajaInfo: { nombre: ses.caja_nombre, color_primario: ses.color_primario, color_acento: ses.color_acento, logo: ses.logo } });
      }
      setForm({ ...form, monto: "", nota: "" }); cargar();
    } catch (e) { setError(e.message); }
    finally { setGuardando(false); }
  };

  const minutosRestantes = (m) => {
    if (!m.creado_en) return 0;
    const ms = 5 * 60 * 1000 - (Date.now() - new Date(m.creado_en + "Z").getTime());
    return Math.max(0, Math.ceil(ms / 60000));
  };
  const editable = (m) => !m.anulado && (sinLimite || minutosRestantes(m) > 0);

  const guardarEdicion = async (m) => {
    setError(""); setOk("");
    try {
      await api(`/${m._t === "retiro" ? "retiros" : "aportes"}/${m.id}`, { method: "PATCH", body: { monto: +editMonto } });
      setOk("Movimiento corregido."); setEditId(null); cargar();
    } catch (e) { setError(e.message); }
  };
  const anular = async (m) => {
    if (!window.confirm(`¿Anular este ${m._t} de ${usd(m.monto)} de ${m.socio_nombres}? Quedará registrado en la bitácora.`)) return;
    setError(""); setOk("");
    try {
      await api(`/${m._t === "retiro" ? "retiros" : "aportes"}/${m.id}/anular`, { method: "POST" });
      setOk("Movimiento anulado."); cargar();
    } catch (e) { setError(e.message); }
  };

  const movimientos = [
    ...(aportes || []).map((a) => ({ ...a, _t: "aporte" })),
    ...retiros.map((r) => ({ ...r, _t: "retiro", tipo: "retiro" })),
  ].sort((a, b) => (a.fecha < b.fecha ? 1 : -1));

  return (
    <>
      <div className="seccion-titulo"><h2>Movimientos</h2></div>
      {error && <div className="error">{error}</div>}
      {ok && <div className="exito">{ok}</div>}

      <div className="tarjeta">
        <div className="segmentos" role="tablist">
          <button role="tab" className={modo === "aporte" ? "seg activo" : "seg"} onClick={() => setModo("aporte")}>Aporte</button>
          {permiteRetiros && <button role="tab" className={modo === "retiro" ? "seg activo" : "seg"} onClick={() => setModo("retiro")}>Retiro</button>}
          <button role="tab" className={modo === "cuota" ? "seg activo" : "seg"} onClick={() => setModo("cuota")}>Cobrar cuota</button>
        </div>
        {modo === "cuota" && <CobroCuota />}
        {modo !== "cuota" && <h3>{modo === "aporte" ? "Registrar aporte" : "Registrar retiro de ahorro"}</h3>}
        {modo !== "cuota" && (
          <>
            <div className="campo"><label htmlFor="as">Socio</label>
              <select id="as" value={form.socio_id} onChange={(e) => setForm({ ...form, socio_id: e.target.value })}>
                <option value="">Elige un socio…</option>
                {socios.map((s) => <option key={s.id} value={s.id}>{s.nombres}</option>)}
              </select></div>
            <div className="campo"><label htmlFor="am">Monto (USD)</label>
              <input id="am" inputMode="decimal" value={form.monto} placeholder="10.00" onChange={(e) => setForm({ ...form, monto: e.target.value })} /></div>
            {modo === "aporte" ? (
              <div className="campo"><label htmlFor="at">Tipo</label>
                <select id="at" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
                  <option value="ordinario">Ordinario</option>
                  <option value="extraordinario">Extraordinario</option>
                  <option value="eco_ahorro">Eco ahorro</option>
                  <option value="mascotas">Mascotas</option>
                  <option value="ingreso">Cuota de ingreso (membresía, no es ahorro)</option>
                  <option value="multa">Multa (va al fondo, no al ahorro)</option>
                </select></div>
            ) : (
              <div className="campo"><label htmlFor="an">Nota (opcional)</label>
                <input id="an" value={form.nota} placeholder="Motivo del retiro" onChange={(e) => setForm({ ...form, nota: e.target.value })} /></div>
            )}
            <button className="boton" onClick={registrar} style={modo === "retiro" ? { background: "var(--cochinilla)" } : {}}
              disabled={guardando || !form.socio_id || !(+form.monto > 0)}>
              {guardando ? "Registrando…" : modo === "aporte" ? "Registrar aporte" : "Registrar retiro"}
            </button>
            <div className="login-hint" style={{ marginTop: 12 }}>
              Si te equivocas, puedes corregir o anular un movimiento dentro de los <strong>5 minutos</strong>.
              Pasado ese tiempo, solo el administrador puede autorizarlo.
            </div>
          </>
        )}
      </div>

      <div className="tarjeta">
        <h3>Movimientos recientes</h3>
        {!aportes && <div className="vacio">Cargando…</div>}
        {aportes && movimientos.length === 0 && <div className="vacio">Todavía no hay movimientos.</div>}
        {aportes && movimientos.map((m) => {
          const id = m._t + m.id;
          return (
            <div className="fila" key={id} style={m.anulado ? { opacity: .5 } : {}}>
              <div>
                <div className="principal">{m.socio_nombres}
                  {m.anulado && <span className="pill neutro" style={{ marginLeft: 6 }}>anulado</span>}</div>
                <div className="detalle">
                  {fechaCorta(m.fecha)} · {m.tipo}{m.nota ? ` · ${m.nota}` : ""}
                  {!m.anulado && !sinLimite && minutosRestantes(m) > 0 && ` · editable ${minutosRestantes(m)} min`}
                </div>
                {editId === id && (
                  <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                    <input style={{ maxWidth: 120 }} inputMode="decimal" value={editMonto}
                      onChange={(e) => setEditMonto(e.target.value)} />
                    <button className="boton mini" onClick={() => guardarEdicion(m)}>Guardar</button>
                    <button className="boton mini secundario" onClick={() => setEditId(null)}>Cancelar</button>
                  </div>
                )}
              </div>
              <div style={{ textAlign: "right" }}>
                <div className={"cifra " + (m._t === "retiro" ? "neg" : "pos")} style={m.anulado ? { textDecoration: "line-through" } : {}}>
                  {m._t === "retiro" ? "−" : ""}{usd(m.monto)}
                </div>
                {editable(m) && editId !== id && (
                  <div className="acciones-mov">
                    <button onClick={() => { setEditId(id); setEditMonto(String(m.monto)); }}>✎ Editar</button>
                    <button onClick={() => anular(m)}>✕ Anular</button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
