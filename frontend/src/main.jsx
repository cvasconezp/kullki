import * as Sentry from "@sentry/react";
const _SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN || "";
if (_SENTRY_DSN) {
  Sentry.init({
    dsn: _SENTRY_DSN,
    tracesSampleRate: 0.2,
    replaysOnErrorSampleRate: 0.5,
  });
}

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")).render(<App />);

// Desinstala service workers previos (el SW causaba pantalla en blanco al refrescar).
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});
  if (window.caches) caches.keys().then((ks) => ks.forEach((k) => caches.delete(k))).catch(() => {});
}
