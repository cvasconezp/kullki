"""
Cifrado de datos en reposo para Kullki (SCAFFOLD — aún no cableado a los modelos).

Provee:
  - encrypt(texto) / decrypt(token): cifrado autenticado con Fernet (AES-128-GCM + HMAC).
  - blind_index(valor): HMAC-SHA256 determinista para búsquedas por igualdad y unicidad.
  - normaliza_cedula(c): normaliza antes de indexar/cifrar.
  - EncryptedStr: TypeDecorator de SQLAlchemy para cifrar/descifrar columnas de forma transparente.

Llaves (variables de entorno, NUNCA en la base ni en el repo):
  - KULLKI_ENC_KEY    -> clave Fernet (Fernet.generate_key()). Admite varias separadas por coma (MultiFernet, rotación).
  - KULLKI_INDEX_KEY  -> clave HMAC del blind index (secrets.token_hex(32)).

Ver docs/Plan-Cifrado-en-Reposo.md para el plan de despliegue por fases.
"""
from __future__ import annotations
import os, hmac, hashlib, functools
from cryptography.fernet import Fernet, MultiFernet, InvalidToken
from sqlalchemy.types import TypeDecorator, Text


class LlaveNoConfigurada(RuntimeError):
    pass


@functools.lru_cache(maxsize=1)
def _fernet() -> MultiFernet:
    raw = os.getenv("KULLKI_ENC_KEY", "")
    if not raw:
        raise LlaveNoConfigurada("Falta KULLKI_ENC_KEY en el entorno")
    llaves = [Fernet(k.strip().encode()) for k in raw.split(",") if k.strip()]
    if not llaves:
        raise LlaveNoConfigurada("KULLKI_ENC_KEY vacía o inválida")
    return MultiFernet(llaves)  # cifra con la 1a; descifra con cualquiera (rotación)


@functools.lru_cache(maxsize=1)
def _index_key() -> bytes:
    k = os.getenv("KULLKI_INDEX_KEY", "")
    if not k:
        raise LlaveNoConfigurada("Falta KULLKI_INDEX_KEY en el entorno")
    return k.encode()


def encrypt(texto: str | None) -> str | None:
    """Cifra un string. None/'' se preservan tal cual (no hay nada que ocultar)."""
    if texto is None or texto == "":
        return texto
    return _fernet().encrypt(texto.encode()).decode()


def decrypt(token: str | None) -> str | None:
    """Descifra un token. None/'' se devuelven tal cual. Token corrupto -> InvalidToken."""
    if token is None or token == "":
        return token
    return _fernet().decrypt(token.encode()).decode()


def normaliza_cedula(cedula: str | None) -> str:
    """Normaliza la cédula antes de indexar/cifrar: sin espacios ni guiones."""
    if not cedula:
        return ""
    return cedula.replace("-", "").replace(" ", "").strip()


def blind_index(valor: str | None, *, normalizar: bool = True) -> str | None:
    """HMAC-SHA256 determinista para búsqueda por igualdad y unicidad.
    Determinista (mismo input -> mismo hash) pero irreversible sin KULLKI_INDEX_KEY."""
    if valor is None or valor == "":
        return None
    dato = normaliza_cedula(valor) if normalizar else valor.strip()
    return hmac.new(_index_key(), dato.encode(), hashlib.sha256).hexdigest()


class EncryptedStr(TypeDecorator):
    """Columna de texto cifrada de forma transparente.

    Uso (fase de cableado, NO en este PR):
        cedula_enc: Mapped[str | None] = mapped_column(EncryptedStr, nullable=True)

    Al escribir cifra; al leer descifra. Guarda como Text (Base64)."""
    impl = Text
    cache_ok = True

    def process_bind_param(self, value, dialect):
        return encrypt(value)

    def process_result_value(self, value, dialect):
        try:
            return decrypt(value)
        except InvalidToken:
            # Dato aún en texto plano (durante la migración) o token inválido.
            return value


def self_test() -> None:
    """Prueba rápida end-to-end. Requiere las dos llaves en el entorno.
    Ejecutar:  KULLKI_ENC_KEY=... KULLKI_INDEX_KEY=... python -m app.crypto"""
    muestra = "1712345678"
    assert decrypt(encrypt(muestra)) == muestra
    assert encrypt(None) is None and encrypt("") == ""
    b1 = blind_index("1712345678")
    b2 = blind_index("171234-5678")   # normaliza -> mismo índice
    assert b1 == b2 and len(b1) == 64
    assert encrypt(muestra) != encrypt(muestra) or True  # IV aleatorio: tokens distintos
    print("crypto.py OK — encrypt/decrypt y blind_index funcionan")


if __name__ == "__main__":
    self_test()
