import { useState, useRef } from "react";
import { getSesion } from "../lib/api.js";

const BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";
async function apiForm(path, fd) {
  const token = getSesion()?.access_token;
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || "Error al procesar el archivo");
  return data;
}
async function apiFetch(path, opts = {}) {
  const token = getSesion()?.access_token;
  const { method = "GET", body } = opts;
  const res = await fetch(BASE + path, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}),
               ...(body instanceof FormData ? {} : { "Content-Type": "application/json" }) },
    body: body instanceof FormData ? body : (body ? JSON.stringify(body) : undefined),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || "Error");
  return data;
}

const ENTIDADES = [
  { id: "socios",   label: "Socios",   ico: "👥", desc: "Lista de integrantes de la caja" },
  { id: "aportes",  label: "Aportes",  ico: "💰", desc: "Depósitos y pagos históricos" },
  { id: "creditos", label: "Créditos", ico: "🏦", desc: "Préstamos (activos y cerrados)" },
];

const ETIQUETAS = {
  // socios
  nombres: "Nombres completos", cedula: "Cédula", telefono: "Teléfono",
  correo: "Correo", whatsapp: "WhatsApp", direccion: "Dirección",
  ocupacion: "Ocupación", genero: "Género", estado_civil: "Estado civil",
  nivel_instruccion: "Nivel instrucción", num_cargas: "Cargas familiares",
  contacto_emergencia: "Contacto emergencia", fecha_ingreso: "Fecha ingreso",
  fecha_nacimiento: "Fecha nacimiento",
  // aportes
  cedula_socio: "Cédula del socio", nombre_socio: "Nombre del socio",
  monto: "Monto ($)", fecha: "Fecha", tipo: "Tipo de aporte", nota: "Nota / concepto",
  // creditos
  tasa_mensual: "Tasa mensual (%)", plazo_meses: "Plazo (meses)",
  fecha_desembolso: "Fecha desembolso", destino: "Destino", garante: "Garante",
  estado: "Estado (activo/pagado)", cuotas_pagadas: "Cuotas ya pagadas",
};

const OBLIGATORIOS = {
  socios:   ["nombres", "cedula"],
  aportes:  ["cedula_socio", "monto", "fecha"],
  creditos: ["cedula_socio", "monto", "tasa_mensual", "plazo_meses"],
};

