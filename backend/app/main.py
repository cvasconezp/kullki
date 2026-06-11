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
            Base.metadata.drop_all(bind=engine)

    Base.metadata.create_all(bind=engine)
    # Superadmin inicial desde variables de entorno
    ced = os.getenv("SUPERADMIN_CEDULA", "admin")
    pwd = os.getenv("SUPERADMIN_PASSWORD", "kullki2026")
    db = SessionLocal()
    try:
        if not db.scalar(select(models.Usuario).where(models.Usuario.es_superadmin)):
            db.add(models.Usuario(nombre="Administrador Kullki", cedula=ced,
                                  password_hash=hash_password(pwd), es_superadmin=True))
            db.commit()
    finally:
        db.close()
