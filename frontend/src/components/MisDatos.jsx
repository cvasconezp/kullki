import { useEffect, useState } from "react";
import { api, fechaCorta } from "../lib/api.js";

const GEN = { F: "Femenino", M: "Masculino", Otro: "Otro", NS: "Prefiere no decir" };
const GENEROS = [["", "—"], ["F", "Femenino"], ["M", "Masculino"], ["Otro", "Otro"], ["NS", "Prefiere no decir"]];
const CIVIL = ["", "Soltero/a", "Casado/a", "Unión libre", "Divorciado/a", "Viudo/a"];
const INSTR = ["", "Ninguna", "Primaria", "Secundaria", "Superior", "Posgrado"];
const ETIQ = { telefono: "Teléfono", whatsapp: "WhatsApp", correo: "Correo", direccion: "Dirección",
  ocupacion: "Ocupación", estado_civil: "Estado civil", nivel_instruccion: "Instrucción",
  num_cargas: "Cargas familiares", contacto_emergencia: "Contacto emergencia",
  fecha_nacimiento: "Nacimiento", genero: "Género" };

export default function MisDatos({ socio }) {
  const [pendiente, setPendiente] = useState(null);
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({
    whatsapp: socio.whatsapp || "", correo: socio.correo || "", telefono: socio.telefono || "",
    direccion: socio.direccion || "", ocupacion: socio.ocupacion || "",
    fecha_nacimiento: socio.fecha_nacimiento || "", genero: socio.genero || "",
    estado_civil: socio.estado_civil || "", nivel_instruccion: socio.nivel_instruccion || "",
    num_cargas: socio.num_cargas ?? "", contacto_emergencia: socio.contacto_emergencia || "",
  });
  const [error, setError] = useState(""); const [ok, setOk] = useState(""); const [guardando, setGuardando] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const cargarPend = () => api("/socios/solicitud").then(setPendiente).catch(() => setPendiente(null));
  useEffect(() => { cargarPend(); }, []);

  const enviar = async () => {
    setError(""); setOk(""); setGuardando(true);
    try {
      const body = { ...f };
      body.num_cargas = body.num_cargas === "" ? 0 : +body.num_cargas;
      if (!body.fecha_nacimiento) delete body.fecha_nacimiento;
      await api("/socios/solicitud", { method: "POST", body });
      setOk("Solicitud enviada. El tesorero la revisará y aprobará."); setEdit(false); cargarPend();
    } catch (e) { setError(e.message); }
    finally { setGuardando(false); }
  };

  const dato = (l, v) => v ? <div className="fila"><span className="detalle">{l}</span><span>{v}</span></div> : null;

  return (
    <div className="tarjeta no-print">
      <div className="seccion-titulo" style={{ margin: "0 0 8px" }}>
        <h3 style={{ margin: 0 }}>Mis datos</h3>
        {!pendiente && <button className="boton mini" onClick={() => { setEdit(!edit); setOk(""); }}>
          {edit ? "Cancelar" : "Solicitar actualización"}</button>}
      </div>
      {error && <div className="error">{error}</div>}
      {ok && <div className="exito">{ok}</div>}

      {pendiente && (
        <div className="login-hint" style={{ marginBottom: 10 }}>
          Tienes una <strong>solicitud de actualización pendiente</strong> (enviada {fechaCorta(pendiente.creado_en)}).
          El tesorero debe aprobarla: {Object.entries(pendiente.campos).map(([k, v]) => `${ETIQ[k] || k}: ${v}`).join(" · ")}
        </div>
      )}

      {!edit ? (
        <>
          {dato("WhatsApp", socio.whatsapp)}
          {dato("Teléfono", socio.telefono)}
          {dato("Correo", socio.correo)}
          {dato("Dirección", socio.direccion)}
          {dato("Ocupación", socio.ocupacion)}
          {dato("Nacimiento", socio.fecha_nacimiento && fechaCorta(socio.fecha_nacimiento))}
          {dato("Género", GEN[socio.genero])}
          {dato("Estado civil", socio.estado_civil)}
          {dato("Instrucción", socio.nivel_instruccion)}
          {dato("Contacto de emergencia", socio.contacto_emergencia)}
          {!socio.whatsapp && !socio.correo &&
            <div className="vacio">Aún no registras tus datos de contacto. Usa “Solicitar actualización”.</div>}
        </>
      ) : (
        <>
          <p className="detalle" style={{ color: "var(--tinta-suave)", fontSize: 12.5, margin: "0 0 8px" }}>
            Tus cambios no se aplican de inmediato: se envían al tesorero para su aprobación.
          </p>
          <div className="dos-col">
            <div className="campo"><label>WhatsApp</label><input inputMode="tel" value={f.whatsapp} onChange={set("whatsapp")} /></div>
            <div className="campo"><label>Teléfono</label><input inputMode="tel" value={f.telefono} onChange={set("telefono")} /></div>
          </div>
          <div className="campo"><label>Correo</label><input type="email" value={f.correo} onChange={set("correo")} /></div>
          <div className="campo"><label>Dirección</label><input value={f.direccion} onChange={set("direccion")} /></div>
          <div className="campo"><label>Ocupación</label><input value={f.ocupacion} onChange={set("ocupacion")} /></div>
          <div className="dos-col">
            <div className="campo"><label>Fecha de nacimiento</label><input type="date" value={f.fecha_nacimiento} onChange={set("fecha_nacimiento")} /></div>
            <div className="campo"><label>Género</label>
              <select value={f.genero} onChange={set("genero")}>{GENEROS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
            <div className="campo"><label>Estado civil</label>
              <select value={f.estado_civil} onChange={set("estado_civil")}>{CIVIL.map((v) => <option key={v} value={v}>{v || "—"}</option>)}</select></div>
            <div className="campo"><label>Nivel de instrucción</label>
              <select value={f.nivel_instruccion} onChange={set("nivel_instruccion")}>{INSTR.map((v) => <option key={v} value={v}>{v || "—"}</option>)}</select></div>
            <div className="campo"><label>Cargas familiares</label><input type="number" value={f.num_cargas} onChange={set("num_cargas")} /></div>
            <div className="campo"><label>Contacto de emergencia</label><input value={f.contacto_emergencia} onChange={set("contacto_emergencia")} /></div>
          </div>
          <button className="boton" onClick={enviar} disabled={guardando}>{guardando ? "Enviando…" : "Enviar solicitud al tesorero"}</button>
        </>
      )}
    </div>
  );
}
