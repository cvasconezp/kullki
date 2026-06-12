import { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { navigate } from "../lib/router.js";

export default function Campana({ slug }) {
  const [n, setN] = useState({ total: 0 });
  useEffect(() => {
    let vivo = true;
    const carga = () => api("/notificaciones").then((r) => { if (vivo) setN(r); }).catch(() => {});
    carga();
    const t = setInterval(carga, 60000);
    const onFocus = () => carga();
    window.addEventListener("focus", onFocus);
    return () => { vivo = false; clearInterval(t); window.removeEventListener("focus", onFocus); };
  }, []);
  const total = n.total || 0;
  const destino = (n.solicitudes_credito || 0) > 0 ? "creditos" : "socios";
  const titulo = total ? `${n.solicitudes_credito || 0} crédito(s) y ${n.solicitudes_datos || 0} dato(s) por revisar` : "Sin notificaciones";
  return (
    <button className="campana" onClick={() => navigate(`/${slug}/${destino}`)} title={titulo} aria-label="Notificaciones">
      🔔{total > 0 && <span className="campana-badge">{total > 9 ? "9+" : total}</span>}
    </button>
  );
}
