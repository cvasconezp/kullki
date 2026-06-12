import { useEffect, useState } from "react";
import { api, usd, fechaCorta, getSesion } from "../lib/api.js";

export default function Aportes() {
  const [socios, setSocios] = useState([]);
  const [aportes, setAportes] = useState(null);
  const [retiros, setRetiros] = useState([]);
  const [error, setError] = useState(""); const [ok, setOk] = useState("");
  const [modo, setModo] = useState("aporte");
  const [form, setForm] = useState({ socio_id: "", monto: "", tipo: "ordinario", nota: "" });
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
      } else {
        const r = await api("/retiros", { method: "POST", body: { socio_id: +form.socio_id, monto: +form.monto, nota: form.nota } });
        setOk(`Retiro de ${usd(r.monto)} de ${r.socio_nombres} registrado.`);
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
        {permiteRetiros && (
          <div className="segmentos" role="tablist">
            <button role="tab" className={modo === "aporte" ? "seg activo" : "seg"} onClick={() => setModo("aporte")}>Aporte</button>
            <button role="tab" className={modo === "retiro" ? "seg activo" : "seg"} onClick={() => setModo("retiro")}>Retiro</button>
          </div>
        )}
        <h3>{modo === "aporte" ? "Registrar aporte" : "Registrar retiro de ahorro"}</h3>
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
