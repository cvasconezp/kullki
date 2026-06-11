// Exportación del estado de cuenta del socio: PDF (con branding de la caja) y Excel/CSV.
import { getSesion, usd, fechaCorta } from "./api.js";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio",
               "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export function periodosDeLibreta(lib) {
  const set = new Set();
  (lib.aportes || []).forEach((a) => a.fecha && set.add(a.fecha.slice(0, 7)));
  (lib.retiros || []).forEach((r) => r.fecha && set.add(r.fecha.slice(0, 7)));
  const arr = [...set].sort().reverse().map((k) => {
    const [y, m] = k.split("-");
    return { key: k, label: `${MESES[+m - 1]} ${y}` };
  });
  return [{ key: "", label: "Todo el historial" }, ...arr];
}

// Movimientos de ahorro (aportes sin multa = ingreso, retiros = egreso) con saldo acumulado.
function movimientos(lib, periodo) {
  const items = [];
  (lib.aportes || []).filter((a) => a.tipo !== "multa").forEach((a) =>
    items.push({ fecha: a.fecha, concepto: a.tipo === "ordinario" ? "Aporte ordinario"
      : a.tipo === "extraordinario" ? "Aporte extraordinario" : "Aporte",
      nota: a.nota || "", ingreso: a.monto, egreso: 0 }));
  (lib.retiros || []).forEach((r) =>
    items.push({ fecha: r.fecha, concepto: "Retiro", nota: r.nota || "", ingreso: 0, egreso: r.monto }));
  items.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
  let saldo = 0;
  items.forEach((i) => { saldo = Math.round((saldo + i.ingreso - i.egreso) * 100) / 100; i.saldo = saldo; });
  return periodo ? items.filter((i) => i.fecha.slice(0, 7) === periodo) : items;
}

function nombrePeriodo(lib, periodo) {
  if (!periodo) return "Historial completo";
  const [y, m] = periodo.split("-");
  return `${MESES[+m - 1]} ${y}`;
}

