import { useEffect, useState } from "react";
import { api, usd, fechaCorta, mascaraCedula, getSesion } from "../lib/api.js";
import ExportarEstado from "../components/ExportarEstado.jsx";

const GENEROS = [["", "—"], ["F", "Femenino"], ["M", "Masculino"], ["Otro", "Otro"], ["NS", "Prefiere no decir"]];
const CIVIL = ["", "Soltero/a", "Casado/a", "Unión libre", "Divorciado/a", "Viudo/a"];
const INSTRUCCION = ["", "Ninguna", "Primaria", "Secundaria", "Superior", "Posgrado"];

const FICHA_EXTRA = [
  ["fecha_nacimiento", "Fecha de nacimiento", "date"],
  ["genero", "Género", "select", GENEROS],
  ["correo", "Correo electrónico", "email"],
  ["whatsapp", "WhatsApp", "tel"],
  ["direccion", "Dirección", "text"],
  ["ocupacion", "Ocupación / lugar de trabajo", "text"],
  ["estado_civil", "Estado civil", "select2", CIVIL],
  ["nivel_instruccion", "Nivel de instrucción", "select2", INSTRUCCION],
  ["num_cargas", "Cargas familiares", "number"],
  ["contacto_emergencia", "Contacto de emergencia (nombre y teléfono)", "text"],
];

