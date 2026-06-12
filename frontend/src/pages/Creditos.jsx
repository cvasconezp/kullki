import { useEffect, useState } from "react";
import { api, usd, fechaCorta } from "../lib/api.js";
import { waLink } from "../lib/exportar.js";

function TablaCuotas({ credito, onPagar, onAbonar, pagando }) {
  const [abonos, setAbonos] = useState({});
  const primeraPendiente = credito.cuotas.find((q) => !q.pagada)?.id;
  return (
    <div>
      {credito.cuotas.map((c) => {
        const vencida = !c.pagada && new Date(c.fecha_vencimiento) < new Date();
        const pendiente = +(c.total - (c.abonado || 0)).toFixed(2);
        return (
          <div key={c.id} style={{ borderBottom: "1px dashed var(--regla)", padding: "9px 0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <div>
                <div className="principal" style={{ fontSize: 14 }}>
                  Cuota {c.numero} · <span className="cifra">{usd(c.total)}</span>
                  {!c.pagada && c.abonado > 0 &&
                    <span className="detalle"> (abonado {usd(c.abonado)})</span>}
                </div>
                <div className="detalle">
                  capital {usd(c.capital)} + interés {usd(c.interes)} · vence {fechaCorta(c.fecha_vencimiento)}
                </div>
              </div>
              {c.pagada ? (
                <span className="pill ok">pagada {fechaCorta(c.fecha_pago)}</span>
              ) : c.id === primeraPendiente ? (
                <button className="boton mini" disabled={pagando}
                  style={vencida ? { background: "var(--cochinilla)" } : {}}
                  onClick={() => onPagar(c.id)}>
                  {vencida ? "Cobrar (vencida)" : "Cobrar " + usd(pendiente)}
                </button>
              ) : (
                <span className="pill neutro">pendiente</span>
              )}
            </div>
            {!c.pagada && c.id === primeraPendiente && (
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <input inputMode="decimal" placeholder="Abono parcial"
                  value={abonos[c.id] || ""}
                  style={{ flex: 1, padding: "8px 10px", border: "1px solid var(--regla)",
                           borderRadius: 9, fontSize: 14, fontFamily: "var(--cuerpo)" }}
                  onChange={(e) => setAbonos({ ...abonos, [c.id]: e.target.value })} />
                <button className="boton mini secundario"
                  disabled={pagando || !(+abonos[c.id] > 0)}
                  onClick={() => { onAbonar(c.id, +abonos[c.id]); setAbonos({ ...abonos, [c.id]: "" }); }}>
                  Abonar
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Recordatorios() {
  const [items, setItems] = useState(null);
  useEffect(() => { api("/recordatorios?dias=7").then(setItems).catch(() => setItems([])); }, []);
  if (!items || items.length === 0) return null;
  const msg = (r) => {
    const f = fechaCorta(r.fecha_vencimiento);
    return r.estado === "vencida"
      ? `Hola ${r.socio.split(" ")[0]}, te saluda ${r.caja_nombre}. Tu cuota ${r.cuota} de ${usd(r.monto)} venció el ${f}. Por favor acércate a ponerte al día. ¡Gracias!`
      : `Hola ${r.socio.split(" ")[0]}, te saluda ${r.caja_nombre}. Te recordamos que tu cuota ${r.cuota} de ${usd(r.monto)} vence el ${f}. ¡Gracias!`;
  };
  return (
    <div className="tarjeta">
      <h3>Recordatorios de cobro ({items.length})</h3>
      <div className="detalle" style={{ color: "var(--tinta-suave)", fontSize: 13, margin: "0 0 6px" }}>
        Cuotas vencidas o por vencer esta semana. Envía el recordatorio por WhatsApp con un toque.
      </div>
      {items.map((r) => (
        <div className="fila" key={r.credito_id}>
          <div>
            <div className="principal">{r.socio} {r.estado === "vencida"
              ? <span className="pill mora">vencida</span> : <span className="pill neutro">por vencer</span>}</div>
            <div className="detalle">Cuota {r.cuota} · {usd(r.monto)} · vence {fechaCorta(r.fecha_vencimiento)}</div>
          </div>
          {r.whatsapp
            ? <a className="boton mini" style={{ background: "#25D366", color: "#fff", textDecoration: "none" }}
                href={waLink(r.whatsapp, msg(r))} target="_blank" rel="noreferrer">WhatsApp</a>
            : <span className="pill neutro">sin WhatsApp</span>}
        </div>
      ))}
    </div>
  );
}

function SolicitudesCredito({ onCambio }) {
  const [sols, setSols] = useState([]); const [error, setError] = useState("");
  const cargar = () => api("/creditos/solicitudes").then(setSols).catch(() => setSols([]));
  useEffect(() => { cargar(); }, []);
  const aprobar = async (id) => {
    setError("");
    try { await api(`/creditos/solicitudes/${id}/aprobar`, { method: "POST" }); cargar(); onCambio && onCambio(); }
    catch (e) { setError(e.message); }
  };
  const rechazar = async (id) => {
    const m = window.prompt("Motivo del rechazo (opcional):") || "";
    setError("");
    try { await api(`/creditos/solicitudes/${id}/rechazar?motivo=${encodeURIComponent(m)}`, { method: "POST" }); cargar(); }
    catch (e) { setError(e.message); }
  };
  if (!sols.length) return null;
  return (
    <div className="tarjeta" style={{ borderColor: "var(--sara)" }}>
      <h3>Solicitudes de crédito ({sols.length})</h3>
      {error && <div className="error">{error}</div>}
      {sols.map((s) => (
        <div key={s.id} style={{ borderBottom: "1px dashed var(--regla)", padding: "8px 0" }}>
          <div className="principal">{s.socio_nombre} · {usd(s.monto)} · {s.plazo_meses} meses</div>
          <div className="detalle" style={{ margin: "2px 0 8px" }}>
            {s.destino || "Sin destino"}{s.garante ? ` · garante: ${s.garante}` : ""}{s.documentos ? ` · docs: ${s.documentos}` : ""}
          </div>
          <div className="dos-col">
            <button className="boton secundario" onClick={() => rechazar(s.id)}>Rechazar</button>
            <button className="boton" onClick={() => aprobar(s.id)}>Aprobar y otorgar</button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Creditos() {
  const [creditos, setCreditos] = useState(null);
  const [socios, setSocios] = useState([]);
  const [detalle, setDetalle] = useState({});
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [mostrarForm, setMostrarForm] = useState(false);
  const [form, setForm] = useState({ socio_id: "", monto: "", plazo_meses: "6", destino: "", garante: "" });
  const [trabajando, setTrabajando] = useState(false);

  const cargar = () => {
    api("/creditos").then(setCreditos).catch((e) => setError(e.message));
    api("/socios").then((s) => setSocios(s.filter((x) => x.activo))).catch(() => {});
  };
  useEffect(() => { cargar(); }, []);

  const abrir = async (id) => {
    if (detalle[id]) { setDetalle({ ...detalle, [id]: null }); return; }
    const d = await api(`/creditos/${id}`);
    setDetalle({ ...detalle, [id]: d });
  };

  const crear = async () => {
    setError(""); setOk(""); setTrabajando(true);
    try {
      const c = await api("/creditos", {
        method: "POST",
        body: { socio_id: +form.socio_id, monto: +form.monto,
                plazo_meses: +form.plazo_meses, destino: form.destino, garante: form.garante },
      });
      setOk(`Crédito de ${usd(c.monto)} entregado a ${c.socio_nombres}. Cuota mensual: ${usd(c.cuotas[0].total)}.`);
      setMostrarForm(false);
      setForm({ socio_id: "", monto: "", plazo_meses: "6", destino: "", garante: "" });
      cargar();
    } catch (e) { setError(e.message); }
    finally { setTrabajando(false); }
  };

  const pagar = async (cuotaId, creditoId) => {
    setError(""); setTrabajando(true);
    try {
      const d = await api(`/creditos/cuotas/${cuotaId}/pagar`, { method: "POST", body: {} });
      setDetalle((prev) => ({ ...prev, [creditoId]: d }));
      api("/creditos").then(setCreditos);
    } catch (e) { setError(e.message); }
    finally { setTrabajando(false); }
  };

  const abonar = async (cuotaId, monto, creditoId) => {
    setError(""); setTrabajando(true);
    try {
      const d = await api(`/creditos/cuotas/${cuotaId}/abonar`,
        { method: "POST", body: { monto } });
      setDetalle((prev) => ({ ...prev, [creditoId]: d }));
      api("/creditos").then(setCreditos);
    } catch (e) { setError(e.message); }
    finally { setTrabajando(false); }
  };

  if (!creditos) return <div className="vacio">Cargando…</div>;

  return (
    <>
      <div className="seccion-titulo">
        <h2>Créditos</h2>
        <button className="boton mini" onClick={() => setMostrarForm(!mostrarForm)}>
          {mostrarForm ? "Cancelar" : "+ Nuevo crédito"}
        </button>
      </div>
      {error && <div className="error">{error}</div>}
      {ok && <div className="exito">{ok}</div>}

      <SolicitudesCredito onCambio={cargar} />
      <Recordatorios />

      {mostrarForm && (
        <div className="tarjeta">
          <h3>Entregar crédito</h3>
          <div className="campo">
            <label htmlFor="cs">Socio</label>
            <select id="cs" value={form.socio_id}
              onChange={(e) => setForm({ ...form, socio_id: e.target.value })}>
              <option value="">Elige un socio…</option>
              {socios.map((s) => <option key={s.id} value={s.id}>{s.nombres}</option>)}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="cm">Monto (USD)</label>
            <input id="cm" inputMode="decimal" value={form.monto} placeholder="500.00"
              onChange={(e) => setForm({ ...form, monto: e.target.value })} />
          </div>
          <div className="campo">
            <label htmlFor="cp">Plazo (meses)</label>
            <input id="cp" inputMode="numeric" value={form.plazo_meses}
              onChange={(e) => setForm({ ...form, plazo_meses: e.target.value })} />
          </div>
          <div className="campo">
            <label htmlFor="cd">Destino del crédito</label>
            <input id="cd" value={form.destino} placeholder="Semillas, negocio, emergencia…"
              onChange={(e) => setForm({ ...form, destino: e.target.value })} />
          </div>
          <div className="campo">
            <label htmlFor="cg">Garante / aval (opcional)</label>
            <input id="cg" value={form.garante} placeholder="Nombre del garante"
              onChange={(e) => setForm({ ...form, garante: e.target.value })} />
          </div>
          <p className="detalle" style={{ fontSize: 13, color: "var(--tinta-suave)" }}>
            Se aplica la tasa de la caja y se genera la tabla de cuotas automáticamente.
          </p>
          <button className="boton" onClick={crear}
            disabled={trabajando || !form.socio_id || !(+form.monto > 0) || !(+form.plazo_meses > 0)}>
            {trabajando ? "Generando…" : "Entregar crédito"}
          </button>
        </div>
      )}

      <div className="tarjeta">
        {creditos.length === 0 && <div className="vacio">No hay créditos todavía.</div>}
        {creditos.map((c) => (
          <div key={c.id} style={{ borderBottom: "1px dashed var(--regla)", padding: "4px 0" }}>
            <div className="fila" style={{ borderBottom: "none" }}>
              <div>
                <div className="principal">
                  {c.socio_nombres}{" "}
                  {c.estado === "pagado" ? <span className="pill ok">pagado</span>
                    : c.en_mora ? <span className="pill mora">en mora</span>
                    : <span className="pill neutro">al día</span>}
                </div>
                <div className="detalle">
                  {usd(c.monto)} · {c.plazo_meses} meses al {c.tasa_mensual}% · {c.destino || "sin destino"}{c.garante ? ` · garante: ${c.garante}` : ""}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="cifra">{usd(c.saldo_capital)}</div>
                <div className="detalle">{c.cuotas_pagadas}/{c.plazo_meses} cuotas</div>
              </div>
            </div>
            <details onToggle={(e) => e.target.open && !detalle[c.id] && abrir(c.id)}>
              <summary>Ver tabla de cuotas</summary>
              {detalle[c.id]
                ? <TablaCuotas credito={detalle[c.id]} pagando={trabajando}
                    onPagar={(cuotaId) => pagar(cuotaId, c.id)}
                    onAbonar={(cuotaId, monto) => abonar(cuotaId, monto, c.id)} />
                : <div className="vacio">Cargando cuotas…</div>}
            </details>
          </div>
        ))}
      </div>
    </>
  );
}
