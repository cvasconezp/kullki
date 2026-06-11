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
    Base.metadata.create_all(bind=engine)
    # Superadmin inicial desde variables de entorno
    ced = os.getenv("SUPERADMIN_CEDULA", "admin")
    pwd = os.getenv("SUPERADMIN_PASSWORD", "kullki2026")
    db = SessionLocal()
    try:
        if not db.scalar(select(models.Usuario).where(models.Usuario.rol == "superadmin")):
            db.add(models.Usuario(nombre="Administrador Kullki", cedula=ced,
                                  password_hash=hash_password(pwd), rol="superadmin"))
            db.commit()
    finally:
        db.close()
