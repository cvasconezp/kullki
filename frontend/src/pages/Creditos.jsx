import { useEffect, useState } from "react";
import { api, usd, fechaCorta } from "../lib/api.js";

function TablaCuotas({ credito, onPagar, pagando }) {
  return (
    <div>
      {credito.cuotas.map((c) => (
        <div className="cuota-pagar" key={c.id}>
          <div>
            <div className="principal" style={{ fontSize: 14 }}>
              Cuota {c.numero} · <span className="cifra">{usd(c.total)}</span>
            </div>
            <div className="detalle">
              capital {usd(c.capital)} + interés {usd(c.interes)} · vence {fechaCorta(c.fecha_vencimiento)}
            </div>
          </div>
          {c.pagada ? (
            <span className="pill ok">pagada {fechaCorta(c.fecha_pago)}</span>
          ) : new Date(c.fecha_vencimiento) < new Date() ? (
            <button className="boton mini" style={{ background: "var(--cochinilla)" }}
              disabled={pagando} onClick={() => onPagar(c.id)}>Cobrar (vencida)</button>
          ) : (
            <button className="boton mini secundario" disabled={pagando}
              onClick={() => onPagar(c.id)}>Cobrar</button>
          )}
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
  const [form, setForm] = useState({ socio_id: "", monto: "", plazo_meses: "6", destino: "" });
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
                plazo_meses: +form.plazo_meses, destino: form.destino },
      });
      setOk(`Crédito de ${usd(c.monto)} entregado a ${c.socio_nombres}. Cuota mensual: ${usd(c.cuotas[0].total)}.`);
      setMostrarForm(false);
      setForm({ socio_id: "", monto: "", plazo_meses: "6", destino: "" });
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
                  {usd(c.monto)} · {c.plazo_meses} meses al {c.tasa_mensual}% · {c.destino || "sin destino"}
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
                    onPagar={(cuotaId) => pagar(cuotaId, c.id)} />
                : <div className="vacio">Cargando cuotas…</div>}
            </details>
          </div>
        ))}
      </div>
    </>
  );
}
