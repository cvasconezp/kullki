import { useState, useEffect, useRef } from "react";

/**
 * Reemplaza un <select> de socios con un campo de búsqueda en tiempo real.
 * Filtra por nombre o por los primeros dígitos de cédula.
 */
export default function BuscadorSocio({ socios, value, onChange, placeholder = "Buscar socio…", disabled = false }) {
  const [query, setQuery]   = useState("");
  const [open, setOpen]     = useState(false);
  const ref                 = useRef(null);

  const seleccionado = socios.find((s) => String(s.id) === String(value));
  const filtrados    = query.trim()
    ? socios.filter((s) =>
        s.nombres.toLowerCase().includes(query.toLowerCase()) ||
        (s.cedula && s.cedula.startsWith(query))
      )
    : socios;

  // Cerrar al hacer clic fuera
  useEffect(() => {
    const fn = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  const mostrarTexto = open ? query : (seleccionado ? seleccionado.nombres : "");

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <input
        type="text"
        value={mostrarTexto}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        onFocus={() => { setOpen(true); setQuery(""); }}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        style={{
          width: "100%", padding: "9px 12px",
          border: "1px solid var(--regla)", borderRadius: 8,
          fontFamily: "var(--cuerpo)", fontSize: 14,
          background: disabled ? "var(--fondo)" : "var(--carta)",
          color: "var(--tinta)",
          outline: open ? "2px solid var(--kullki)" : "none",
        }}
      />
      {/* Flecha */}
      <span style={{
        position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
        pointerEvents: "none", color: "var(--tinta-suave)", fontSize: 12,
      }}>{open ? "▲" : "▼"}</span>

      {open && !disabled && (
        <div style={{
          position: "absolute", zIndex: 999, top: "calc(100% + 4px)", left: 0, right: 0,
          background: "var(--carta)", border: "1px solid var(--regla)", borderRadius: 10,
          maxHeight: 240, overflowY: "auto",
          boxShadow: "0 6px 20px rgba(0,0,0,.13)",
        }}>
          {filtrados.length === 0 ? (
            <div style={{ padding: "12px", color: "var(--tinta-suave)", fontSize: 13 }}>Sin resultados</div>
          ) : filtrados.map((s) => (
            <div
              key={s.id}
              onMouseDown={(e) => { e.preventDefault(); onChange(String(s.id)); setOpen(false); setQuery(""); }}
              style={{
                padding: "9px 12px", cursor: "pointer", fontSize: 14,
                background: String(s.id) === String(value) ? "var(--kullki-tinte)" : "transparent",
                borderBottom: "1px solid var(--regla)",
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}
            >
              <span>{s.nombres}</span>
              {s.cedula && (
                <span style={{ color: "var(--tinta-suave)", fontSize: 11 }}>
                  {s.cedula.slice(0, 3)}···
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
