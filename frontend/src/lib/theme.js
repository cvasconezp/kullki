// Acopla el interfaz a la identidad de cada caja: colores + meta theme-color.
// Si no hay caja activa (landing, login, admin) usa la marca Yachay Deep.
const YD = { primario: "#2E7D6B", acento: "#F2B336" };

function hexToRgb(hex) {
  const h = (hex || "").replace("#", "");
  const v = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(v || "1B3A6B", 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function toHex([r, g, b]) {
  return "#" + [r, g, b].map((x) => Math.round(x).toString(16).padStart(2, "0")).join("");
}
// mezcla un color con blanco (t=1 => blanco) o negro (t<0)
function mix(hex, t) {
  const [r, g, b] = hexToRgb(hex);
  if (t >= 0) return toHex([r + (255 - r) * t, g + (255 - g) * t, b + (255 - b) * t]);
  const k = 1 + t; // oscurecer
  return toHex([r * k, g * k, b * k]);
}

export function applyTheme(caja) {
  const primario = caja?.color_primario || YD.primario;
  const acento = caja?.color_acento || YD.acento;
  const root = document.documentElement.style;
  root.setProperty("--kullki", primario);
  root.setProperty("--kullki-oscuro", mix(primario, -0.22));
  root.setProperty("--kullki-tinte", mix(primario, 0.9));
  root.setProperty("--sara", acento);
  root.setProperty("--borde", "var(--regla)");
  root.setProperty("--texto-suave", "var(--tinta-suave)");
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", primario);
}

export function resetTheme() {
  applyTheme(YD && { color_primario: YD.primario, color_acento: YD.acento });
}

// Logo a mostrar: emoji/letras de la caja, o la inicial de su nombre.
export function logoDe(caja) {
  if (caja?.logo) return caja.logo;
  const n = caja?.caja_nombre || caja?.nombre || "K";
  return n.replace(/^caja (de ahorro )?/i, "").trim().charAt(0).toUpperCase() || "K";
}
