import { useEffect, useState } from "react";
import { api, mascaraCedula } from "../lib/api.js";

const FORM_INICIAL = {
  nombre: "", slug: "", comunidad: "",
  tasa_interes_mensual: "1.5", aporte_ordinario: "10", multa_mora: "0",
  color_primario: "#1B3A6B", color_acento: "#E8A838", logo: "", transparencia_total: false,
  tesorero_nombre: "", tesorero_cedula: "", tesorero_password: "",
};

function CampoColor({ label, value, onChange }) {
  return (
    <div className="campo">
      <label>{label}</label>
      <div className="color-row">
        <input type="color" value={value} onChange={onChange} />
        <input value={value} onChange={onChange} />
      </div>
    </div>
  );
}

/* ----- Editar una caja existente ----- */
function EditarCaja({ caja, onListo }) {
  const [f, setF] = useState({
    nombre: caja.nombre, comunidad: caja.comunidad || "",
    tasa_interes_mensual: String(caja.tasa_interes_mensual),
    aporte_ordinario: String(caja.aporte_ordinario),
    multa_mora: String(caja.multa_mora ?? 0),
    color_primario: caja.color_primario || "#1B3A6B",
    color_acento: caja.color_acento || "#E8A838",
    logo: caja.logo || "", transparencia_total: !!caja.transparencia_total, activa: caja.activa,
  });
  const [error, setError] = useState(""); const [guardando, setGuardando] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const guardar = async () => {
    setError(""); setGuardando(true);
    try {
      await api(`/cajas/${caja.id}`, { method: "PATCH", body: {
        nombre: f.nombre, comunidad: f.comunidad,
        tasa_interes_mensual: +f.tasa_interes_mensual,
        aporte_ordinario: +f.aporte_ordinario, multa_mora: +f.multa_mora,
        color_primario: f.color_primario, color_acento: f.color_acento,
        logo: f.logo, transparencia_total: f.transparencia_total, activa: f.activa,
      }});
      onListo(true);
    } catch (e) { setError(e.message); setGuardando(false); }
  };

  return (
    <div className="expediente">
      {error && <div className="error">{error}</div>}
      <div className="campo"><label>Nombre</label><input value={f.nombre} onChange={set("nombre")} /></div>
      <div className="campo"><label>Comunidad</label><input value={f.comunidad} onChange={set("comunidad")} /></div>
      <div className="dos-col">
        <div className="campo"><label>Tasa % mensual</label>
          <input inputMode="decimal" value={f.tasa_interes_mensual} onChange={set("tasa_interes_mensual")} /></div>
        <div className="campo"><label>Aporte ordinario</label>
          <input inputMode="decimal" value={f.aporte_ordinario} onChange={set("aporte_ordinario")} /></div>
      </div>
      <div className="dos-col">
        <div className="campo"><label>Multa por mora (USD)</label>
          <input inputMode="decimal" value={f.multa_mora} onChange={set("multa_mora")} /></div>
        <div className="campo"><label>Logo (emoji o letra)</label>
          <input maxLength={4} value={f.logo} onChange={set("logo")} placeholder="🌾" /></div>
      </div>
      <div className="dos-col">
        <CampoColor label="Color primario" value={f.color_primario} onChange={set("color_primario")} />
        <CampoColor label="Color de acento" value={f.color_acento} onChange={set("color_acento")} />
      </div>
      <div className="campo">
        <label>Bitácora para socios</label>
        <select value={f.transparencia_total ? "1" : "0"}
          onChange={(e) => setF({ ...f, transparencia_total: e.target.value === "1" })}>
          <option value="0">Privada — cada socio ve solo lo suyo (recomendado)</option>
          <option value="1">Transparencia total — todos ven todo (modo asamblea)</option>
        </select>
      </div>
      <div className="campo">
        <label>Estado</label>
        <select value={f.activa ? "1" : "0"} onChange={(e) => setF({ ...f, activa: e.target.value === "1" })}>
          <option value="1">Activa</option><option value="0">Inactiva</option>
        </select>
      </div>
      <div className="dos-col">
        <button className="boton secundario" onClick={() => onListo(false)}>Cancelar</button>
        <button className="boton" onClick={guardar} disabled={guardando || !f.nombre}>
          {guardando ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </div>
  );
}

/* ----- Entrar como socio: elegir socio ----- */
function ElegirSocio({ caja, onElegir, onCancel }) {
  const [socios, setSocios] = useState(null); const [error, setError] = useState("");
  useEffect(() => {
    api(`/socios?caja_id=${caja.id}`).then(setSocios).catch((e) => setError(e.message));
  }, [caja.id]);
  if (error) return <div className="error">{error}</div>;
  if (!socios) return <div className="vacio">Cargando socios…</div>;
  if (!socios.length) return <div className="expediente"><div className="vacio">Esta caja no tiene socios.</div>
    <button className="boton secundario" onClick={onCancel}>Cerrar</button></div>;
  return (
    <div className="expediente">
      <h4>Ver la libreta de…</h4>
      {socios.map((s) => (
        <button key={s.id} className="selector-caja" onClick={() => onElegir(s.id)}>
          <div><div className="nombre">{s.nombres}</div><div className="meta">CI {mascaraCedula(s.cedula)}</div></div>
          <span className="chevron">›</span>
        </button>
      ))}
      <button className="boton secundario" style={{ marginTop: 10 }} onClick={onCancel}>Cancelar</button>
    </div>
  );
}

function AgregarDirectiva({ caja, onListo }) {
  const [f, setF] = useState({ nombre: "", cedula: "", password: "" });
  const [error, setError] = useState(""); const [ok, setOk] = useState(""); const [g, setG] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const guardar = async () => {
    setError(""); setOk(""); setG(true);
    try {
      await api(`/cajas/${caja.id}/directiva`, { method: "POST", body: f });
      setOk(`${f.nombre} agregado/a a la directiva (acceso de solo lectura).`);
      setF({ nombre: "", cedula: "", password: "" });
    } catch (e) { setError(e.message); }
    finally { setG(false); }
  };
  return (
    <div className="expediente">
      <h4>Agregar directiva (solo lectura)</h4>
      {error && <div className="error">{error}</div>}
      {ok && <div className="exito">{ok}</div>}
      <div className="campo"><label>Nombres</label><input value={f.nombre} onChange={set("nombre")} /></div>
      <div className="dos-col">
        <div className="campo"><label>Cédula</label><input inputMode="numeric" value={f.cedula} onChange={set("cedula")} /></div>
        <div className="campo"><label>Contraseña inicial</label><input value={f.password} onChange={set("password")} /></div>
      </div>
      <div className="dos-col">
        <button className="boton secundario" onClick={onListo}>Cerrar</button>
        <button className="boton" onClick={guardar} disabled={g || !f.nombre || !f.cedula || f.password.length < 6}>
          {g ? "Guardando…" : "Agregar directiva"}</button>
      </div>
    </div>
  );
}

export default function Cajas({ onAsumir }) {
  const [cajas, setCajas] = useState(null);
  const [error, setError] = useState(""); const [ok, setOk] = useState("");
  const [form, setForm] = useState(FORM_INICIAL);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [creando, setCreando] = useState(false);
  const [editando, setEditando] = useState(null);   // caja.id en edición
  const [eligiendo, setEligiendo] = useState(null); // caja.id para "ver como socio"
  const [dirigiendo, setDirigiendo] = useState(null); // caja.id para alta de directiva

  const cargar = () => api("/cajas").then(setCajas).catch((e) => setError(e.message));
  useEffect(() => { cargar(); }, []);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const crear = async () => {
    setError(""); setOk(""); setCreando(true);
    try {
      const c = await api("/cajas", { method: "POST", body: {
        ...form,
        tasa_interes_mensual: +form.tasa_interes_mensual,
        aporte_ordinario: +form.aporte_ordinario, multa_mora: +form.multa_mora,
      }});
      setOk(`Caja "${c.nombre}" creada. El tesorero ya puede entrar con su cédula.`);
      setForm(FORM_INICIAL); setMostrarForm(false); cargar();
    } catch (e) { setError(e.message); }
    finally { setCreando(false); }
  };

  const asumir = async (caja, rol, socio_id = null) => {
    setError("");
    try {
      const s = await api("/auth/asumir-caja", { method: "POST",
        body: { caja_id: caja.id, rol, socio_id } });
      onAsumir(s);
    } catch (e) { setError(e.message); }
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
          <div className="dos-col">
            <div className="campo"><label>Identificador (slug)</label>
              <input value={form.slug} onChange={set("slug")} placeholder="san-pedro" /></div>
            <div className="campo"><label>Comunidad</label>
              <input value={form.comunidad} onChange={set("comunidad")} placeholder="Cayambe" /></div>
          </div>
          <div className="dos-col">
            <div className="campo"><label>Tasa de interés mensual (%)</label>
              <input inputMode="decimal" value={form.tasa_interes_mensual} onChange={set("tasa_interes_mensual")} /></div>
            <div className="campo"><label>Aporte ordinario (USD)</label>
              <input inputMode="decimal" value={form.aporte_ordinario} onChange={set("aporte_ordinario")} /></div>
          </div>
          <div className="dos-col">
            <div className="campo"><label>Multa por mora (USD)</label>
              <input inputMode="decimal" value={form.multa_mora} onChange={set("multa_mora")} /></div>
            <div className="campo"><label>Logo (emoji o letra)</label>
              <input maxLength={4} value={form.logo} onChange={set("logo")} placeholder="🌾" /></div>
          </div>
          <div className="dos-col">
            <CampoColor label="Color primario" value={form.color_primario} onChange={set("color_primario")} />
            <CampoColor label="Color de acento" value={form.color_acento} onChange={set("color_acento")} />
          </div>
          <div className="campo"><label>Bitácora para socios</label>
            <select value={form.transparencia_total ? "1" : "0"}
              onChange={(e) => setForm({ ...form, transparencia_total: e.target.value === "1" })}>
              <option value="0">Privada — cada socio ve solo lo suyo (recomendado)</option>
              <option value="1">Transparencia total — todos ven todo (modo asamblea)</option>
            </select></div>
          <div className="vista-previa" style={{ background: form.color_primario }}>
            <span className="vp-logo" style={{ color: form.color_acento }}>{form.logo || (form.nombre[0] || "K").toUpperCase()}</span>
            <span className="vp-txt">{form.nombre || "Nombre de la caja"}</span>
          </div>
          <h3 style={{ marginTop: 16 }}>Tesorero de la caja</h3>
          <div className="campo"><label>Nombres</label>
            <input value={form.tesorero_nombre} onChange={set("tesorero_nombre")} /></div>
          <div className="dos-col">
            <div className="campo"><label>Cédula</label>
              <input inputMode="numeric" value={form.tesorero_cedula} onChange={set("tesorero_cedula")} /></div>
            <div className="campo"><label>Contraseña inicial</label>
              <input value={form.tesorero_password} onChange={set("tesorero_password")} /></div>
          </div>
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
          <div key={c.id}>
            <div className="fila">
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span className="caja-logo sm" style={{ background: c.color_primario, color: c.color_acento }}>
                  {c.logo || c.nombre[0]?.toUpperCase()}
                </span>
                <div>
                  <div className="principal">{c.nombre}</div>
                  <div className="detalle">{c.comunidad || "—"} · /{c.slug} · tasa {c.tasa_interes_mensual}% · aporte ${c.aporte_ordinario}</div>
                </div>
              </div>
              <span className={"pill " + (c.activa ? "ok" : "neutro")}>{c.activa ? "activa" : "inactiva"}</span>
            </div>
            <div className="acciones-caja">
              <button onClick={() => asumir(c, "tesorero")}>Entrar como tesorero</button>
              <button onClick={() => { setEligiendo(eligiendo === c.id ? null : c.id); setEditando(null); }}>
                Ver como socio
              </button>
              <button onClick={() => { setEditando(editando === c.id ? null : c.id); setEligiendo(null); setDirigiendo(null); }}>
                {editando === c.id ? "Cerrar" : "Editar"}
              </button>
              <button onClick={() => { setDirigiendo(dirigiendo === c.id ? null : c.id); setEditando(null); setEligiendo(null); }}>
                {dirigiendo === c.id ? "Cerrar" : "+ Directiva"}
              </button>
            </div>
            {editando === c.id && (
              <EditarCaja caja={c} onListo={(guardo) => { setEditando(null); if (guardo) cargar(); }} />
            )}
            {eligiendo === c.id && (
              <ElegirSocio caja={c} onCancel={() => setEligiendo(null)}
                onElegir={(sid) => asumir(c, "socio", sid)} />
            )}
            {dirigiendo === c.id && (
              <AgregarDirectiva caja={c} onListo={() => setDirigiendo(null)} />
            )}
          </div>
        ))}
      </div>
    </>
  );
}
