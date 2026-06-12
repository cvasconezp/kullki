import { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import Analitica from "../pages/Analitica.jsx";

export default function AnalisisAdmin() {
  const [cajas, setCajas] = useState([]); const [sel, setSel] = useState("");
  useEffect(() => {
    api("/cajas").then((c) => { setCajas(c); if (c[0]) setSel(String(c[0].id)); }).catch(() => {});
  }, []);
  return (
    <>
      <div className="seccion-titulo"><h2>Análisis por caja</h2></div>
      <div className="campo">
        <label>Caja</label>
        <select value={sel} onChange={(e) => setSel(e.target.value)}>
          {cajas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
      </div>
      {sel && <Analitica cajaId={sel} key={sel} />}
    </>
  );
}
