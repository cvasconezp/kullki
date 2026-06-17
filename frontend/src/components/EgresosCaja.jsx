import { useEffect, useState } from "react";
import { api, usd, fechaCorta } from "../lib/api.js";

export default function EgresosCaja({ cajaId }) {
  const [egresos, setEgresos] = useState([]);
  const [form, setForm] = useState({ monto: "", concepto: "", fecha: "" });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [abierto, setAbierto] = useState(false);

  const cargar = () =>
    api("/egresos").then(setEgresos).catch(() => setEgresos([]));

  useEffect(() => { cargar(); }, []);

  const registrar = async () => {
    if (!form.monto || parseFloat(form.monto) <= 0) { setError("El monto debe ser mayor a 0."); return; }
    if (!form.concepto.trim()) { setError("El concepto es obligatorio."); return; }
    setError(""); setGuardando(true);
    try {
      await api("/egresos", {
        method: "POST",
        body: {
          monto: parseFloat(form.monto),
          concepto: form.concepto,
          fecha: form.fecha || undefined,
        },
      });
      setForm({ monto: "", concepto: "", fecha: "" });
      setAbierto(false);
      cargar();
    } catch (e) { setError(e.message); }
    finally { setGuardando(false); }
  };

  const anular = async (id) => {
    if (!window.confirm("¿Anular este egreso?")) return;
    try { await api(`/egresos/${id}`, { method: "DELETE" }); cargar(); }
    catch (e) { setError(e.message); }
  };

  const totalEgresos = egresos.reduce((t, e) => t + e.monto, 0);

  return (
    <div className="tarjeta">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3>Egresos de la caja</h3>
        <button className="boton mini" onClick={() => setAbierto((v) => !v)}>
          {abierto ? "Cancelar" : "+ Registrar egreso"}
        </button>
      </div>

      {abierto && (
        <div style={{ background: "var(--superficie)", borderRadius: 8, padding: 12, margin: "10px 0" }}>
          <div className="dos-col">
            <div className="campo"><label>Monto ($)</label>
              <input type="number" min="0.01" step="0.01" value={form.monto}
                onChange={(e) => setForm((f) => ({ ...f, monto: e.target.value }))} /></div>
            <div className="campo"><label>Fecha (opcional)</label>
              <input type="date" value={form.fecha}
                onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))} /></div>
          </div>
          <div className="campo"><label>Concepto</label>
            <input value={form.concepto} placeholder="Ej: Agasajo navideño, canasta familiar…"
              onChange={(e) => setForm((f) => ({ ...f, concepto: e.target.value }))} /></div>
          {error && <div className="error">{error}</div>}
          <button className="boton" onClick={registrar} disabled={guardando}>
            {guardando ? "Guardando…" : "Registrar egreso"}
          </button>
        </div>
      )}

      <div className="fila" style={{ marginBottom: 6 }}>
        <div className="detalle">Total egresos</div>
        <div className="cifra neg">{usd(totalEgresos)}</div>
      </div>

      {egresos.length === 0 && <div className="vacio">Sin egresos registrados.</div>}
      {egresos.map((e) => (
        <div className="fila" key={e.id}>
          <div>
            <div className="principal">{e.concepto || "Sin concepto"}</div>
            <div className="detalle">{fechaCorta(e.fecha)}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div className="cifra neg">−{usd(e.monto)}</div>
            <button className="boton mini secundario" style={{ color: "var(--cochinilla)", padding: "2px 8px" }}
              onClick={() => anular(e.id)}>✕</button>
          </div>
        </div>
      ))}
    </div>
  );
}
