import { useEffect, useState } from "react";
import { api } from "../lib/api.js";

const FORM_INICIAL = {
  nombre: "", slug: "", comunidad: "",
  tasa_interes_mensual: "1.5", aporte_ordinario: "10",
  tesorero_nombre: "", tesorero_cedula: "", tesorero_password: "",
};

export default function Cajas() {
  const [cajas, setCajas] = useState(null);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [form, setForm] = useState(FORM_INICIAL);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [creando, setCreando] = useState(false);

  const cargar = () => api("/cajas").then(setCajas).catch((e) => setError(e.message));
  useEffect(() => { cargar(); }, []);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const crear = async () => {
    setError(""); setOk(""); setCreando(true);
    try {
      const c = await api("/cajas", {
        method: "POST",
        body: { ...form,
          tasa_interes_mensual: +form.tasa_interes_mensual,
          aporte_ordinario: +form.aporte_ordinario },
      });
      setOk(`Caja "${c.nombre}" creada. El tesorero ya puede entrar con su cédula.`);
      setForm(FORM_INICIAL);
      setMostrarForm(false);
      cargar();
    } catch (e) { setError(e.message); }
    finally { setCreando(false); }
  };

  if (!cajas) return <div className="vacio">Cargando…</div>;

  return (
    <>
      <div className="seccion-titulo">
        <h2>Cajas registradas</h2>
        <button className="boton mini" onClick={() => setMostrarForm(!mostrarForm)}>
          {mostrarForm ? "Cancelar" : "+ Nueva caja"}
        </button>
      </div>
      {error && <div className="error">{error}</div>}
      {ok && <div className="exito">{ok}</div>}

      {mostrarForm && (
        <div className="tarjeta">
          <h3>Crear caja de ahorro</h3>
          <div className="campo"><label>Nombre de la caja</label>
            <input value={form.nombre} onChange={set("nombre")} placeholder="Caja de Ahorro San Pedro" /></div>
          <div className="campo"><label>Identificador (slug)</label>
            <input value={form.slug} onChange={set("slug")} placeholder="san-pedro" /></div>
          <div className="campo"><label>Comunidad</label>
            <input value={form.comunidad} onChange={set("comunidad")} placeholder="Cayambe" /></div>
          <div className="campo"><label>Tasa de interés mensual (%)</label>
            <input inputMode="decimal" value={form.tasa_interes_mensual} onChange={set("tasa_interes_mensual")} /></div>
          <div className="campo"><label>Aporte ordinario (USD)</label>
            <input inputMode="decimal" value={form.aporte_ordinario} onChange={set("aporte_ordinario")} /></div>
          <h3 style={{ marginTop: 16 }}>Tesorero de la caja</h3>
          <div className="campo"><label>Nombres</label>
            <input value={form.tesorero_nombre} onChange={set("tesorero_nombre")} /></div>
          <div className="campo"><label>Cédula</label>
            <input inputMode="numeric" value={form.tesorero_cedula} onChange={set("tesorero_cedula")} /></div>
          <div className="campo"><label>Contraseña inicial</label>
            <input value={form.tesorero_password} onChange={set("tesorero_password")} /></div>
          <button className="boton" onClick={crear}
            disabled={creando || !form.nombre || !form.slug || !form.tesorero_nombre
              || !form.tesorero_cedula || form.tesorero_password.length < 6}>
            {creando ? "Creando…" : "Crear caja"}
          </button>
        </div>
      )}

      <div className="tarjeta">
        {cajas.length === 0 && <div className="vacio">No hay cajas todavía. Crea la primera.</div>}
        {cajas.map((c) => (
          <div className="fila" key={c.id}>
            <div>
              <div className="principal">{c.nombre}</div>
              <div className="detalle">{c.comunidad || "—"} · tasa {c.tasa_interes_mensual}% mensual · aporte ${c.aporte_ordinario}</div>
            </div>
            <span className={"pill " + (c.activa ? "ok" : "neutro")}>{c.activa ? "activa" : "inactiva"}</span>
          </div>
        ))}
      </div>
    </>
  );
}
