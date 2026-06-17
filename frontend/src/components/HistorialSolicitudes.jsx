import { useEffect, useState } from "react";
import { api, usd, fechaCorta } from "../lib/api.js";

const EST = {
  garantes:      ["Esperando garantes",         "neutro"],
  pendiente:     ["En revisión (tesorero)",      "neutro"],
  en_aprobacion: ["En aprobación (directiva)",   "neutro"],
  correccion:    ["Por corregir",                "mora"  ],
  aprobada:      ["Aprobada",                    "ok"    ],
  rechazada:     ["Rechazada",                   "mora"  ],
};
const RESP = {
  aceptado:  ["aceptaste",    "ok"    ],
  rechazado: ["rechazaste",   "mora"  ],
  pendiente: ["por responder","neutro"],
};

export default function HistorialSolicitudes({ url, titulo, modo = "socio", abierto = false }) {
  const [items, setItems] = useState(null);
  useEffect(() => { api(url).then(setItems).catch(() => setItems([])); }, [url]);

  const badge = (e) => {
    const [t, c] = EST[e] || [e, "neutro"];
    return <span className={"pill " + c}>{t}</span>;
  };

  return (
    <div className="tarjeta">
      <details open={abierto}>
        <summary><strong>{titulo}</strong>{items ? ` (${items.length})` : ""}</summary>
        {!items && <div className="vacio">Cargando…</div>}
        {items && items.length === 0 && <div className="vacio">Sin registros todavía.</div>}
        {items && items.map((s) => (
          <div key={s.id} style={{ borderBottom: "1px dashed var(--regla)", padding: "8px 0" }}>
            <div className="fila" style={{ alignItems: "flex-start" }}>
              <div>
                <div className="principal">
                  {modo === "garante" ? s.solicitante : (s.socio_nombre || "Crédito")} · {usd(s.monto)} · {s.plazo_meses} meses
                </div>
                <div className="detalle">
                  {s.tipo === "emergente" ? "emergente · " : ""}{s.destino || "sin destino"} · {fechaCorta(s.creado_en)}
                  {modo === "garante" && (() => {
                    const [t, c] = RESP[s.mi_respuesta] || [s.mi_respuesta, "neutro"];
                    return <> · <span className={"pill " + c}>{t}</span></>;
                  })()}
                </div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>{badge(s.estado)}</div>
            </div>
            {/* Motivo de rechazo o corrección */}
            {s.motivo && (
              <div className="detalle" style={{ color: "var(--cochinilla)", marginTop: 4 }}>
                💬 {s.motivo}
              </div>
            )}
          </div>
        ))}
      </details>
    </div>
  );
}
