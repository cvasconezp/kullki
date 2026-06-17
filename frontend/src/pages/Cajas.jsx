import { useEffect, useRef, useState } from "react";
import { api, mascaraCedula } from "../lib/api.js";

const FORM_INICIAL = {
  nombre: "", slug: "", comunidad: "",
  tasa_interes_mensual: "1.5", aporte_ordinario: "10", multa_mora: "0", credito_max: "0", encaje_factor: "0", credito_emergente_max: "0", credito_emergente_plazo: "0",
  permite_retiros: true, dia_corte: "0", multa_atraso: "0",
  permite_eco_ahorro: false, permite_mascotas: false, permite_inversiones: false, permite_credito_educativo: false,
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
    credito_max: String(caja.credito_max ?? 0), encaje_factor: String(caja.encaje_factor ?? 0),
    credito_emergente_max: String(caja.credito_emergente_max ?? 0), credito_emergente_plazo: String(caja.credito_emergente_plazo ?? 0),
    permite_retiros: caja.permite_retiros !== false, dia_corte: String(caja.dia_corte ?? 0), multa_atraso: String(caja.multa_atraso ?? 0),
    color_primario: caja.color_primario || "#1B3A6B",
    color_acento: caja.color_acento || "#E8A838",
    logo: caja.logo || "", transparencia_total: !!caja.transparencia_total, activa: caja.activa,
    permite_eco_ahorro: !!caja.permite_eco_ahorro, permite_mascotas: !!caja.permite_mascotas,
    permite_inversiones: !!caja.permite_inversiones, permite_credito_educativo: !!caja.permite_credito_educativo,
  });
  const [error, setError] = useState(""); const [guardando, setGuardando] = useState(false);
  const [logoUrl, setLogoUrl] = useState(caja.logo_url || "");
  const [subiendoLogo, setSubiendoLogo] = useState(false);
  const logoRef = useRef(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const subirLogo = async (e) => {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    setSubiendoLogo(true);
    const base = import.meta.env.VITE_API_URL || "http://localhost:8000";
    const token = JSON.parse(sessionStorage.getItem("kullki_sesion"))?.access_token
      || JSON.parse(sessionStorage.getItem("kullki_admin"))?.access_token;
    const form = new FormData();
    form.append("archivo", archivo);
    try {
      const res = await fetch(`${base}/cajas/${caja.id}/logo`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || `Error ${res.status}`);
      // Reload logo preview from the caja endpoint
      const updated = await api(`/cajas`);
      const c = updated.find(x => x.id === caja.id);
      if (c) setLogoUrl(c.logo_url || "");
    } catch (err) { setError(err.message); }
    finally { setSubiendoLogo(false); if (logoRef.current) logoRef.current.value = ""; }
  };

  const borrarLogo = async () => {
    try {
      await api(`/cajas/${caja.id}/logo`, { method: "DELETE" });
      setLogoUrl("");
    } catch (err) { setError(err.message); }
  };

  const guardar = async (intento = 1) => {
    setError(""); setGuardando(true);
    const body = {
      nombre: f.nombre, comunidad: f.comunidad,
      tasa_interes_mensual: +f.tasa_interes_mensual,
      aporte_ordinario: +f.aporte_ordinario, multa_mora: +f.multa_mora,
      credito_max: +f.credito_max, encaje_factor: +f.encaje_factor,
      credito_emergente_max: +f.credito_emergente_max, credito_emergente_plazo: +f.credito_emergente_plazo,
      permite_retiros: f.permite_retiros, dia_corte: +f.dia_corte, multa_atraso: +f.multa_atraso,
      color_primario: f.color_primario, color_acento: f.color_acento,
      logo: f.logo, transparencia_total: f.transparencia_total, activa: f.activa,
      permite_eco_ahorro: f.permite_eco_ahorro, permite_mascotas: f.permite_mascotas,
      permite_inversiones: f.permite_inversiones, permite_credito_educativo: f.permite_credito_educativo,
    };
    try {
      await api(`/cajas/${caja.id}`, { method: "PATCH", body });
      onListo(true);
    } catch (e) {
      const esRed = e.message === "Failed to fetch" || e.message.includes("NetworkError");
      if (esRed && intento < 3) {
        // Reintento automático (backend arrancando en Railway)
        setError(`Conectando con el servidor… (intento ${intento}/3)`);
        await new Promise(r => setTimeout(r, 4000));
        return guardar(intento + 1);
      }
      setError(esRed
        ? "No se pudo conectar con el servidor. Espera unos segundos y vuelve a intentarlo."
        : e.message);
      setGuardando(false);
    }
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
      <div className="campo">
        <label>Imagen del logo (PNG / JPG / WEBP / SVG · máx 512 KB)</label>
        {logoUrl && (
          <div style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 10 }}>
            <img src={logoUrl} alt="Logo" style={{ height: 56, borderRadius: 8, border: "1px solid var(--regla)", objectFit: "contain" }} />
            <button className="boton mini secundario" style={{ color: "var(--cochinilla)" }} onClick={borrarLogo}>Quitar imagen</button>
          </div>
        )}
        <label className="boton mini" style={{ display: "inline-block", cursor: "pointer", opacity: subiendoLogo ? 0.6 : 1 }}>
          {subiendoLogo ? "Subiendo…" : "📂 Subir imagen"}
          <input ref={logoRef} type="file" accept=".png,.jpg,.jpeg,.webp,.svg" style={{ display: "none" }} disabled={subiendoLogo} onChange={subirLogo} />
        </label>
      </div>
      <div className="dos-col">
        <div className="campo"><label>Crédito ordinario máximo (USD, 0 = sin límite)</label>
          <input inputMode="decimal" value={f.credito_max} onChange={set("credito_max")} /></div>
        <div className="dos-col">
          <div className="campo"><label>Crédito emergente máximo (USD, 0 = usa el ordinario)</label>
            <input inputMode="decimal" value={f.credito_emergente_max} onChange={set("credito_emergente_max")} placeholder="ej. 500" /></div>
          <div className="campo"><label>Plazo máx. emergente (meses, 0 = sin límite)</label>
            <input inputMode="numeric" value={f.credito_emergente_plazo} onChange={set("credito_emergente_plazo")} placeholder="ej. 3" /></div>
        </div>
        <div className="campo"><label>Encaje (crédito ≤ ahorro × factor)</label>
          <input inputMode="decimal" value={f.encaje_factor} onChange={set("encaje_factor")} /></div>
      </div>
      <div className="dos-col">
        <div className="campo"><label>Día de corte del aporte (0 = sin corte)</label>
          <input inputMode="numeric" value={f.dia_corte} onChange={set("dia_corte")} /></div>
        <div className="campo"><label>Multa por aporte atrasado (USD)</label>
          <input inputMode="decimal" value={f.multa_atraso} onChange={set("multa_atraso")} /></div>
      </div>
      <div className="campo"><label>¿Permite retiros de ahorro?</label>
        <select value={f.permite_retiros ? "1" : "0"} onChange={(e) => setF({ ...f, permite_retiros: e.target.value === "1" })}>
          <option value="1">Sí, permite retiros</option><option value="0">No permite retiros</option>
        </select></div>
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
        <label>Servicios opcionales activados en esta caja</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 16px", paddingTop: 4 }}>
          {[["permite_eco_ahorro","🌿 Eco ahorro"],["permite_mascotas","🐾 Mascotas"],["permite_inversiones","📈 Inversiones"],["permite_credito_educativo","🎓 Crédito educativo"]].map(([k,l]) => (
            <label key={k} style={{ display:"flex", alignItems:"center", gap:6, cursor:"pointer" }}>
              <input type="checkbox" checked={!!f[k]} onChange={(e) => setF({ ...f, [k]: e.target.checked })} />
              {l}
            </label>
          ))}
        </div>
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
  const [regenerando, setRegenerando] = useState(false);

  const cargar = () => api("/cajas").then(setCajas).catch((e) => setError(e.message));
  const regenerarDemo = async () => {
    if (!window.confirm("Regenerar la caja demo (Ñukanchik) con datos variados? Solo afecta la caja demo.")) return;
    setError(""); setOk(""); setRegenerando(true);
    try { const r = await api("/admin/reseed-demo", { method: "POST" }); setOk(r.mensaje || "Demo regenerado."); cargar(); }
    catch (e) { setError(e.message); }
    finally { setRegenerando(false); }
  };
  useEffect(() => { cargar(); }, []);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const crear = async () => {
    setError(""); setOk(""); setCreando(true);
    try {
      const c = await api("/cajas", { method: "POST", body: {
        ...form,
        tasa_interes_mensual: +form.tasa_interes_mensual,
        aporte_ordinario: +form.aporte_ordinario, multa_mora: +form.multa_mora,
        credito_max: +form.credito_max, encaje_factor: +form.encaje_factor,
        credito_emergente_max: +form.credito_emergente_max, credito_emergente_plazo: +form.credito_emergente_plazo,
        permite_retiros: form.permite_retiros, dia_corte: +form.dia_corte, multa_atraso: +form.multa_atraso,
        permite_eco_ahorro: form.permite_eco_ahorro, permite_mascotas: form.permite_mascotas,
        permite_inversiones: form.permite_inversiones, permite_credito_educativo: form.permite_credito_educativo,
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
        <div style={{ display: "flex", gap: 8 }}>
          <button className="boton mini secundario" onClick={regenerarDemo} disabled={regenerando}>
            {regenerando ? "Regenerando…" : "↻ Regenerar demo"}
          </button>
          <button className="boton mini" onClick={() => setMostrarForm(!mostrarForm)}>
            {mostrarForm ? "Cancelar" : "+ Nueva caja"}
          </button>
        </div>
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
            <div className="campo"><label>Crédito ordinario máximo (USD, 0 = sin límite)</label>
              <input inputMode="decimal" value={form.credito_max} onChange={set("credito_max")} /></div>
            <div className="dos-col">
              <div className="campo"><label>Crédito emergente máximo (USD)</label>
                <input inputMode="decimal" value={form.credito_emergente_max} onChange={set("credito_emergente_max")} placeholder="ej. 500" /></div>
              <div className="campo"><label>Plazo máx. emergente (meses)</label>
                <input inputMode="numeric" value={form.credito_emergente_plazo} onChange={set("credito_emergente_plazo")} placeholder="ej. 3" /></div>
            </div>
            <div className="campo"><label>Encaje (crédito ≤ ahorro × factor, 0 = sin regla)</label>
              <input inputMode="decimal" value={form.encaje_factor} onChange={set("encaje_factor")} placeholder="ej. 3" /></div>
          </div>
          <div className="dos-col">
            <div className="campo"><label>Día de corte del aporte (0 = sin corte)</label>
              <input inputMode="numeric" value={form.dia_corte} onChange={set("dia_corte")} placeholder="ej. 10" /></div>
            <div className="campo"><label>Multa por aporte atrasado (USD)</label>
              <input inputMode="decimal" value={form.multa_atraso} onChange={set("multa_atraso")} /></div>
          </div>
          <div className="campo"><label>¿La caja permite retiros de ahorro?</label>
            <select value={form.permite_retiros ? "1" : "0"} onChange={(e) => setForm({ ...form, permite_retiros: e.target.value === "1" })}>
              <option value="1">Sí, permite retiros</option><option value="0">No permite retiros</option>
            </select></div>
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
          <div className="campo">
            <label>Servicios opcionales activados en esta caja</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 16px", paddingTop: 4 }}>
              {[["permite_eco_ahorro","🌿 Eco ahorro"],["permite_mascotas","🐾 Mascotas"],["permite_inversiones","📈 Inversiones"],["permite_credito_educativo","🎓 Crédito educativo"]].map(([k,l]) => (
                <label key={k} style={{ display:"flex", alignItems:"center", gap:6, cursor:"pointer" }}>
                  <input type="checkbox" checked={!!form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.checked })} />
                  {l}
                </label>
              ))}
            </div>
          </div>
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
                  {c.logo_url ? <img src={c.logo_url} alt="logo" style={{ width: "100%", height: "100%", objectFit: "contain", borderRadius: 4 }} /> : (c.logo || c.nombre[0]?.toUpperCase())}
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
              <button onClick={() => asumir(c, "directiva")}>Entrar como directiva</button>
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
