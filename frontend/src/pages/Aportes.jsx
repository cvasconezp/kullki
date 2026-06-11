import { useEffect, useState } from "react";
import { api, usd, fechaCorta } from "../lib/api.js";

export default function Aportes() {
  const [socios, setSocios] = useState([]);
  const [aportes, setAportes] = useState(null);
  const [retiros, setRetiros] = useState([]);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [modo, setModo] = useState("aporte");  // aporte | retiro
  const [form, setForm] = useState({ socio_id: "", monto: "", tipo: "ordinario", nota: "" });
  const [guardando, setGuardando] = useState(false);

  const cargar = () => {
    api("/socios").then((s) => setSocios(s.filter((x) => x.activo))).catch((e) => setError(e.message));
    api("/aportes?limit=40").then(setAportes).catch((e) => setError(e.message));
    api("/retiros?limit=40").then(setRetiros).catch(() => {});
  };
  useEffect(() => { cargar(); }, []);

  const registrar = async () => {
    setError(""); setOk(""); setGuardando(true);
    try {
      if (modo === "aporte") {
        const a = await api("/aportes", {
          method: "POST",
          body: { ...form, socio_id: +form.socio_id, monto: +form.monto },
        });
        setOk(`Aporte de ${usd(a.monto)} de ${a.socio_nombres} registrado.`);
      } else {
        const r = await api("/retiros", {
          method: "POST",
          body: { socio_id: +form.socio_id, monto: +form.monto, nota: form.nota },
        });
        setOk(`Retiro de ${usd(r.monto)} de ${r.socio_nombres} registrado.`);
      }
      setForm({ ...form, monto: "", nota: "" });
      cargar();
    } catch (e) { setError(e.message); }
    finally { setGuardando(false); }
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
          <button role="tab" aria-selected={modo === "aporte"}
            className={modo === "aporte" ? "seg activo" : "seg"}
            onClick={() => setModo("aporte")}>Aporte</button>
          <button role="tab" aria-selected={modo === "retiro"}
            className={modo === "retiro" ? "seg activo" : "seg"}
            onClick={() => setModo("retiro")}>Retiro</button>
        </div>
        <h3>{modo === "aporte" ? "Registrar aporte" : "Registrar retiro de ahorro"}</h3>
        <div className="campo">
          <label htmlFor="as">Socio</label>
          <select id="as" value={form.socio_id}
            onChange={(e) => setForm({ ...form, socio_id: e.target.value })}>
            <option value="">Elige un socio…</option>
            {socios.map((s) => <option key={s.id} value={s.id}>{s.nombres}</option>)}
          </select>
        </div>
        <div className="campo">
          <label htmlFor="am">Monto (USD)</label>
          <input id="am" inputMode="decimal" value={form.monto} placeholder="10.00"
            onChange={(e) => setForm({ ...form, monto: e.target.value })} />
        </div>
        {modo === "aporte" ? (
          <div className="campo">
            <label htmlFor="at">Tipo</label>
            <select id="at" value={form.tipo}
              onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
              <option value="ordinario">Ordinario</option>
              <option value="extraordinario">Extraordinario</option>
              <option value="multa">Multa (va al fondo, no al ahorro)</option>
            </select>
          </div>
        ) : (
          <div className="campo">
            <label htmlFor="an">Nota (opcional)</label>
            <input id="an" value={form.nota} placeholder="Motivo del retiro"
              onChange={(e) => setForm({ ...form, nota: e.target.value })} />
          </div>
        )}
        <button className="boton" onClick={registrar}
          style={modo === "retiro" ? { background: "var(--cochinilla)" } : {}}
          disabled={guardando || !form.socio_id || !(+form.monto > 0)}>
          {guardando ? "Registrando…" : modo === "aporte" ? "Registrar aporte" : "Registrar retiro"}
        </button>
      </div>

      <div className="tarjeta">
        <h3>Movimientos recientes</h3>
        {!aportes && <div className="vacio">Cargando…</div>}
        {aportes && movimientos.length === 0 && <div className="vacio">Todavía no hay movimientos.</div>}
        {aportes && movimientos.map((m) => (
          <div className="fila" key={m._t + m.id}>
            <div>
              <div className="principal">{m.socio_nombres}</div>
              <div className="detalle">{fechaCorta(m.fecha)} · {m.tipo}{m.nota ? ` · ${m.nota}` : ""}</div>
            </div>
            <div className={"cifra " + (m._t === "retiro" ? "neg" : "pos")}>
              {m._t === "retiro" ? "−" : ""}{usd(m.monto)}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
