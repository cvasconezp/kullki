import os
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from sqlalchemy import select

from .database import Base, engine, SessionLocal
from . import models
from .auth import hash_password, verify_password
from .routers import (auth_router, cajas_router, socios_router, aportes_router,
                      creditos_router, retiros_router, reportes_router)
from .importar import router as import_router

limiter = Limiter(key_func=get_remote_address, default_limits=["120/minute"])

# ── Sentry (opcional) ────────────────────────────────────────────────────────
import os as _os
_SENTRY_DSN = _os.getenv("SENTRY_DSN", "")
if _SENTRY_DSN:
    import sentry_sdk
    from sentry_sdk.integrations.fastapi import FastApiIntegration
    from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration
    sentry_sdk.init(
        dsn=_SENTRY_DSN,
        integrations=[FastApiIntegration(), SqlalchemyIntegration()],
        traces_sample_rate=0.2,
        send_default_pii=False,
    )

app = FastAPI(title="Kullki API", version="0.1.0",
              description="Gestión transparente de cajas de ahorro comunitarias — Yachay Deep Labs")

origins = [o.strip() for o in os.getenv(
    "CORS_ORIGINS",
    "http://localhost:5173,https://kullki.yachaydeep.com"
).split(",") if o.strip()]

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])


@app.middleware("http")
async def rate_limit_auth(request: Request, call_next):
    """Límite estricto en endpoints de autenticación: 20 req/min por IP."""
    import time
    path = request.url.path
    if path.startswith("/auth/"):
        client_ip = request.client.host if request.client else "unknown"
        key = f"rl:auth:{client_ip}"
        # Simple in-memory counter — suficiente para Railway (single instance)
        store = getattr(app.state, "_rl_store", {})
        app.state._rl_store = store
        now = time.time()
        bucket = store.get(key, {"count": 0, "reset": now + 60})
        if now > bucket["reset"]:
            bucket = {"count": 0, "reset": now + 60}
        bucket["count"] += 1
        store[key] = bucket
        if bucket["count"] > 20:
            return JSONResponse(
                status_code=429,
                content={"detail": "Demasiadas peticiones. Intenta en un minuto."},
                headers={"Retry-After": "60"}
            )
    return await call_next(request)


@app.middleware("http")
async def cabeceras_seguridad(request, call_next):
    resp = await call_next(request)
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["X-Frame-Options"] = "DENY"
    resp.headers["Referrer-Policy"] = "no-referrer"
    resp.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    resp.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return resp

for r in (auth_router, cajas_router, socios_router, aportes_router,
          creditos_router, retiros_router, reportes_router, import_router):
    app.include_router(r)


@app.get("/")
def root():
    return {"app": "Kullki", "by": "Yachay Deep Labs", "status": "ok"}




# ── Multas automáticas (APScheduler) ─────────────────────────────────────────
def _aplicar_multas_automaticas():
    """Corre diariamente. Aplica multas a socios sin aporte en cajas donde
    hoy coincide con el día de corte y multa_atraso > 0. Idempotente: si ya
    se registraron multas este mes para una caja, no las duplica."""
    from datetime import datetime, timedelta, timezone, date
    import logging
    _log = logging.getLogger("kullki.multas_auto")
    _TZ_EC = timezone(timedelta(hours=-5))
    hoy = datetime.now(_TZ_EC).date()

    db = SessionLocal()
    try:
        cajas = db.scalars(
            select(models.Caja).where(
                models.Caja.activa.is_(True),
                models.Caja.dia_corte > 0,
                models.Caja.multa_atraso > 0,
            )
        ).all()
        for caja in cajas:
            if hoy.day != caja.dia_corte:
                continue  # no es el día de corte de esta caja
            inicio_mes = hoy.replace(day=1)
            # Idempotencia: si ya hay multas de atraso este mes, saltar
            ya_aplicadas = db.scalar(
                select(models.Aporte.id).where(
                    models.Aporte.caja_id == caja.id,
                    models.Aporte.tipo == "multa",
                    models.Aporte.nota == "Multa automática por atraso en aporte",
                    models.Aporte.fecha >= inicio_mes,
                )
            )
            if ya_aplicadas:
                _log.info(f"Caja {caja.nombre}: multas de {hoy.strftime('%B %Y')} ya aplicadas.")
                continue
            # Socios activos sin aporte ordinario este mes
            ids_con_aporte = set(db.scalars(
                select(models.Aporte.socio_id).where(
                    models.Aporte.caja_id == caja.id,
                    models.Aporte.fecha >= inicio_mes,
                    models.Aporte.fecha < hoy,
                    models.Aporte.tipo == "ordinario",
                    models.Aporte.anulado.is_(False),
                )
            ).all())
            socios = db.scalars(
                select(models.Socio).where(
                    models.Socio.caja_id == caja.id,
                    models.Socio.activo.is_(True),
                )
            ).all()
            aplicadas = 0
            for socio in socios:
                if socio.id not in ids_con_aporte:
                    db.add(models.Aporte(
                        socio_id=socio.id,
                        caja_id=caja.id,
                        monto=caja.multa_atraso,
                        tipo="multa",
                        fecha=hoy,
                        nota="Multa automática por atraso en aporte",
                        registrado_por=1,  # sistema
                    ))
                    aplicadas += 1
            if aplicadas:
                db.commit()
                _log.info(f"Caja '{caja.nombre}': {aplicadas} multas automáticas de ${caja.multa_atraso:.2f} aplicadas.")
    except Exception as e:
        _log.error(f"Error en multas automáticas: {e}")
    finally:
        db.close()

