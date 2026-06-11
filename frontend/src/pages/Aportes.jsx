import { useEffect, useState } from "react";
import { api, usd, fechaCorta } from "../lib/api.js";

export default function Aportes() {
  const [socios, setSocios] = useState([]);
  const [aportes, setAportes] = useState(null);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [form, setForm] = useState({ socio_id: "", monto: "", tipo: "ordinario", nota: "" });
  const [guardando, setGuardando] = useState(false);

  const cargar = () => {
    api("/socios").then((s) => setSocios(s.filter((x) => x.activo))).catch((e) => setError(e.message));
    api("/aportes?limit=40").then(setAportes).catch((e) => setError(e.message));
  };
  useEffect(() => { cargar(); }, []);

  const registrar = async () => {
    setError(""); setOk(""); setGuardando(true);
    try {
      const a = await api("/aportes", {
        method: "POST",
        body: { ...form, socio_id: +form.socio_id, monto: +form.monto },
      });
      setOk(`Aporte de ${usd(a.monto)} de ${a.socio_nombres} registrado.`);
      setForm({ ...form, monto: "", nota: "" });
      cargar();
    } catch (e) { setError(e.message); }
    finally { setGuardando(false); }
  };

  return (
    <>
      <div className="seccion-titulo"><h2>Aportes</h2></div>
      {error && <div className="error">{error}</div>}
      {ok && <div className="exito">{ok}</div>}

      <div className="tarjeta">
        <h3>Registrar aporte</h3>
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
        <div className="campo">
          <label htmlFor="at">Tipo</label>
          <select id="at" value={form.tipo}
            onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
            <option value="ordinario">Ordinario</option>
            <option value="extraordinario">Extraordinario</option>
            <option value="multa">Multa</option>
          </select>
        </div>
        <button className="boton" onClick={registrar}
          disabled={guardando || !form.socio_id || !(+form.monto > 0)}>
          {guardando ? "Registrando…" : "Registrar aporte"}
        </button>
      </div>

      <div className="tarjeta">
        <h3>Movimientos recientes</h3>
        {!aportes && <div className="vacio">Cargando…</div>}
        {aportes && aportes.length === 0 && <div className="vacio">Todavía no hay aportes registrados.</div>}
        {aportes && aportes.map((a) => (
          <div className="fila" key={a.id}>
            <div>
              <div className="principal">{a.socio_nombres}</div>
              <div className="detalle">{fechaCorta(a.fecha)} · {a.tipo}{a.nota ? ` · ${a.nota}` : ""}</div>
            </div>
            <div className="cifra pos">{usd(a.monto)}</div>
          </div>
        ))}
      </div>
    </>
  );
}