export function descargarEstadoCSV(lib, periodo) {
  const movs = movimientos(lib, periodo);
  const filas = [["Fecha", "Concepto", "Detalle", "Ingreso", "Egreso", "Saldo"]];
  movs.forEach((m) => filas.push([m.fecha, m.concepto, m.nota,
    m.ingreso ? m.ingreso.toFixed(2) : "", m.egreso ? m.egreso.toFixed(2) : "", m.saldo.toFixed(2)]));
  const csv = "﻿" + filas.map((r) => r.map((c) =>
    `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `estado-cuenta-${(lib.socio.nombres || "socio").replace(/\s+/g, "_")}-${periodo || "completo"}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function imprimirEstadoCuenta(lib, periodo) {
  const ses = getSesion() || {};
  const color = ses.color_primario || "#1B3A6B";
  const acento = ses.color_acento || "#E8A838";
  const logo = ses.logo || (lib.caja_nombre || "K").replace(/^caja (de ahorro )?/i, "").trim()[0] || "K";
  const movs = movimientos(lib, periodo);
  const s = lib.socio;
  const hoy = new Date().toLocaleDateString("es-EC", { day: "2-digit", month: "long", year: "numeric" });

  const filasMov = movs.length ? movs.map((m) => `
    <tr>
      <td>${fechaCorta(m.fecha)}</td>
      <td>${m.concepto}${m.nota ? ` <span class="nota">· ${m.nota}</span>` : ""}</td>
      <td class="num pos">${m.ingreso ? usd(m.ingreso) : ""}</td>
      <td class="num neg">${m.egreso ? "−" + usd(m.egreso) : ""}</td>
      <td class="num">${usd(m.saldo)}</td>
    </tr>`).join("") : `<tr><td colspan="5" class="vacio">Sin movimientos de ahorro en este periodo.</td></tr>`;

  const creditos = (lib.creditos || []).filter((c) => c.estado === "activo");
  const seccionCreditos = creditos.length ? `
    <h3>Créditos activos</h3>
    <table><thead><tr><th>Monto</th><th>Plazo</th><th>Cuotas</th><th class="num">Saldo</th></tr></thead>
    <tbody>${creditos.map((c) => `<tr>
      <td>${usd(c.monto)} <span class="nota">${c.destino || ""}</span></td>
      <td>${c.plazo_meses} meses al ${c.tasa_mensual}%</td>
      <td>${c.cuotas_pagadas}/${c.plazo_meses}${c.en_mora ? ' <span class="mora">en mora</span>' : ""}</td>
      <td class="num">${usd(c.saldo_capital)}</td></tr>`).join("")}</tbody></table>` : "";

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
  <title>Estado de cuenta · ${s.nombres}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; color: #1d2530; margin: 0; padding: 0 28px 40px; }
    .cab { display: flex; align-items: center; gap: 16px; padding: 22px 0; border-bottom: 3px solid ${acento}; }
    .logo { width: 56px; height: 56px; border-radius: 12px; background: ${color}; color: ${acento};
      display: flex; align-items: center; justify-content: center; font-size: 28px; font-weight: 800; flex: none; }
    .cab h1 { font-size: 20px; margin: 0; color: ${color}; }
    .cab .sub { font-size: 12.5px; color: #66707d; margin-top: 2px; }
    .doc-tit { text-align: right; margin-left: auto; }
    .doc-tit .t { font-size: 15px; font-weight: 700; color: ${color}; }
    .doc-tit .d { font-size: 11.5px; color: #66707d; }
    .meta { display: flex; flex-wrap: wrap; gap: 6px 28px; margin: 18px 0 8px; font-size: 13px; }
    .meta b { color: ${color}; }
    .resumen { display: flex; gap: 12px; margin: 14px 0 18px; }
    .kpi { flex: 1; border: 1px solid #e3e7ec; border-radius: 10px; padding: 10px 12px; }
    .kpi .v { font-size: 18px; font-weight: 700; color: ${color}; }
    .kpi .l { font-size: 11px; color: #66707d; }
    h3 { color: ${color}; font-size: 14px; margin: 22px 0 8px; }
    table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
    th { text-align: left; background: ${color}11; color: ${color}; padding: 8px 10px; font-size: 11px;
      text-transform: uppercase; letter-spacing: .04em; }
    td { padding: 7px 10px; border-bottom: 1px solid #eef1f4; }
    .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .pos { color: #0a7a4a; } .neg { color: #b3372b; }
    .nota { color: #8a929c; font-size: 11px; }
    .mora { color: #b3372b; font-weight: 600; }
    .vacio { text-align: center; color: #99a; padding: 16px; }
    .pie { margin-top: 26px; font-size: 11px; color: #8a929c; text-align: center; border-top: 1px solid #eef1f4; padding-top: 12px; }
    @media print { body { padding: 0 8px; } .no-print { display: none; } }
  </style></head><body>
    <div class="cab">
      <div class="logo">${logo}</div>
      <div>
        <h1>${lib.caja_nombre || "Caja de ahorro"}</h1>
        <div class="sub">Gestión transparente · Kullki por Yachay Deep Labs</div>
      </div>
      <div class="doc-tit"><div class="t">Estado de cuenta</div><div class="d">Emitido el ${hoy}</div></div>
    </div>
    <div class="meta">
      <span><b>Socio:</b> ${s.nombres}</span>
      <span><b>Cédula:</b> ${s.cedula}</span>
      <span><b>Periodo:</b> ${nombrePeriodo(lib, periodo)}</span>
    </div>
    <div class="resumen">
      <div class="kpi"><div class="v">${usd(s.total_aportes)}</div><div class="l">Ahorro neto</div></div>
      <div class="kpi"><div class="v">${usd(s.saldo_credito)}</div><div class="l">Saldo de crédito</div></div>
      <div class="kpi"><div class="v">${usd(s.total_multas)}</div><div class="l">Multas</div></div>
    </div>
    <h3>Movimientos de ahorro</h3>
    <table><thead><tr><th>Fecha</th><th>Concepto</th><th class="num">Ingreso</th><th class="num">Egreso</th><th class="num">Saldo</th></tr></thead>
      <tbody>${filasMov}</tbody></table>
    ${seccionCreditos}
    <div class="pie">Documento generado por Kullki — ${lib.caja_nombre || ""}. La bitácora de la caja respalda cada movimiento.</div>
    <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 250); };</script>
  </body></html>`;

  const w = window.open("", "_blank");
  if (!w) { alert("Permite las ventanas emergentes para descargar el PDF."); return; }
  w.document.write(html); w.document.close();
}