function CampoFicha({ def, value, onChange }) {
  const [k, label, tipo, opts] = def;
  return (
    <div className="campo">
      <label>{label}</label>
      {tipo === "select" ? (
        <select value={value || ""} onChange={onChange}>
          {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      ) : tipo === "select2" ? (
        <select value={value || ""} onChange={onChange}>
          {opts.map((v) => <option key={v} value={v}>{v || "—"}</option>)}
        </select>
      ) : (
        <input type={tipo === "number" ? "number" : tipo === "date" ? "date" : "text"}
          inputMode={tipo === "tel" ? "tel" : tipo === "number" ? "numeric" : undefined}
          value={value ?? ""} onChange={onChange} />
      )}
    </div>
  );
}

function EditarFicha({ socio, onListo }) {
  const init = {};
  FICHA_EXTRA.forEach(([k]) => (init[k] = socio[k] ?? ""));
  init.nombres = socio.nombres; init.telefono = socio.telefono || "";
  const [f, setF] = useState(init);
  const [error, setError] = useState(""); const [guardando, setGuardando] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const guardar = async () => {
    setError(""); setGuardando(true);
    try {
      const body = { ...f };
      if (body.num_cargas === "") body.num_cargas = 0; else body.num_cargas = +body.num_cargas;
      if (!body.fecha_nacimiento) delete body.fecha_nacimiento;
      await api(`/socios/${socio.id}`, { method: "PATCH", body });
      onListo(true);
    } catch (e) { setError(e.message); setGuardando(false); }
  };

  return (
    <div className="expediente">
      <h4>Editar ficha</h4>
      {error && <div className="error">{error}</div>}
      <div className="campo"><label>Nombres</label><input value={f.nombres} onChange={set("nombres")} /></div>
      <div className="campo"><label>Teléfono</label><input value={f.telefono} onChange={set("telefono")} /></div>
      <div className="dos-col">
        {FICHA_EXTRA.map((def) => <CampoFicha key={def[0]} def={def} value={f[def[0]]} onChange={set(def[0])} />)}
      </div>
      <div className="dos-col">
        <button className="boton secundario" onClick={() => onListo(false)}>Cancelar</button>
        <button className="boton" onClick={guardar} disabled={guardando}>{guardando ? "Guardando…" : "Guardar ficha"}</button>
      </div>
    </div>
  );
}

function Expediente({ socioId, onCerrar }) {
  const [lib, setLib] = useState(null);
  const [error, setError] = useState("");
  const [editando, setEditando] = useState(false);
  const [sol, setSol] = useState(null);
  const soloLectura = (getSesion() || {}).rol === "directiva";

  const cargar = () => {
    api(`/mi-libreta?socio_id=${socioId}`).then(setLib).catch((e) => setError(e.message));
    if (!soloLectura)
      api("/socios/solicitudes").then((l) => setSol(l.find((x) => x.socio_id === socioId) || null)).catch(() => {});
  };
  useEffect(() => { cargar(); }, [socioId]);
  const resolver = async (accion) => {
    try { await api(`/socios/solicitudes/${sol.id}/${accion}`, { method: "POST" }); setSol(null); cargar(); }
    catch (e) { setError(e.message); }
  };
  const anonimizar = async () => {
    if (!window.confirm("¿Dar de baja y anonimizar a este socio? Se borran sus datos personales y no podrá ingresar. La contabilidad se conserva. Esta acción no se puede deshacer.")) return;
    try { await api(`/socios/${socioId}/anonimizar`, { method: "POST" }); onCerrar(); }
    catch (e) { setError(e.message); }
  };
  const [aviso, setAviso] = useState("");
  const reiniciarClave = async () => {
    if (!window.confirm("¿Reiniciar la contraseña de este socio? Volverá a ser su número de cédula y deberá cambiarla al ingresar.")) return;
    setError(""); setAviso("");
    try { const r = await api("/auth/restablecer/password", { method: "POST", body: { cedula: lib.socio.cedula } });
      setAviso(`Contraseña reiniciada. Clave temporal: ${r.password_temporal} (la cédula). El socio debe cambiarla al ingresar.`); }
    catch (e) { setError(e.message); }
  };
  const reiniciar2FA = async () => {
    if (!window.confirm("¿Restablecer (desactivar) el segundo factor 2FA de este socio? Podrá volver a activarlo desde su perfil.")) return;
    setError(""); setAviso("");
    try { await api("/auth/restablecer/2fa", { method: "POST", body: { cedula: lib.socio.cedula } });
      setAviso("2FA desactivado. El socio puede volver a activarlo desde su perfil."); }
    catch (e) { setError(e.message); }
  };

  if (error) return <div className="error">{error}</div>;
  if (!lib) return <div className="vacio">Cargando expediente…</div>;
  const { socio, aportes, creditos } = lib;

  const dato = (l, v) => v ? <div className="fila"><span className="detalle">{l}</span><span>{v}</span></div> : null;

  return (
    <>
      <button className="volver no-print" onClick={onCerrar}>← Volver a la lista</button>
      <div className="libreta" style={{ marginTop: 8 }}>
        <div className="eyebrow">Expediente · {socio.nombres}</div>
        <div className="saldo"><span className="moneda">$</span>
          {socio.total_aportes.toLocaleString("es-EC", { minimumFractionDigits: 2 })}</div>
        <div className="sub">Aportes desde {fechaCorta(socio.fecha_ingreso)} · CI {mascaraCedula(socio.cedula)}
          {socio.saldo_credito > 0 && <> · debe <strong className="cifra">{usd(socio.saldo_credito)}</strong></>}</div>
      </div>

      {sol && (
        <div className="tarjeta" style={{ borderColor: "var(--sara)" }}>
          <h3>Solicitud de actualización pendiente</h3>
          <div className="detalle" style={{ margin: "0 0 10px" }}>
            El socio pidió cambiar: {Object.entries(sol.campos).map(([k, v]) => `${ETIQ[k] || k}: ${v}`).join(" · ")}
          </div>
          {!soloLectura && (
            <div className="dos-col">
              <button className="boton secundario" onClick={() => resolver("rechazar")}>✗ Rechazar</button>
              <button className="boton" onClick={() => resolver("aprobar")}>✓ Aceptar cambios</button>
            </div>
          )}
        </div>
      )}

      {(() => {
        const aportesBrutos = aportes.filter((a) => a.tipo !== "multa").reduce((t, a) => t + a.monto, 0);
        const totalRetiros = (lib.retiros || []).reduce((t, r) => t + r.monto, 0);
        const interesesPagados = creditos.reduce((t, c) =>
          t + c.cuotas.filter((q) => q.pagada).reduce((u, q) => u + q.interes, 0), 0);
        return (
          <div className="kpis">
            <div className="kpi k-in"><div className="v">{usd(socio.total_aportes)}</div><div className="l">Ahorro neto</div></div>
            <div className="kpi k-in"><div className="v">{usd(aportesBrutos)}</div><div className="l">Aportes</div></div>
            <div className="kpi k-out"><div className="v">{usd(totalRetiros)}</div><div className="l">Retiros</div></div>
            <div className="kpi k-warn"><div className="v">{usd(interesesPagados)}</div><div className="l">Intereses pagados</div></div>
            <div className="kpi k-out"><div className="v">{usd(socio.saldo_credito)}</div><div className="l">Saldo de crédito</div></div>
            <div className="kpi k-warn"><div className="v">{usd(socio.total_multas)}</div><div className="l">Multas</div></div>
          </div>
        );
      })()}

      <div className="tarjeta no-print">
        <div className="seccion-titulo" style={{ margin: "0 0 8px" }}>
          <h3 style={{ margin: 0 }}>Ficha del socio</h3>
          {!soloLectura && <button className="boton mini" onClick={() => setEditando(!editando)}>{editando ? "Cerrar" : "Editar ficha"}</button>}
        </div>
        {editando ? (
          <EditarFicha socio={socio} onListo={(g) => { setEditando(false); if (g) cargar(); }} />
        ) : (
          <>
            {dato("Teléfono", socio.telefono)}
            {dato("WhatsApp", socio.whatsapp)}
            {dato("Correo", socio.correo)}
            {dato("Nacimiento", socio.fecha_nacimiento && fechaCorta(socio.fecha_nacimiento))}
            {dato("Género", { F: "Femenino", M: "Masculino", Otro: "Otro", NS: "Prefiere no decir" }[socio.genero])}
            {dato("Estado civil", socio.estado_civil)}
            {dato("Instrucción", socio.nivel_instruccion)}
            {dato("Ocupación", socio.ocupacion)}
            {dato("Dirección", socio.direccion)}
            {dato("Cargas familiares", socio.num_cargas ? String(socio.num_cargas) : null)}
            {dato("Contacto emergencia", socio.contacto_emergencia)}
            {!socio.telefono && !socio.correo && !socio.ocupacion &&
              <div className="vacio">Ficha incompleta. Usa “Editar ficha” para completarla.</div>}
            {!soloLectura && socio.activo &&
              <button className="boton-baja" onClick={anonimizar}>Dar de baja y anonimizar (derecho al olvido)</button>}
          </>
        )}
      </div>

      {!soloLectura && socio.activo && (
        <div className="tarjeta no-print">
          <h3 style={{ marginTop: 0 }}>Acceso y seguridad</h3>
          {aviso && <div className="exito">{aviso}</div>}
          <div className="detalle" style={{ color: "var(--tinta-suave)", fontSize: 13, margin: "0 0 8px" }}>
            Si el socio olvidó su contraseña o perdió el teléfono con su 2FA, restablécelo aquí.
          </div>
          <div className="dos-col">
            <button className="boton secundario" onClick={reiniciarClave}>Reiniciar contraseña</button>
            <button className="boton secundario" onClick={reiniciar2FA}>Restablecer 2FA</button>
          </div>
        </div>
      )}

      <ExportarEstado lib={lib} />

      {creditos.length > 0 && (
        <div className="tarjeta">
          <h3>Créditos</h3>
          {creditos.map((c) => (
            <div key={c.id} style={{ borderBottom: "1px dashed var(--regla)", paddingBottom: 4 }}>
              <div className="fila" style={{ borderBottom: "none" }}>
                <div>
                  <div className="principal">{usd(c.monto)}{" "}
                    {c.estado === "pagado" ? <span className="pill ok">pagado</span>
                      : c.en_mora ? <span className="pill mora">en mora</span>
                      : <span className="pill neutro">al día</span>}</div>
                  <div className="detalle">{c.destino || "Crédito"} · {c.plazo_meses} meses al {c.tasa_mensual}% · {c.cuotas_pagadas}/{c.plazo_meses} cuotas</div>
                </div>
                <div className="cifra">{usd(c.saldo_capital)}</div>
              </div>
              <details>
                <summary>Cuotas</summary>
                {c.cuotas.map((q) => (
                  <div className="fila" key={q.id}>
                    <div><div className="principal" style={{ fontSize: 14 }}>Cuota {q.numero}</div>
                      <div className="detalle">vence {fechaCorta(q.fecha_vencimiento)}</div></div>
                    <div style={{ textAlign: "right" }}>
                      <div className="cifra">{usd(q.total)}</div>
                      {q.pagada ? <span className="pill ok">pagada {fechaCorta(q.fecha_pago)}</span>
                        : new Date(q.fecha_vencimiento) < new Date() ? <span className="pill mora">vencida</span>
                          : <span className="pill neutro">pendiente</span>}</div>
                  </div>
                ))}
              </details>
            </div>
          ))}
        </div>
      )}

      {(lib.retiros && lib.retiros.length > 0) && (
        <div className="tarjeta">
          <h3>Retiros ({lib.retiros.length})</h3>
          {lib.retiros.map((r) => (
            <div className="fila" key={r.id}>
              <div><div className="principal">Retiro</div>
                <div className="detalle">{fechaCorta(r.fecha)}{r.nota ? ` · ${r.nota}` : ""}</div></div>
              <div className="cifra neg">−{usd(r.monto)}</div>
            </div>
          ))}
        </div>
      )}

      <div className="tarjeta">
        <h3>Aportes ({aportes.length})</h3>
        {aportes.length === 0 && <div className="vacio">Sin aportes registrados.</div>}
        {aportes.map((a) => (
          <div className="fila" key={a.id}>
            <div><div className="principal">{a.tipo === "ordinario" ? "Aporte mensual" : a.tipo === "multa" ? "Multa" : "Extraordinario"}</div>
              <div className="detalle">{fechaCorta(a.fecha)}{a.nota ? ` · ${a.nota}` : ""}</div></div>
            <div className="cifra pos">{usd(a.monto)}</div>
          </div>
        ))}
      </div>
    </>
  );
}

const ETIQ = { telefono: "Teléfono", whatsapp: "WhatsApp", correo: "Correo", direccion: "Dirección",
  ocupacion: "Ocupación", estado_civil: "Estado civil", nivel_instruccion: "Instrucción",
  num_cargas: "Cargas", contacto_emergencia: "Contacto emergencia", fecha_nacimiento: "Nacimiento", genero: "Género" };

function Solicitudes({ onCambio }) {
  const [sols, setSols] = useState([]);
  const [error, setError] = useState("");
  const cargar = () => api("/socios/solicitudes").then(setSols).catch(() => setSols([]));
  useEffect(() => { cargar(); }, []);
  const resolver = async (id, accion) => {
    setError("");
    try { await api(`/socios/solicitudes/${id}/${accion}`, { method: "POST" }); cargar(); onCambio && onCambio(); }
    catch (e) { setError(e.message); }
  };
  if (!sols.length) return null;
  return (
    <div className="tarjeta" style={{ borderColor: "var(--sara)" }}>
      <h3>Solicitudes de actualización ({sols.length})</h3>
      {error && <div className="error">{error}</div>}
      {sols.map((s) => (
        <div key={s.id} style={{ borderBottom: "1px dashed var(--regla)", padding: "8px 0" }}>
          <div className="principal">{s.socio_nombre}</div>
          <div className="detalle" style={{ margin: "2px 0 8px" }}>
            {Object.entries(s.campos).map(([k, v]) => `${ETIQ[k] || k}: ${v}`).join(" · ")}
          </div>
          <div className="dos-col">
            <button className="boton secundario" onClick={() => resolver(s.id, "rechazar")}>Rechazar</button>
            <button className="boton" onClick={() => resolver(s.id, "aprobar")}>Aprobar</button>
          </div>
        </div>
      ))}
    </div>
  );
}

const FORM0 = { nombres: "", cedula: "", whatsapp: "", correo: "", telefono: "",
  fecha_nacimiento: "", genero: "", direccion: "", ocupacion: "",
  estado_civil: "", nivel_instruccion: "", num_cargas: "", contacto_emergencia: "", consentimiento_datos: false };

export default function Socios() {
  const [socios, setSocios] = useState(null);
  const [error, setError] = useState(""); const [ok, setOk] = useState("");
  const [form, setForm] = useState(FORM0);
  const [creando, setCreando] = useState(false);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [verExtra, setVerExtra] = useState(false);
  const [abierto, setAbierto] = useState(null);
  const soloLectura = (getSesion() || {}).rol === "directiva";

  const cargar = () => api("/socios").then(setSocios).catch((e) => setError(e.message));
  useEffect(() => { cargar(); }, []);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const crear = async () => {
    setError(""); setOk(""); setCreando(true);
    try {
      const body = { ...form };
      body.num_cargas = body.num_cargas === "" ? 0 : +body.num_cargas;
      if (!body.fecha_nacimiento) delete body.fecha_nacimiento;
      const s = await api("/socios", { method: "POST", body });
      setOk(`${s.nombres} registrado. Su acceso inicial es su cédula como usuario y contraseña.`);
      setForm(FORM0); setMostrarForm(false); setVerExtra(false); cargar();
    } catch (e) { setError(e.message); }
    finally { setCreando(false); }
  };

  if (!socios) return <div className="vacio">Cargando…</div>;
  if (abierto) return <Expediente socioId={abierto} onCerrar={() => { setAbierto(null); cargar(); }} />;

  return (
    <>
      <div className="seccion-titulo">
        <h2>Socios</h2>
        {!soloLectura && <button className="boton mini" onClick={() => setMostrarForm(!mostrarForm)}>{mostrarForm ? "Cancelar" : "+ Nuevo socio"}</button>}
      </div>
      {error && <div className="error">{error}</div>}
      {ok && <div className="exito">{ok}</div>}

      {!soloLectura && <Solicitudes onCambio={cargar} />}

      {mostrarForm && (
        <div className="tarjeta">
          <h3>Registrar socio</h3>
          <div className="campo"><label>Nombres completos</label><input value={form.nombres} onChange={set("nombres")} /></div>
          <div className="dos-col">
            <div className="campo"><label>Cédula</label>
              <input inputMode="numeric" value={form.cedula} onChange={(e) => setForm({ ...form, cedula: e.target.value.trim() })} /></div>
            <div className="campo"><label>WhatsApp</label>
              <input inputMode="tel" value={form.whatsapp} onChange={set("whatsapp")} /></div>
          </div>
          <div className="campo"><label>Correo electrónico</label>
            <input type="email" value={form.correo} onChange={set("correo")} /></div>

          <button className="boton secundario boton-extra" onClick={() => setVerExtra(!verExtra)}>
            {verExtra ? "▾ Ocultar datos adicionales" : "▸ Agregar datos adicionales (opcional)"}
          </button>
          {verExtra && (
            <div className="dos-col">
              <CampoFicha def={["fecha_nacimiento", "Fecha de nacimiento", "date"]} value={form.fecha_nacimiento} onChange={set("fecha_nacimiento")} />
              <CampoFicha def={["genero", "Género", "select", GENEROS]} value={form.genero} onChange={set("genero")} />
              <CampoFicha def={["estado_civil", "Estado civil", "select2", CIVIL]} value={form.estado_civil} onChange={set("estado_civil")} />
              <CampoFicha def={["nivel_instruccion", "Nivel de instrucción", "select2", INSTRUCCION]} value={form.nivel_instruccion} onChange={set("nivel_instruccion")} />
              <CampoFicha def={["ocupacion", "Ocupación / lugar de trabajo", "text"]} value={form.ocupacion} onChange={set("ocupacion")} />
              <CampoFicha def={["direccion", "Dirección", "text"]} value={form.direccion} onChange={set("direccion")} />
              <CampoFicha def={["num_cargas", "Cargas familiares", "number"]} value={form.num_cargas} onChange={set("num_cargas")} />
              <CampoFicha def={["contacto_emergencia", "Contacto de emergencia", "text"]} value={form.contacto_emergencia} onChange={set("contacto_emergencia")} />
            </div>
          )}
          <label className="check-consent">
            <input type="checkbox" checked={form.consentimiento_datos}
              onChange={(e) => setForm({ ...form, consentimiento_datos: e.target.checked })} />
            <span>El socio autoriza el tratamiento de sus datos personales conforme a la{" "}
              <a href="/privacidad" target="_blank" rel="noreferrer">política de privacidad</a>.</span>
          </label>
          <button className="boton" onClick={crear}
            disabled={creando || !form.nombres || !form.cedula || !form.consentimiento_datos}>
            {creando ? "Guardando…" : "Guardar socio"}
          </button>
        </div>
      )}

      <div className="tarjeta">
        <div className="fila encabezado"><span>Socio · toca para ver su expediente</span><span>Aportes / Debe</span></div>
        {socios.length === 0 && <div className="vacio">Aún no hay socios. Registra el primero.</div>}
        {socios.map((s) => (
          <div className="fila tocable" key={s.id} role="button" tabIndex={0}
            onClick={() => setAbierto(s.id)} onKeyDown={(e) => e.key === "Enter" && setAbierto(s.id)}>
            <div><div className="principal">{s.nombres} {!s.activo && <span className="pill neutro">inactivo</span>}</div>
              <div className="detalle">CI {mascaraCedula(s.cedula)}{s.whatsapp ? ` · ${s.whatsapp}` : s.telefono ? ` · ${s.telefono}` : ""}</div></div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div style={{ textAlign: "right" }}>
                <div className="cifra pos">{usd(s.total_aportes)}</div>
                {s.saldo_credito > 0 && <div className="cifra neg" style={{ fontSize: 13 }}>debe {usd(s.saldo_credito)}</div>}</div>
              <span className="chevron" aria-hidden="true">›</span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
