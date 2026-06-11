// Router mínimo basado en history API (sin dependencias).
import { useEffect, useState } from "react";

export function navigate(path) {
  if (path !== window.location.pathname) window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function useRuta() {
  const [ruta, setRuta] = useState(window.location.pathname);
  useEffect(() => {
    const on = () => setRuta(window.location.pathname);
    window.addEventListener("popstate", on);
    return () => window.removeEventListener("popstate", on);
  }, []);
  return ruta;
}
