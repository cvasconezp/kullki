import { useState } from "react";
import { periodosDeLibreta, descargarEstadoCSV, imprimirEstadoCuenta } from "../lib/exportar.js";

export default function ExportarEstado({ lib }) {
  const periodos = periodosDeLibreta(lib);
  const [periodo, setPeriodo] = useState("");
  return (
    <div className="tarjeta no-print">
      <h3>Descargar estado de cuenta</h3>
      <div className="campo">
        <label>Periodo</label>
        <select value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
          {periodos.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
        </select>
      </div>
      <div className="dos-col">
        <button className="boton secundario" onClick={() => imprimirEstadoCuenta(lib, periodo)}>🖨 PDF con membrete</button>
        <button className="boton secundario" onClick={() => descargarEstadoCSV(lib, periodo)}>⬇ Excel (CSV)</button>
      </div>
    </div>
  );
}
