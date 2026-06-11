import os, hashlib, secrets
from datetime import datetime, timedelta, timezone
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
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


def create_token(user: models.Usuario) -> str:
    payload = {
        "sub": str(user.id),
        "rol": user.rol,
        "caja_id": user.caja_id,
        "exp": datetime.now(timezone.utc) + timedelta(hours=TOKEN_HOURS),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> models.Usuario:
    cred_exc = HTTPException(status.HTTP_401_UNAUTHORIZED, "Sesión inválida o expirada")
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = int(payload["sub"])
    except Exception:
        raise cred_exc
    user = db.get(models.Usuario, user_id)
    if not user or not user.activo:
        raise cred_exc
    return user


def require_roles(*roles: str):
    def checker(user: models.Usuario = Depends(get_current_user)) -> models.Usuario:
        if user.rol not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "No tienes permiso para esta acción")
        return user
    return checker


def caja_scope(user: models.Usuario, caja_id: int | None = None) -> int:
    """Resuelve la caja sobre la que opera el usuario. Superadmin debe indicar caja_id."""
    if user.rol == "superadmin":
        if caja_id is None:
            raise HTTPException(400, "Superadmin debe indicar caja_id")
        return caja_id
    return user.caja_id


def log_audit(db: Session, user: models.Usuario, accion: str, entidad: str,
              entidad_id: int, detalle: str, caja_id: int | None = None):
    db.add(models.Auditoria(
        caja_id=caja_id if caja_id is not None else user.caja_id,
        usuario_id=user.id, usuario_nombre=user.nombre,
        accion=accion, entidad=entidad, entidad_id=entidad_id, detalle=detalle,
    ))