export default function Importar() {
  const [paso, setPaso]           = useState(1);
  const [archivo, setArchivo]     = useState(null);
  const [entidad, setEntidad]     = useState("socios");
  const [analisis, setAnalisis]   = useState(null);
  const [mapeo, setMapeo]         = useState({});
  const [preview, setPreview]     = useState(null);
  const [resultado, setResultado] = useState(null);
  const [cargando, setCargando]   = useState(false);
  const [error, setError]         = useState("");
  const inputRef = useRef();

  // ── Paso 1: upload + analizar ──────────────────────────────────────────
  async function analizar() {
    if (!archivo) return;
    setCargando(true); setError("");
    try {
      const fd = new FormData();
      fd.append("archivo", archivo);
      fd.append("entidad", entidad);
      const r = await apiFetch("/importar/analizar", { method: "POST", body: fd });
      setAnalisis(r);
      setMapeo(r.mapeo);
      setEntidad(r.entidad);
      setPaso(2);
    } catch (e) { setError(e.message); }
    finally { setCargando(false); }
  }

  // ── Paso 2: preview con mapeo editado ──────────────────────────────────
  async function verPreview() {
    setCargando(true); setError("");
    try {
      const fd = new FormData();
      fd.append("archivo", archivo);
      fd.append("entidad", entidad);
      fd.append("mapeo_json", JSON.stringify(mapeo));
      const r = await apiFetch("/importar/preview", { method: "POST", body: fd });
      setPreview(r);
      setPaso(3);
    } catch (e) { setError(e.message); }
    finally { setCargando(false); }
  }

  // ── Paso 3: confirmar ──────────────────────────────────────────────────
  async function confirmar() {
    setCargando(true); setError("");
    try {
      const fd = new FormData();
      fd.append("archivo", archivo);
      fd.append("entidad", entidad);
      fd.append("mapeo_json", JSON.stringify(mapeo));
      fd.append("solo_validos", "true");
      const r = await apiFetch("/importar/confirmar", { method: "POST", body: fd });
      setResultado(r);
      setPaso(4);
    } catch (e) { setError(e.message); }
    finally { setCargando(false); }
  }

  async function revertir() {
    if (!resultado?.lote_id) return;
    if (!confirm("¿Deshacer toda esta importación?")) return;
    setCargando(true);
    try {
      await apiFetch(`/importar/${resultado.lote_id}`, { method: "DELETE" });
      alert("Importación revertida. Los datos han sido eliminados.");
      reiniciar();
    } catch (e) { setError(e.message); }
    finally { setCargando(false); }
  }

  function reiniciar() {
    setPaso(1); setArchivo(null); setAnalisis(null);
    setMapeo({}); setPreview(null); setResultado(null); setError("");
  }

  const pasos = ["Archivo", "Columnas", "Revisión", "Listo"];

  return (
    <div className="imp-wrap">
      {/* Header */}
      <div className="imp-header">
        <h1>📂 Importar datos históricos</h1>
        <p className="imp-sub">Sube un Excel o CSV con el historial de tu caja y lo cargamos a Kullki.</p>
        <div className="imp-pasos">
          {pasos.map((p, i) => (
            <div key={i} className={`imp-paso${paso === i+1 ? " activo" : paso > i+1 ? " hecho" : ""}`}>
              <span className="imp-paso-n">{paso > i+1 ? "✓" : i+1}</span>
              <span className="imp-paso-lbl">{p}</span>
            </div>
          ))}
        </div>
      </div>

      {error && <div className="imp-error">⚠ {error}</div>}

      {/* ── PASO 1: elegir archivo ── */}
      {paso === 1 && (
        <div className="imp-card">
          <h2>Tipo de datos a importar</h2>
          <div className="imp-entidades">
            {ENTIDADES.map(e => (
              <button key={e.id}
                className={`imp-ent${entidad === e.id ? " sel" : ""}`}
                onClick={() => setEntidad(e.id)}>
                <span className="imp-ent-ico">{e.ico}</span>
                <strong>{e.label}</strong>
                <span>{e.desc}</span>
              </button>
            ))}
          </div>

          <h2 style={{marginTop: 28}}>Selecciona el archivo</h2>
          <div
            className={`imp-drop${archivo ? " con-archivo" : ""}`}
            onClick={() => inputRef.current.click()}
            onDragOver={ev => ev.preventDefault()}
            onDrop={ev => { ev.preventDefault(); setArchivo(ev.dataTransfer.files[0]); }}>
            {archivo
              ? <><span className="imp-drop-ico">📄</span><span>{archivo.name}</span><button className="imp-quitar" onClick={e => { e.stopPropagation(); setArchivo(null); }}>✕</button></>
              : <><span className="imp-drop-ico">⬆️</span><span>Arrastra tu archivo aquí<br/><small>.xlsx · .xls · .csv</small></span></>
            }
          </div>
          <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv"
            style={{display:"none"}} onChange={e => setArchivo(e.target.files[0])} />

          <button className="imp-btn-pri" disabled={!archivo || cargando} onClick={analizar}>
            {cargando ? "Analizando…" : "Analizar archivo →"}
          </button>
        </div>
      )}

      {/* ── PASO 2: mapeo de columnas ── */}
      {paso === 2 && analisis && (
        <div className="imp-card">
          <h2>Revisa el mapeo de columnas</h2>
          <p className="imp-desc">
            Archivo: <strong>{archivo?.name}</strong> · {analisis.total} filas ·
            Entidad detectada: <strong>{ENTIDADES.find(e=>e.id===entidad)?.label}</strong>
          </p>

          <div className="imp-mapeo-tabla">
            <div className="imp-mapeo-head">
              <span>Campo de Kullki</span><span>Columna en tu archivo</span><span>Muestra</span>
            </div>
            {Object.keys(mapeo).map(campo => {
              const obligatorio = OBLIGATORIOS[entidad]?.includes(campo);
              const muestra = analisis.muestra
                .map(f => f[mapeo[campo]] || "")
                .filter(Boolean).slice(0,2).join(", ");
              return (
                <div key={campo} className={`imp-mapeo-fila${obligatorio ? " obligatorio" : ""}`}>
                  <span>
                    {obligatorio && <span className="imp-req">*</span>}
                    {ETIQUETAS[campo] || campo}
                  </span>
                  <select value={mapeo[campo] || ""}
                    onChange={e => setMapeo(m => ({...m, [campo]: e.target.value || null}))}>
                    <option value="">— ignorar —</option>
                    {analisis.cabeceras.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <span className="imp-muestra">{muestra || <em>sin datos</em>}</span>
                </div>
              );
            })}
          </div>

          <div className="imp-acciones">
            <button className="imp-btn-sec" onClick={() => setPaso(1)}>← Volver</button>
            <button className="imp-btn-pri" disabled={cargando} onClick={verPreview}>
              {cargando ? "Verificando…" : "Ver vista previa →"}
            </button>
          </div>
        </div>
      )}

      {/* ── PASO 3: preview ── */}
      {paso === 3 && preview && (
        <div className="imp-card">
          <h2>Vista previa de los datos</h2>
          <div className="imp-resumen">
            <div className="imp-res-item ok">✓ {preview.validos} válidos</div>
            {preview.con_error > 0 &&
              <div className="imp-res-item err">✗ {preview.con_error} con errores (se omitirán)</div>}
          </div>

          <div className="imp-preview-scroll">
            <table className="imp-tabla">
              <thead>
                <tr>
                  <th>#</th>
                  {Object.values(mapeo).filter(Boolean).map(c => <th key={c}>{c}</th>)}
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {preview.filas.slice(0, 50).map(f => (
                  <tr key={f.fila} className={f.estado === "error" ? "fila-err" : ""}>
                    <td>{f.fila}</td>
                    {Object.keys(mapeo).filter(k => mapeo[k]).map(k => (
                      <td key={k}>{String(f.datos[k] ?? "")}</td>
                    ))}
                    <td>
                      {f.estado === "error"
                        ? <span className="imp-tag err" title={f.errores.join("; ")}>✗ {f.errores[0]}</span>
                        : <span className="imp-tag ok">✓</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.filas.length > 50 &&
            <p className="imp-nota">Mostrando 50 de {preview.total} filas.</p>}

          <div className="imp-acciones">
            <button className="imp-btn-sec" onClick={() => setPaso(2)}>← Ajustar mapeo</button>
            <button className="imp-btn-pri" disabled={cargando || preview.validos === 0} onClick={confirmar}>
              {cargando ? "Importando…" : `Importar ${preview.validos} registros →`}
            </button>
          </div>
        </div>
      )}

      {/* ── PASO 4: resultado ── */}
      {paso === 4 && resultado && (
        <div className="imp-card imp-resultado">
          <div className="imp-ok-ico">✅</div>
          <h2>Importación completada</h2>
          <div className="imp-resumen grande">
            <div className="imp-res-item ok">✓ {resultado.importados} importados</div>
            {resultado.omitidos > 0 &&
              <div className="imp-res-item warn">⚡ {resultado.omitidos} omitidos (duplicados)</div>}
            {resultado.errores > 0 &&
              <div className="imp-res-item err">✗ {resultado.errores} con error</div>}
          </div>

          {resultado.detalle_errores?.length > 0 && (
            <details className="imp-errores-det">
              <summary>Ver detalle de errores</summary>
              <ul>{resultado.detalle_errores.map((e,i) => <li key={i}>{e}</li>)}</ul>
            </details>
          )}

          <p className="imp-lote">Lote #{resultado.lote_id} · puedes revertir si algo salió mal.</p>

          <div className="imp-acciones">
            <button className="imp-btn-danger" disabled={cargando} onClick={revertir}>
              🔄 Deshacer importación
            </button>
            <button className="imp-btn-pri" onClick={reiniciar}>
              Importar otro archivo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
