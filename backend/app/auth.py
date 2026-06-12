import os, hashlib, secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.orm import Session
from .database import get_db
from . import models

SECRET_KEY = os.getenv("SECRET_KEY", "kullki-dev-secret-cambiar-en-produccion")
ALGORITHM = "HS256"
TOKEN_HOURS = 12

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def hash_password(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    h = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100_000).hex()
    return f"{salt}${h}"


def verify_password(password: str, stored: str) -> bool:
    try:
        salt, _ = stored.split("$", 1)
    except ValueError:
        return False
    return secrets.compare_digest(hash_password(password, salt), stored)


# ---------------------------------------------------------------------------
# Actor: "quién eres + en qué caja + con qué rol estás actuando ahora".
# Reemplaza al antiguo `user` en los routers exponiendo las MISMAS propiedades
# (.id, .nombre, .rol, .caja_id, .socio_id) para no reescribir cada endpoint.
# ---------------------------------------------------------------------------
@dataclass
class Actor:
    usuario: models.Usuario
    rol: str                       # superadmin | tesorero | socio
    caja_id: int | None = None     # caja activa de esta sesión (None para superadmin)
    socio_id: int | None = None    # ficha de socio en esa caja, si aplica

    @property
    def id(self) -> int:
        return self.usuario.id

    @property
    def nombre(self) -> str:
        return self.usuario.nombre


def create_token(user: models.Usuario, caja_id: int | None = None,
                 rol: str | None = None, socio_id: int | None = None,
                 impersonando: bool = False) -> str:
    """Token de identidad. Si caja_id/rol vienen dados, la sesión ya quedó
    'anclada' a una caja (login con caja elegida o membresía única).
    `impersonando=True` lo emite el superadmin para actuar como tesorero/socio."""
    payload = {
        "sub": str(user.id),
        "caja_id": caja_id,
        "rol": rol,
        "socio_id": socio_id,
        "imp": impersonando,
        "exp": datetime.now(timezone.utc) + timedelta(hours=TOKEN_HOURS),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def membresias_activas(db: Session, user: models.Usuario) -> list[models.Membresia]:
    return db.scalars(
        select(models.Membresia)
        .where(models.Membresia.usuario_id == user.id, models.Membresia.activo)
    ).all()


def get_actor(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> Actor:
    """Reconstruye el Actor desde el token, validando que la membresía siga vigente."""
    cred_exc = HTTPException(status.HTTP_401_UNAUTHORIZED, "Sesión inválida o expirada")
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = int(payload["sub"])
    except Exception:
        raise cred_exc
    user = db.get(models.Usuario, user_id)
    if not user or not user.activo:
        raise cred_exc

    if user.es_superadmin:
        # Impersonación: el admin entró a una caja como tesorero/socio.
        if payload.get("imp") and payload.get("rol") and payload.get("caja_id"):
            return Actor(usuario=user, rol=payload["rol"],
                         caja_id=payload["caja_id"], socio_id=payload.get("socio_id"))
        return Actor(usuario=user, rol="superadmin", caja_id=None, socio_id=None)

    caja_id = payload.get("caja_id")
    if caja_id is None:
        # Token sin caja anclada: el usuario aún no eligió caja. Solo puede
        # llamar a endpoints que no requieren rol (p. ej. /auth/mis-cajas).
        raise HTTPException(status.HTTP_409_CONFLICT,
                            "Debes seleccionar una caja para continuar")
    # Validar que la membresía siga existiendo y activa (defensa ante revocación)
    m = db.scalar(select(models.Membresia).where(
        models.Membresia.usuario_id == user.id,
        models.Membresia.caja_id == caja_id,
        models.Membresia.activo))
    if not m:
        raise HTTPException(status.HTTP_403_FORBIDDEN,
                            "Ya no perteneces a esta caja")
    return Actor(usuario=user, rol=m.rol, caja_id=m.caja_id, socio_id=m.socio_id)


def get_identidad(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> Actor:
    """Valida solo la identidad (cuenta), sin exigir caja anclada.
    Para endpoints de selección de caja, donde el token aún no tiene caja."""
    cred_exc = HTTPException(status.HTTP_401_UNAUTHORIZED, "Sesión inválida o expirada")
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = int(payload["sub"])
    except Exception:
        raise cred_exc
    user = db.get(models.Usuario, user_id)
    if not user or not user.activo:
        raise cred_exc
    rol = "superadmin" if user.es_superadmin else None
    return Actor(usuario=user, rol=rol, caja_id=payload.get("caja_id"),
                 socio_id=payload.get("socio_id"))


def require_roles(*roles: str):
    def checker(actor: Actor = Depends(get_actor)) -> Actor:
        if actor.rol not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "No tienes permiso para esta acción")
        return actor
    return checker


# Alias para endpoints que solo necesitan identidad (sin exigir rol concreto)
get_current_user = get_actor


def caja_scope(actor: Actor, caja_id: int | None = None) -> int:
    """Resuelve la caja sobre la que opera el actor. Superadmin debe indicar caja_id."""
    if actor.rol == "superadmin":
        if caja_id is None:
            raise HTTPException(400, "Superadmin debe indicar caja_id")
        return caja_id
    return actor.caja_id


def log_audit(db: Session, actor: Actor, accion: str, entidad: str,
              entidad_id: int, detalle: str, caja_id: int | None = None,
              afecta_socio_id: int | None = None):
    db.add(models.Auditoria(
        caja_id=caja_id if caja_id is not None else actor.caja_id,
        usuario_id=actor.id, usuario_nombre=actor.nombre,
        accion=accion, entidad=entidad, entidad_id=entidad_id, detalle=detalle,
        afecta_socio_id=afecta_socio_id,
    ))
