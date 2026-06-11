const BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

export function getSesion() {
  try { return JSON.parse(localStorage.getItem("kullki_sesion")) || null; }
  catch { return null; }
}
export function setSesion(s) {
  if (s) localStorage.setItem("kullki_sesion", JSON.stringify(s));
  else localStorage.removeItem("kullki_sesion");
}

// Sesión original del superadmin mientras "actúa como" tesorero/socio
export function getAdminSesion() {
  try { return JSON.parse(localStorage.getItem("kullki_admin")) || null; }
  catch { return null; }
}
export function setAdminSesion(s) {
  if (s) localStorage.setItem("kullki_admin", JSON.stringify(s));
  else localStorage.removeItem("kullki_admin");
}

export async function api(path, { method = "GET", body, token } = {}) {
  const sesion = getSesion();
  // token explícito (selección de caja) tiene prioridad sobre el de la sesión
  const bearer = token || sesion?.access_token;
  const res = await fetch(BASE + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    // Solo cerramos sesión si había una sesión activa (token vencido en una
    // petición autenticada). En el login/selección de caja mostramos el error
    // real del servidor (p. ej. "Cédula o contraseña incorrecta").
    const sesionPrevia = !!sesion?.access_token;
    if (sesionPrevia && !token) {
      setSesion(null);
      setAdminSesion(null);
      window.location.href = "/ingresar";
      throw new Error("Tu sesión expiró. Inicia sesión de nuevo.");
    }
    throw new Error(data.detail || "Cédula o contraseña incorrecta");
  }
  if (!res.ok) throw new Error(data.detail || "Algo salió mal, intenta de nuevo");
  return data;
}

export const usd = (n) =>
  "$" + Number(n || 0).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fechaCorta = (f) => {
  if (!f) return "—";
  const [y, m, d] = f.split("T")[0].split("-");
  const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${d} ${meses[+m - 1]} ${y}`;
};
