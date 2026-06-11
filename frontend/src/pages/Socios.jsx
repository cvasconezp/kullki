import { useEffect, useState } from "react";
import { api, usd } from "../lib/api.js";

export default function Socios() {
  const [socios, setSocios] = useState(null);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [form, setForm] = useState({ nombres: "", cedula: "", telefono: "" });
  const [creando, setCreando] = useState(false);
  const [mostrarForm, setMostrarForm] = useState(false);

  const cargar = () => api("/socios").then(setSocios).catch((e) => setError(e.message));
  useEffect(() => { cargar(); }, []);

  const crear = async () => {
    setError(""); setOk(""); setCreando(true);
    try {
      const s = await api("/socios", { method: "POST", body: form });
      setOk(`${s.nombres} registrado. Su acceso inicial es su cédula como usuario y contraseña.`);
      setForm({ nombres: "", cedula: "", telefono: "" });
      setMostrarForm(false);
      cargar();
    } catch (e) { setError(e.message); }
    finally { setCreando(false); }
  };

  if (!socios) return <div className="vacio">Cargando…</div>;

  return (
    <>
      <div className="seccion-titulo">
        <h2>Socios</h2>
        <button className="boton mini" onClick={() => setMostrarForm(!mostrarForm)}>
          {mostrarForm ? "Cancelar" : "+ Nuevo socio"}
        </button>
      </div>
      {error && <div className="error">{error}</div>}
      {ok && <div className="exito">{ok}</div>}

      {mostrarForm && (
        <div className="tarjeta">
          <h3>Registrar socio</h3>
          <div className="campo">
            <label htmlFor="sn">Nombres completos</label>
            <input id="sn" value={form.nombres}
              onChange={(e) => setForm({ ...form, nombres: e.target.value })} />
          </div>
          <div className="campo">
            <label htmlFor="sc">Cédula</label>
            <input id="sc" inputMode="numeric" value={form.cedula}
              onChange={(e) => setForm({ ...form, cedula: e.target.value.trim() })} />
          </div>
          <div className="campo">
            <label htmlFor="st">Teléfono (opcional)</label>
            <input id="st" inputMode="tel" value={form.telefono}
              onChange={(e) => setForm({ ...form, telefono: e.target.value.trim() })} />
          </div>
          <button className="boton" onClick={crear}
            disabled={creando || !form.nombres || !form.cedula}>
            {creando ? "Guardando…" : "Guardar socio"}
          </button>
        </div>
      )}

      <div className="tarjeta">
        <div className="fila encabezado">
          <span>Socio</span><span>Aportes / Debe</span>
        </div>
        {socios.length === 0 && <div className="vacio">Aún no hay socios. Registra el primero.</div>}
        {socios.map((s) => (
          <div className="fila" key={s.id}>
            <div>
              <div className="principal">{s.nombres} {!s.activo && <span className="pill neutro">inactivo</span>}</div>
              <div className="detalle">CI {s.cedula}{s.telefono ? ` · ${s.telefono}` : ""}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div className="cifra pos">{usd(s.total_aportes)}</div>
              {s.saldo_credito > 0 && <div className="cifra neg" style={{ fontSize: 13 }}>debe {usd(s.saldo_credito)}</div>}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