@app.on_event("startup")
def init_db():
    import logging
    log = logging.getLogger("kullki.init")
    try:
        # Auto-recreación si se detecta el esquema VIEJO (antes de membresías).
        # Acordado: la base de producción solo tiene datos demo. Si la tabla
        # 'usuarios' aún tiene la columna 'rol' o NO existe 'membresias',
        # se borra y se crea el esquema nuevo. Controlado por RESET_SCHEMA != "0".
        if os.getenv("RESET_SCHEMA", "1") != "0":
            from sqlalchemy import inspect
            insp = inspect(engine)
            tablas = insp.get_table_names()
            esquema_viejo = False
            if "usuarios" in tablas:
                cols = {c["name"] for c in insp.get_columns("usuarios")}
                # "rol"/sin membresias = esquema pre-membresías; sin "cedula_bidx" =
                # esquema previo al cifrado en reposo. En ambos casos hay que recrear.
                if "rol" in cols or "membresias" not in tablas or "cedula_bidx" not in cols:
                    esquema_viejo = True
            if esquema_viejo:
                from sqlalchemy import text
                if engine.dialect.name == "postgresql":
                    # drop_all falla por el orden de las FK; recrear el schema es atómico
                    with engine.begin() as conn:
                        conn.execute(text("DROP SCHEMA public CASCADE"))
                        conn.execute(text("CREATE SCHEMA public"))
                else:
                    Base.metadata.drop_all(bind=engine)
                log.warning("Esquema previo detectado (pre-membresías o pre-cifrado): base recreada.")

        Base.metadata.create_all(bind=engine)

        # Migración ligera e idempotente: añade columnas nuevas a 'cajas' si faltan
        # (create_all no altera tablas existentes). Evita tener que recrear la base.
        from sqlalchemy import inspect, text
        insp = inspect(engine)
        if "cajas" in insp.get_table_names():
            existentes = {c["name"] for c in insp.get_columns("cajas")}
            nuevas = {
                "color_primario": "VARCHAR(9) DEFAULT '#1B3A6B'",
                "color_acento": "VARCHAR(9) DEFAULT '#E8A838'",
                "logo": "VARCHAR(8) DEFAULT ''",
                "logo_url": "TEXT DEFAULT ''",
            }
            with engine.begin() as conn:
                for col, ddl in nuevas.items():
                    if col not in existentes:
                        conn.execute(text(f"ALTER TABLE cajas ADD COLUMN {col} {ddl}"))
                        log.warning("Columna '%s' añadida a 'cajas'.", col)

        # Ficha ampliada del socio + bandera de anulación en movimientos
        def _add_cols(tabla, cols):
            if tabla not in insp.get_table_names():
                return
            existe = {c["name"] for c in insp.get_columns(tabla)}
            with engine.begin() as conn:
                for col, ddl in cols.items():
                    if col not in existe:
                        conn.execute(text(f"ALTER TABLE {tabla} ADD COLUMN {col} {ddl}"))
                        log.warning("Columna '%s' añadida a '%s'.", col, tabla)
        _add_cols("socios", {
            "fecha_nacimiento": "DATE", "genero": "VARCHAR(20) DEFAULT ''",
            "correo": "VARCHAR(120) DEFAULT ''", "whatsapp": "VARCHAR(20) DEFAULT ''",
            "direccion": "VARCHAR(200) DEFAULT ''", "ocupacion": "VARCHAR(120) DEFAULT ''",
            "estado_civil": "VARCHAR(20) DEFAULT ''", "nivel_instruccion": "VARCHAR(30) DEFAULT ''",
            "num_cargas": "INTEGER DEFAULT 0", "contacto_emergencia": "VARCHAR(160) DEFAULT ''",
        })
        _add_cols("aportes", {"anulado": "BOOLEAN DEFAULT FALSE"})
        _add_cols("retiros", {"anulado": "BOOLEAN DEFAULT FALSE"})
        _add_cols("usuarios", {"debe_cambiar_password": "BOOLEAN DEFAULT FALSE",
                               "ultimo_acceso": "TIMESTAMP"})
        _add_cols("cajas", {"transparencia_total": "BOOLEAN DEFAULT FALSE"})
        _add_cols("auditoria", {"afecta_socio_id": "INTEGER"})
        _add_cols("socios", {"consentimiento_datos": "BOOLEAN DEFAULT FALSE",
                             "consentimiento_fecha": "DATE"})
        _add_cols("cajas", {"credito_max": "FLOAT DEFAULT 0", "credito_emergente_max": "FLOAT DEFAULT 0", "credito_emergente_plazo": "INTEGER DEFAULT 0", "encaje_factor": "FLOAT DEFAULT 0"})
        _add_cols("creditos", {"garante": "VARCHAR(160) DEFAULT ''"})
        _add_cols("cajas", {"permite_retiros": "BOOLEAN DEFAULT TRUE", "dia_corte": "INTEGER DEFAULT 0",
                            "multa_atraso": "FLOAT DEFAULT 0"})
        _add_cols("creditos", {"tipo": "VARCHAR(20) DEFAULT 'ordinario'"})
        # Importador de datos
        with engine.begin() as conn:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS import_lotes (
                    id SERIAL PRIMARY KEY,
                    caja_id INTEGER NOT NULL REFERENCES cajas(id),
                    usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
                    entidad VARCHAR(20) NOT NULL,
                    archivo VARCHAR(200) DEFAULT '',
                    estado VARCHAR(20) DEFAULT 'procesando',
                    importados INTEGER DEFAULT 0,
                    omitidos INTEGER DEFAULT 0,
                    resumen VARCHAR(2000) DEFAULT '',
                    creado_en TIMESTAMP DEFAULT NOW()
                )
            """))
        _add_cols("socios",   {"import_lote_id": "INTEGER REFERENCES import_lotes(id)"})
        _add_cols("aportes",  {"import_lote_id": "INTEGER REFERENCES import_lotes(id)"})
        _add_cols("creditos", {"import_lote_id": "INTEGER REFERENCES import_lotes(id)"})
        _add_cols("solicitudes_credito", {"garante2": "VARCHAR(160) DEFAULT ''",
                            "tipo": "VARCHAR(20) DEFAULT 'ordinario'",
                            "documento_nombre": "VARCHAR(160) DEFAULT ''", "documento_b64": "TEXT",
                            "garante_id": "INTEGER", "garante2_id": "INTEGER",
                            "garante_estado": "VARCHAR(20) DEFAULT 'pendiente'",
                            "garante2_estado": "VARCHAR(20) DEFAULT ''"})
        _add_cols("usuarios", {"totp_secret": "VARCHAR(64) DEFAULT ''", "totp_activo": "BOOLEAN DEFAULT FALSE", "pin_hash": "VARCHAR(128) DEFAULT ''"})
        # Cifrado en reposo: columna de blind index para búsqueda/unicidad de cédula
        _add_cols("usuarios", {"cedula_bidx": "VARCHAR(64)"})
        _add_cols("socios", {"cedula_bidx": "VARCHAR(64)"})
        _add_cols("cajas", {"permite_eco_ahorro": "BOOLEAN DEFAULT FALSE", "permite_mascotas": "BOOLEAN DEFAULT FALSE", "permite_inversiones": "BOOLEAN DEFAULT FALSE", "permite_credito_educativo": "BOOLEAN DEFAULT FALSE"})
        _add_cols("cajas", {"tipo_caja": "VARCHAR(20) DEFAULT 'normal'"})
        # Crear tabla egresos si no existe
        with engine.begin() as conn:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS egresos (
                    id SERIAL PRIMARY KEY,
                    caja_id INTEGER NOT NULL REFERENCES cajas(id),
                    monto FLOAT NOT NULL,
                    concepto VARCHAR(200) DEFAULT '',
                    fecha DATE NOT NULL,
                    registrado_por INTEGER NOT NULL REFERENCES usuarios(id),
                    creado_en TIMESTAMP DEFAULT NOW(),
                    anulado BOOLEAN DEFAULT FALSE
                )
            """))
        # Normalizar NULLs en cajas (filas anteriores a la migración)
        with engine.begin() as conn:
            conn.execute(text("""
                UPDATE cajas SET
                  tipo_caja = COALESCE(tipo_caja, 'normal'),
                  multa_atraso = COALESCE(multa_atraso, 0),
                  dia_corte = COALESCE(dia_corte, 0),
                  encaje_factor = COALESCE(encaje_factor, 0),
                  credito_max = COALESCE(credito_max, 0),
                  credito_emergente_max = COALESCE(credito_emergente_max, 0),
                  credito_emergente_plazo = COALESCE(credito_emergente_plazo, 0),
                  logo_url = COALESCE(logo_url, ''),
                  logo = COALESCE(logo, ''),
                  color_primario = COALESCE(color_primario, '#1B3A6B'),
                  color_acento = COALESCE(color_acento, '#E8A838')
            """))
            log.info("NULLs en cajas normalizados.")

        # Superadmin inicial desde variables de entorno
        # Chequeo de configuración de seguridad
        if os.getenv("SECRET_KEY") in (None, "", "kullki-dev-secret-cambiar-en-produccion"):
            log.critical("SEGURIDAD: SECRET_KEY no está configurada (usando default). "
                         "Configura SECRET_KEY en producción para evitar falsificación de tokens.")
        if not os.getenv("SUPERADMIN_PASSWORD"):
            log.critical("SEGURIDAD: SUPERADMIN_PASSWORD no está configurada (usando default).")
        ced = os.getenv("SUPERADMIN_CEDULA", "admin")
        pwd = os.getenv("SUPERADMIN_PASSWORD", "kullki2026")
        db = SessionLocal()
        try:
            sa = db.scalar(select(models.Usuario).where(models.Usuario.es_superadmin))
            if not sa:
                db.add(models.Usuario(nombre="Administrador Kullki", cedula=ced,
                                      password_hash=hash_password(pwd), es_superadmin=True))
                db.commit()
            else:
                # Variables de entorno como fuente de verdad: si cambian, se actualiza el admin.
                cambio = False
                if os.getenv("SUPERADMIN_CEDULA") and sa.cedula != ced:
                    sa.cedula = ced; cambio = True
                if os.getenv("SUPERADMIN_PASSWORD") and not verify_password(pwd, sa.password_hash):
                    sa.password_hash = hash_password(pwd); sa.debe_cambiar_password = False; cambio = True
                if not sa.activo:
                    sa.activo = True; cambio = True
                if cambio:
                    db.commit()
                    log.warning("Credenciales del superadmin sincronizadas desde variables de entorno.")
            # Auto-siembra de datos demo SOLO si no hay ninguna caja (base vacía).
            # Nunca toca datos reales existentes. Desactivable con SEED_DEMO=0.
            if (os.getenv("SEED_DEMO", "1") != "0"
                    and not db.scalar(select(models.Caja))):
                try:
                    from .seed import run as seed_demo
                    seed_demo()
                    log.warning("Base vacía: datos demo sembrados (tesorera 1700000000 / "
                                "socios con su cédula como usuario y contraseña).")
                except Exception:
                    log.exception("Auto-seed demo falló (no crítico).")
            # Enriquecer la caja demo existente con datos demográficos (idempotente)
            if os.getenv("SEED_DEMO", "1") != "0":
                try:
                    from .seed import enriquecer_demo
                    enriquecer_demo()
                except Exception:
                    log.exception("Enriquecer demo falló (no crítico).")
        finally:
            db.close()
    except Exception:
        # Nunca tumbar el arranque por un error de init: la app debe responder
        # al healthcheck. El error queda en logs para diagnóstico.
        log.exception("Fallo en init_db (la app arranca igual)")
    try:
        from .backup import iniciar_scheduler
        iniciar_scheduler()
    except Exception:
        log.exception("No se pudo iniciar el scheduler de respaldos")
