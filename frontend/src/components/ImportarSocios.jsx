import { useRef, useState } from "react";
import { getSesion } from "../lib/api.js";

export default function ImportarSocios({ onImportado }) {
  const inputRef = useRef(null);
  const [cargando, setCargando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState("");

  const importar = async (e) => {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    setError(""); setResultado(null); setCargando(true);

    const base = import.meta.env.VITE_API_URL || "http://localhost:8000";
    const token = JSON.parse(sessionStorage.getItem("kullki_sesion"))?.access_token;
    const form = new FormData();
    form.append("archivo", archivo);

    try {
      const res = await fetch(`${base}/socios/importar-excel`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || `Error ${res.status}`);
      setResultado(data);
      if (data.importados > 0) onImportado?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="tarjeta no-print">
      <h3>Importar socios desde Excel</h3>
      <div className="detalle" style={{ marginBottom: 10 }}>
        Sube un archivo <strong>.xlsx</strong> con columnas: <code>nombres</code>, <code>cedula</code>
        (obligatorias) y opcionalmente: telefono, correo, whatsapp, direccion, ocupacion, genero,
        estado_civil, nivel_instruccion, num_cargas, contacto_emergencia, fecha_ingreso, fecha_nacimiento.
        Los socios con cédula ya registrada son omitidos automáticamente.
      </div>

      {error && <div className="error">{error}</div>}

      {resultado && (
        <div className="exito" style={{ marginBottom: 10 }}>
          ✓ {resultado.importados} importado(s) · {resultado.omitidos} omitido(s) (ya existían)
          {resultado.errores?.length > 0 && (
            <ul style={{ marginTop: 6, paddingLeft: 16, color: "var(--cochinilla)" }}>
              {resultado.errores.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          )}
        </div>
      )}

      <label className="boton" style={{ display: "inline-block", cursor: "pointer", opacity: cargando ? 0.6 : 1 }}>
        {cargando ? "Importando…" : "📂 Seleccionar archivo .xlsx"}
        <input ref={inputRef} type="file" accept=".xlsx" style={{ display: "none" }} disabled={cargando} onChange={importar} />
      </label>

      <div className="detalle" style={{ marginTop: 8, fontSize: 11.5 }}>
        Tip: puedes descargar la plantilla con ⬇ Backup Excel en la sección Informes y modificarla para importar a otra caja.
      </div>
    </div>
  );
}
