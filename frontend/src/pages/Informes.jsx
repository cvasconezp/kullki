import { useEffect, useState } from "react";
import { api, usd, fechaCorta } from "../lib/api.js";
import { imprimirInformeAsamblea } from "../lib/exportar.js";
import Seguridad2FA from "../components/Seguridad2FA.jsx";

function GrupoDemo({ titulo, datos, total }) {
  const max = Math.max(1, ...datos.map((d) => d.valor));
  return (
    <div style={{ marginTop: 10 }}>
      <div className="detalle" style={{ fontWeight: 600, color: "var(--kullki-oscuro)", marginBottom: 4 }}>{titulo}</div>
      {datos.filter((d) => d.valor > 0).map((d) => (
        <div className="rk" key={d.etiqueta} style={{ marginBottom: 6 }}>
          <div className="rk-top"><span>{d.etiqueta}</span>
            <span className="cifra">{d.valor} · {Math.round((d.valor / total) * 100)}%</span></div>
          <div className="rk-bar"><div style={{ width: `${(d.valor / max) * 100}%` }} /></div>
        </div>
      ))}
    </div>
  );
}

export default function Informes() {
  const [informe, setInforme] = useState(null);
  const [cierre, setCierre] = useState(null);
  const [demo, setDemo] = useState(null);
  const [error, setError] = useState("");
  const [okCierre, setOkCierre] = useState(""); const [cerrando, setCerrando] = useState(false);

  const recargar = () => {
    api("/informe-asamblea").then(setInforme).catch((e) => setError(e.message));
    api("/cierre/simulacion").then(setCierre).catch(() => {});
    api("/demografia").then(setDemo).catch(() => {});
  };
  useEffect(() => { recargar(); }, []);
  const ejecutarCierre = async (modo) => {
    const txt = modo === "capitalizar"
      ? "¿Capitalizar las utilidades? Se sumarán al ahorro de cada socio."
      : "¿Repartir las utilidades? Se pagarán a cada socio (salen del fondo).";
    if (!window.confirm(txt + " Esta acción queda registrada.")) return;
    setError(""); setOkCierre(""); setCerrando(true);
    try {
      const r = await api("/cierre/ejecutar", { method: "POST", body: { modo } });
      setOkCierre(`Cierre ${modo}: ${r.repartido.toLocaleString("es-EC", { style: "currency", currency: "USD" })} a ${r.socios} socios.`);
      recargar();
    } catch (e) { setError(e.message); }
    finally { setCerrando(false); }
  };

  if (error) return <div className="error">{error}</div>;
  if (!informe) return <div className="vacio">Preparando el informe…</div>;

  const descargarExcel = async (tipo) => {
    try {
      const base = import.meta.env.VITE_API_URL || "http://localhost:8000";
      const token = JSON.parse(sessionStorage.getItem("kullki_sesion"))?.token;
      const res = await fetch(`${base}/exportar/excel/${tipo}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error(`Error al descargar (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `kullki_${tipo}_${new Date().toISOString().slice(0,10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) { alert(e.message); }
  };

  const d = informe.dashboard;

  return (
    <div id="informe">
      <div className="seccion-titulo no-print-margin">
        <h2>Informe de asamblea</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="boton mini no-print" onClick={() => imprimirInformeAsamblea(informe, cierre)}>
            🖨 PDF con membrete
          </button>
          <button className="boton mini secundario no-print" onClick={() => descargarExcel("balance")}>
            ⬇ Balance
          </button>
          <button className="boton mini secundario no-print" onClick={() => descargarExcel("cartera")}>
            ⬇ Cartera
          </button>
          <button className="boton mini secundario no-print" onClick={() => descargarExcel("movimientos")}>
            ⬇ Movimientos
          </button>
          <button className="boton mini secundario no-print" onClick={() => descargarExcel("completo")}>
            ⬇ Backup Excel
          </button>
        </div>
      </div>

      <div className="tarjeta solo-print-header">
        <h3>{informe.caja.nombre}</h3>
        <div className="detalle" style={{ color: "var(--tinta-suave)", fontSize: 13 }}>
          {informe.caja.comunidad} · Informe generado el {fechaCorta(informe.fecha)} · Kullki / Yachay Deep Labs
        </div>
      </div>

      <div className="tarjeta">
        <h3>Estado de la caja</h3>
        <div className="fila"><span>Fondo disponible</span><span className="cifra pos">{usd(d.fondo_disponible)}</span></div>
        <div className="fila"><span>Aportes acumulados</span><span className="cifra">{usd(d.total_aportes)}</span></div>
        <div className="fila"><span>Retiros entregados</span><span className="cifra neg">{usd(d.total_retiros)}</span></div>
        <div className="fila"><span>Capital en la calle</span><span className="cifra">{usd(d.capital_prestado)}</span></div>
        <div className="fila"><span>Intereses ganados</span><span className="cifra pos">{usd(d.intereses_cobrados)}</span></div>
        {d.abonos_en_transito > 0 &&
          <div className="fila"><span>Abonos parciales en tránsito</span><span className="cifra">{usd(d.abonos_en_transito)}</span></div>}
        {d.cuotas_en_mora > 0 &&
          <div className="fila"><span>En mora ({d.cuotas_en_mora} cuotas)</span><span className="cifra neg">{usd(d.monto_en_mora)}</span></div>}
        {d.cuota_sri > 0 && (
          <div className="fila" style={{ borderTop: "1px dashed var(--regla)", marginTop: 4, paddingTop: 8 }}>
            <span>Contribución SRI 0,05% (activos totales)</span>
            <span className="cifra" style={{ color: "var(--tinta-suave)" }}>{usd(d.cuota_sri)}</span>
          </div>
        )}
      </div>

      <div className="tarjeta">
        <h3>Detalle por socio</h3>
        <div className="fila encabezado"><span>Socio</span><span>Ahorro / Debe</span></div>
        {informe.filas.map((f) => (
          <div className="fila" key={f.cedula}>
            <div>
              <div className="principal" style={{ fontSize: 14.5 }}>
                {f.socio} {f.en_mora && <span className="pill mora">mora</span>}
              </div>
              <div className="detalle">CI {f.cedula}{f.multas > 0 ? ` · multas ${usd(f.multas)}` : ""}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div className="cifra pos">{usd(f.ahorro_neto)}</div>
              {f.saldo_credito > 0 && <div className="cifra neg" style={{ fontSize: 13 }}>debe {usd(f.saldo_credito)}</div>}
            </div>
          </div>
        ))}
      </div>

      {cierre && cierre.intereses_a_repartir > 0 && (
        <div className="tarjeta">
          <h3>Simulación de cierre de ejercicio</h3>
          <p className="detalle" style={{ color: "var(--tinta-suave)", fontSize: 13, margin: "0 0 8px" }}>
            Si hoy se repartieran los {usd(cierre.intereses_a_repartir)} de intereses ganados,
            proporcional al ahorro de cada socio:
          </p>
          {cierre.filas.map((f) => (
            <div className="fila" key={f.socio}>
              <div>
                <div className="principal" style={{ fontSize: 14.5 }}>{f.socio}</div>
                <div className="detalle">{f.porcentaje}% del ahorro total</div>
              </div>
              <div className="cifra pos">{usd(f.utilidad)}</div>
            </div>
          ))}
          {okCierre && <div className="exito" style={{ marginTop: 10 }}>{okCierre}</div>}
          <div className="dos-col no-print" style={{ marginTop: 12 }}>
            <button className="boton secundario" disabled={cerrando} onClick={() => ejecutarCierre("repartir")}>
              Repartir (pagar a socios)</button>
            <button className="boton" disabled={cerrando} onClick={() => ejecutarCierre("capitalizar")}>
              Capitalizar (sumar al ahorro)</button>
          </div>
        </div>
      )}

      {demo && demo.total > 0 && (
        <div className="tarjeta no-print">
          <h3>Perfil de socios</h3>
          <div className="detalle" style={{ color: "var(--tinta-suave)", fontSize: 13, margin: "0 0 4px" }}>
            {demo.total} socios activos · ficha completa: {demo.ficha_completa} de {demo.total}
          </div>
          <GrupoDemo titulo="Género" datos={demo.genero} total={demo.total} />
          <GrupoDemo titulo="Rango de edad" datos={demo.edad} total={demo.total} />
          <GrupoDemo titulo="Nivel de instrucción" datos={demo.instruccion} total={demo.total} />
        </div>
      )}

      <Seguridad2FA />

      <p className="no-print" style={{ color: "var(--tinta-suave)", fontSize: 12.5, textAlign: "center", marginTop: 14 }}>
        Usa "PDF con membrete" para llevar este informe a la asamblea.
      </p>
    </div>
  );
}
