import { useEffect, useState } from "react";
import { api, mascaraCedula, fechaCorta } from "../lib/api.js";

const ROLES = [
  { v: "", t: "Todos los roles" },
  { v: "superadmin", t: "Superadmin" },
  { v: "tesorero", t: "Tesorero/a" },
  { v: "directiva", t: "Directiva" },
  { v: "socio", t: "Socio/a" },
];
const PILL = { superadmin: "mora", tesorero: "ok", directiva: "neutro", socio: "neutro" };

export default function Usuarios() {
  const [cajas, setCajas] = useState([]);
  const [filas, setFilas] = useState(null);
  const [cajaId, setCajaId] = useState("");
  const [rol, setRol] = useState("");
  const [q, setQ] = useState("");
  const [error, setError] = useState(""); const [aviso, setAviso] = useState("");

  useEffect(() => { api("/cajas").then(setCajas).catch(() => setCajas([])); }, []);
  const cargar = () => {
    setError("");
    const p = new URLSearchParams();
    if (cajaId) p.set("caja_id", cajaId);
    if (rol) p.set("rol", rol);
    if (q.trim()) p.set("q", q.trim());
    api(`/admin/usuarios?${p.toString()}`).then(setFilas).catch((e) => setError(e.message));
  };
  useEffect(() => { const t = setTimeout(cargar, 250); return () => clearTimeout(t); }, [cajaId, rol, q]);

  const reiniciarClave = async (f) => {
    if (!window.confirm(`¿Reiniciar la contraseña de ${f.nombre}? Volverá a ser su cédula y deberá cambiarla al ingresar.`)) return;
    setError(""); setAviso("");
    try { const r = await api("/auth/restablecer/password", { method: "POST", body: { cedula: f.cedula } });
      setAviso(`Contraseña de ${f.nombre} reiniciada. Clave temporal: ${r.password_temporal}.`); cargar(); }
    catch (e) { setError(e.message); }
  };
  const reiniciar2FA = async (f) => {
    if (!window.confirm(`¿Desactivar el 2FA de ${f.nombre}? Podrá volver a activarlo desde su perfil.`)) return;
    setError(""); setAviso("");
    try { await api("/auth/restablecer/2fa", { method: "POST", body: { cedula: f.cedula } });
      setAviso(`2FA de ${f.nombre} restablecido.`); cargar(); }
    catch (e) { setError(e.message); }
  };

  return (
    <>
      <div className="seccion-titulo"><h2>Usuarios y accesos</h2></div>
      {error && <div className="error">{error}</div>}
      {aviso && <div className="exito">{aviso}</div>}

      <div className="tarjeta no-print">
        <div className="filtros-usuarios">
          <input placeholder="Buscar por nombre o cédula…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select value={cajaId} onChange={(e) => setCajaId(e.target.value)}>
            <option value="">Todas las cajas</option>
            {cajas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          <select value={rol} onChange={(e) => setRol(e.target.value)}>
            {ROLES.map((r) => <option key={r.v} value={r.v}>{r.t}</option>)}
          </select>
        </div>
      </div>

      <div className="tarjeta">
        {!filas && <div className="vacio">Cargando…</div>}
        {filas && filas.length === 0 && <div className="vacio">No hay usuarios con esos filtros.</div>}
        {filas && filas.length > 0 && (
          <>
            <div className="detalle" style={{ color: "var(--tinta-suave)", fontSize: 13, margin: "0 0 8px" }}>
              {filas.length} registro(s). El 2FA y la contraseña los activa cada usuario; aquí solo puedes restablecerlos.
            </div>
            {filas.map((f, i) => (
              <div className="fila" key={f.usuario_id + "-" + (f.caja_id || "s") + "-" + i} style={{ alignItems: "flex-start" }}>
                <div>
                  <div className="principal">
                    {f.nombre} <span className={"pill " + (PILL[f.rol] || "neutro")}>{f.rol}</span>
                    {f.totp_activo
                      ? <span className="pill ok" style={{ marginLeft: 4 }}>2FA activo</span>
                      : <span className="pill neutro" style={{ marginLeft: 4 }}>sin 2FA</span>}
                    {!f.activo && <span className="pill mora" style={{ marginLeft: 4 }}>inactivo</span>}
                  </div>
                  <div className="detalle">
                    CI {mascaraCedula(f.cedula)} · {f.caja_nombre}
                    {f.ultimo_acceso ? ` · último acceso ${fechaCorta(f.ultimo_acceso)}` : " · nunca ingresó"}
                    {f.debe_cambiar_password ? " · debe cambiar clave" : ""}
                  </div>
                  <div className="acc-usuarios">
                    <button className="boton mini secundario" onClick={() => reiniciarClave(f)}>Reiniciar contraseña</button>
                    <button className="boton mini secundario" onClick={() => reiniciar2FA(f)}>Restablecer 2FA</button>
                  </div>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </>
  );
}
