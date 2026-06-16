import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from .database import Base, engine, SessionLocal
from . import models
from .auth import hash_password, verify_password
from .routers import (auth_router, cajas_router, socios_router, aportes_router,
                      creditos_router, retiros_router, reportes_router)

app = FastAPI(title="Kullki API", version="0.1.0",
              description="Gestión transparente de cajas de ahorro comunitarias — Yachay Deep Labs")

origins = [o.strip() for o in os.getenv(
    "CORS_ORIGINS",
    "http://localhost:5173,https://kullki.yachaydeep.com"
).split(",") if o.strip()]

app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])


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
          creditos_router, retiros_router, reportes_router):
    app.include_router(r)


@app.get("/")
def root():
    return {"app": "Kullki", "by": "Yachay Deep Labs", "status": "ok"}


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
                if "rol" in cols or "membresias" not in tablas:
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
                log.warning("Esquema viejo detectado: base recreada para multi-membresía.")

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
        _add_cols("cajas", {"credito_max": "FLOAT DEFAULT 0", "encaje_factor": "FLOAT DEFAULT 0"})
        _add_cols("creditos", {"garante": "VARCHAR(160) DEFAULT ''"})
        _add_cols("cajas", {"permite_retiros": "BOOLEAN DEFAULT TRUE", "dia_corte": "INTEGER DEFAULT 0",
                            "multa_atraso": "FLOAT DEFAULT 0"})
        _add_cols("creditos", {"tipo": "VARCHAR(20) DEFAULT 'ordinario'"})
        _add_cols("solicitudes_credito", {"garante2": "VARCHAR(160) DEFAULT ''",
                            "tipo": "VARCHAR(20) DEFAULT 'ordinario'",
                            "documento_nombre": "VARCHAR(160) DEFAULT ''", "documento_b64": "TEXT",
                            "garante_id": "INTEGER", "garante2_id": "INTEGER",
                            "garante_estado": "VARCHAR(20) DEFAULT 'pendiente'",
                            "garante2_estado": "VARCHAR(20) DEFAULT ''"})
        _add_cols("usuarios", {"totp_secret": "VARCHAR(64) DEFAULT ''", "totp_activo": "BOOLEAN DEFAULT FALSE"})

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
