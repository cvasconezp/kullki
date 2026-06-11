import { useEffect, useState } from "react";
import { api, usd, fechaCorta } from "../lib/api.js";

function Expediente({ socioId, onCerrar }) {
  const [lib, setLib] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api(`/mi-libreta?socio_id=${socioId}`).then(setLib).catch((e) => setError(e.message));
  }, [socioId]);

  if (error) return <div className="error">{error}</div>;
  if (!lib) return <div className="vacio">Cargando expediente…</div>;

  const { socio, aportes, creditos } = lib;
  return (
    <>
      <button className="volver" onClick={onCerrar}>← Volver a la lista</button>
      <div className="libreta" style={{ marginTop: 8 }}>
        <div className="eyebrow">Expediente · {socio.nombres}</div>
        <div className="saldo">
          <span className="moneda">$</span>
          {socio.total_aportes.toLocaleString("es-EC", { minimumFractionDigits: 2 })}
        </div>
        <div className="sub">
          Aportes desde {fechaCorta(socio.fecha_ingreso)} · CI {socio.cedula}
          {socio.saldo_credito > 0 && <> · debe <strong className="cifra">{usd(socio.saldo_credito)}</strong></>}
        </div>
      </div>

      {creditos.length > 0 && (
        <div className="tarjeta">
          <h3>Créditos</h3>
          {creditos.map((c) => (
            <div key={c.id} style={{ borderBottom: "1px dashed var(--regla)", paddingBottom: 4 }}>
              <div className="fila" style={{ borderBottom: "none" }}>
                <div>
                  <div className="principal">
                    {usd(c.monto)}{" "}
                    {c.estado === "pagado" ? <span className="pill ok">pagado</span>
                      : c.en_mora ? <span className="pill mora">en mora</span>
                      : <span className="pill neutro">al día</span>}
                  </div>
                  <div className="detalle">
                    {c.destino || "Crédito"} · {c.plazo_meses} meses al {c.tasa_mensual}% ·{" "}
                    {c.cuotas_pagadas}/{c.plazo_meses} cuotas
                  </div>
                </div>
                <div className="cifra">{usd(c.saldo_capital)}</div>
              </div>
              <details>
                <summary>Cuotas</summary>
                {c.cuotas.map((q) => (
                  <div className="fila" key={q.id}>
                    <div>
                      <div className="principal" style={{ fontSize: 14 }}>Cuota {q.numero}</div>
                      <div className="detalle">vence {fechaCorta(q.fecha_vencimiento)}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div className="cifra">{usd(q.total)}</div>
                      {q.pagada ? <span className="pill ok">pagada {fechaCorta(q.fecha_pago)}</span>
                        : new Date(q.fecha_vencimiento) < new Date()
                          ? <span className="pill mora">vencida</span>
                          : <span className="pill neutro">pendiente</span>}
                    </div>
                  </div>
                ))}
              </details>
            </div>
          ))}
        </div>
      )}

      <div className="tarjeta">
        <h3>Aportes ({aportes.length})</h3>
        {aportes.length === 0 && <div className="vacio">Sin aportes registrados.</div>}
        {aportes.map((a) => (
          <div className="fila" key={a.id}>
            <div>
              <div className="principal">{a.tipo === "ordinario" ? "Aporte mensual" : a.tipo === "multa" ? "Multa" : "Extraordinario"}</div>
              <div className="detalle">{fechaCorta(a.fecha)}{a.nota ? ` · ${a.nota}` : ""}</div>
            </div>
            <div className="cifra pos">{usd(a.monto)}</div>
          </div>
        ))}
      </div>
    </>
  );
}

export default function Socios() {
  const [socios, setSocios] = useState(null);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [form, setForm] = useState({ nombres: "", cedula: "", telefono: "" });
  const [creando, setCreando] = useState(false);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [abierto, setAbierto] = useState(null);  // socio_id del expediente abierto

  const cargar = () => api("/socios").then(setSocios).catch((e) => setError(e.message));
  useEffect(() => { cargar(); }, []);

  const crear = async () => {
    setError(""); setOk(""); setCreando(true);
    try {
      const s = await api("/socios", { method: "POST", body: form });
      setOk(`${s.nombres} registrado. Su acceso inicial es su cédula como usuario y contraseña.`);
      setForm({ nombres: "", cedula: "", telefono: "" });
      setMostrarForm(false);
      cargar();
    } catch (e) { setError(e.message); }
    finally { setCreando(false); }
  };

  if (!socios) return <div className="vacio">Cargando…</div>;

  if (abierto) {
    return <Expediente socioId={abierto} onCerrar={() => { setAbierto(null); cargar(); }} />;
  }

  return (
    <>
      <div className="seccion-titulo">
        <h2>Socios</h2>
        <button className="boton mini" onClick={() => setMostrarForm(!mostrarForm)}>
          {mostrarForm ? "Cancelar" : "+ Nuevo socio"}
        </button>
      </div>
      {error && <div className="error">{error}</div>}
      {ok && <div className="exito">{ok}</div>}

      {mostrarForm && (
        <div className="tarjeta">
          <h3>Registrar socio</h3>
          <div className="campo">
            <label htmlFor="sn">Nombres completos</label>
            <input id="sn" value={form.nombres}
              onChange={(e) => setForm({ ...form, nombres: e.target.value })} />
          </div>
          <div className="campo">
            <label htmlFor="sc">Cédula</label>
            <input id="sc" inputMode="numeric" value={form.cedula}
              onChange={(e) => setForm({ ...form, cedula: e.target.value.trim() })} />
          </div>
          <div className="campo">
            <label htmlFor="st">Teléfono (opcional)</label>
            <input id="st" inputMode="tel" value={form.telefono}
              onChange={(e) => setForm({ ...form, telefono: e.target.value.trim() })} />
          </div>
          <button className="boton" onClick={crear}
            disabled={creando || !form.nombres || !form.cedula}>
            {creando ? "Guardando…" : "Guardar socio"}
          </button>
        </div>
      )}

      <div className="tarjeta">
        <div className="fila encabezado">
          <span>Socio · toca para ver su expediente</span><span>Aportes / Debe</span>
        </div>
        {socios.length === 0 && <div className="vacio">Aún no hay socios. Registra el primero.</div>}
        {socios.map((s) => (
          <div className="fila tocable" key={s.id} role="button" tabIndex={0}
            onClick={() => setAbierto(s.id)}
            onKeyDown={(e) => e.key === "Enter" && setAbierto(s.id)}>
            <div>
              <div className="principal">{s.nombres} {!s.activo && <span className="pill neutro">inactivo</span>}</div>
              <div className="detalle">CI {s.cedula}{s.telefono ? ` · ${s.telefono}` : ""}</div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div style={{ textAlign: "right" }}>
                <div className="cifra pos">{usd(s.total_aportes)}</div>
                {s.saldo_credito > 0 && <div className="cifra neg" style={{ fontSize: 13 }}>debe {usd(s.saldo_credito)}</div>}
              </div>
              <span className="chevron" aria-hidden="true">›</span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
