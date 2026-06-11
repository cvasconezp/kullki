import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from .database import Base, engine, SessionLocal
from . import models
from .auth import hash_password
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

        # Superadmin inicial desde variables de entorno
        ced = os.getenv("SUPERADMIN_CEDULA", "admin")
        pwd = os.getenv("SUPERADMIN_PASSWORD", "kullki2026")
        db = SessionLocal()
        try:
            if not db.scalar(select(models.Usuario).where(models.Usuario.es_superadmin)):
                db.add(models.Usuario(nombre="Administrador Kullki", cedula=ced,
                                      password_hash=hash_password(pwd), es_superadmin=True))
                db.commit()
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
        finally:
            db.close()
    except Exception:
        # Nunca tumbar el arranque por un error de init: la app debe responder
        # al healthcheck. El error queda en logs para diagnóstico.
        log.exception("Fallo en init_db (la app arranca igual)")
