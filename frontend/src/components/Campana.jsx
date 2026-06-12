import { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { navigate } from "../lib/router.js";

export default function Campana({ slug }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let vivo = true;
    const carga = () => api("/socios/solicitudes").then((l) => { if (vivo) setN(l.length); }).catch(() => {});
    carga();
    const t = setInterval(carga, 60000);
    const onFocus = () => carga();
    window.addEventListener("focus", onFocus);
    return () => { vivo = false; clearInterval(t); window.removeEventListener("focus", onFocus); };
  }, []);
  return (
    <button className="campana" onClick={() => navigate(`/${slug}/socios`)}
      title={n > 0 ? `${n} solicitud(es) por revisar` : "Sin notificaciones"} aria-label="Notificaciones">
      🔔{n > 0 && <span className="campana-badge">{n > 9 ? "9+" : n}</span>}
    </button>
  );
}
