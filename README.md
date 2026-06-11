# Kullki — Gestión transparente de cajas de ahorro comunitarias

**Yachay Deep Labs · Pacha Tech**

Kullki ("dinero" en kichwa) reemplaza el Excel del tesorero por un sistema donde
cada movimiento queda registrado, auditado y visible para todos los socios.

## Qué resuelve

- **Registro confiable**: aportes (ordinarios, extraordinarios, multas) y créditos
  con tabla de amortización generada automáticamente (sistema francés, cuota fija).
- **Transparencia**: bitácora de auditoría inmutable visible para **todos** los socios,
  no solo para el tesorero.
- **Consulta del socio**: cada socio entra con su cédula y ve su libreta —
  aportes acumulados, créditos, próximas cuotas — desde el celular.
- **Multi-caja (SaaS)**: una sola instancia sirve a muchas cajas, con aislamiento
  estricto por `caja_id` en cada consulta.

## Roles

| Rol | Puede |
|---|---|
| `superadmin` | Crear cajas y su tesorero (Pacha Tech) |
| `tesorero` | Gestionar socios, aportes, créditos y cobros de su caja |
| `socio` | Ver su libreta y la bitácora de su caja |

## Stack

- **Backend**: FastAPI + SQLAlchemy 2 + PostgreSQL (Railway). JWT, auditoría, multi-tenant.
- **Frontend**: React + Vite, mobile-first, sin dependencias pesadas (Vercel).

## Desarrollo local

```bash
# Backend (usa SQLite si no hay DATABASE_URL)
cd backend
pip install -r requirements.txt
python -m app.seed          # datos de demostración
uvicorn app.main:app --reload

# Frontend
cd frontend
npm install
npm run dev                 # http://localhost:5173
```

Credenciales demo: tesorera `1700000000` / `tesorera123`.
Socios: su cédula (`1700000001` … `1700000012`) como usuario y contraseña.
Superadmin por defecto: `admin` / `kullki2026` (cámbialo con variables de entorno).

## Despliegue

### 1. GitHub
```bash
cd kullki
git init && git add . && git commit -m "Kullki v0.1 — Yachay Deep Labs"
git remote add origin git@github.com:TU_USUARIO/kullki.git
git push -u origin main
```

### 2. Railway (backend + PostgreSQL)
1. New Project → Deploy from GitHub repo → carpeta raíz: `backend/`.
2. Add → Database → PostgreSQL (Railway inyecta `DATABASE_URL`).
3. Variables del servicio backend:
   - `SECRET_KEY`: una cadena larga aleatoria
   - `SUPERADMIN_CEDULA` y `SUPERADMIN_PASSWORD`
   - `CORS_ORIGINS`: `https://kullki.yachaydeep.com`
4. Settings → Networking → Generate Domain. Copia la URL (ej. `kullki-api.up.railway.app`).

### 3. Vercel (frontend)
1. Import del mismo repo → Root Directory: `frontend/`.
2. Variable de entorno: `VITE_API_URL` = `https://kullki-api.up.railway.app` (tu URL de Railway).
3. Deploy. Luego: Settings → Domains → `kullki.yachaydeep.com`.

### 4. DNS
En tu proveedor del dominio yachaydeep.com:
`CNAME  kullki  →  cname.vercel-dns.com`

## Estructura

```
kullki/
├── backend/
│   ├── app/
│   │   ├── main.py        # FastAPI, CORS, superadmin inicial
│   │   ├── models.py      # Caja, Usuario, Socio, Aporte, Crédito, Cuota, Auditoría
│   │   ├── routers.py     # auth, cajas, socios, aportes, créditos, reportes
│   │   ├── auth.py        # JWT, roles, hash PBKDF2, log de auditoría
│   │   ├── schemas.py
│   │   └── seed.py        # caja demo
│   ├── requirements.txt
│   ├── Procfile
│   └── railway.json
└── frontend/
    ├── src/
    │   ├── App.jsx        # navegación por rol
    │   ├── pages/         # Login, Dashboard, Socios, Aportes, Créditos, Libreta, Bitácora, Cajas
    │   ├── lib/api.js
    │   └── styles.css     # sistema de diseño "libreta"
    └── vercel.json
```

## Implementado en v0.2

- **Retiros de ahorro** con doble validación: no más que el ahorro del socio,
  y si tiene crédito activo su ahorro respalda la deuda.
- **Abonos parciales** a cuotas (imputados primero al interés) con cobro del restante.
- **Multa por mora automática** y configurable por caja (se aplica una sola vez
  por cuota, en el primer abono tras el vencimiento). Las multas van al fondo
  común, no al ahorro del socio.
- **Informe de asamblea imprimible** (botón Imprimir/PDF): estado de la caja +
  detalle por socio + simulación de cierre de ejercicio (reparto de intereses
  proporcional al ahorro).
- **PWA instalable** (manifest + ícono): "Agregar a pantalla de inicio" en el celular.

## Hoja de ruta

- Notificación de cuota próxima por WhatsApp (requiere credenciales Meta/Twilio)
- Service worker offline-first para asambleas sin señal
- Registro formal del cierre de ejercicio (capitalizar o pagar utilidades)
