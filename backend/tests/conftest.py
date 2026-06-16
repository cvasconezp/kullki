"""
Configuración de tests con SQLite en memoria.
Se setean variables de entorno ANTES de importar la app para que
database.py use el motor de test, no el de producción.
"""
import os, pytest

# IMPORTANTE: deben estar antes de cualquier import de app.*
os.environ.setdefault("DATABASE_URL", "sqlite:///./test_kullki.db")
os.environ.setdefault("SECRET_KEY", "clave-de-test-no-usar-en-produccion")
os.environ.setdefault("SUPERADMIN_CEDULA",   "0000000000")
os.environ.setdefault("SUPERADMIN_PASSWORD", "Admin1234!")
os.environ.setdefault("BACKUP_ENABLED",      "0")

from datetime import date, timedelta
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.main import app
from app import models
from app.auth import hash_password

TEST_DB_URL = "sqlite:///./test_kullki.db"
engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
TestSession = sessionmaker(bind=engine)


def override_get_db():
    db = TestSession()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(scope="session", autouse=True)
def setup_db():
    """Crea tablas una vez para toda la sesión de tests."""
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)
    import pathlib
    pathlib.Path("test_kullki.db").unlink(missing_ok=True)


@pytest.fixture(scope="session")
def client(setup_db):
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app, raise_server_exceptions=True) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture(scope="session")
def seed(setup_db):
    """Crea datos de prueba: 1 caja, 1 tesorero, 3 socios, aportes, 1 crédito."""
    db = TestSession()
    try:
        # --- caja ---
        caja = models.Caja(
            nombre="Caja Test", slug="test", comunidad="Comunidad Test",
            tasa_interes_mensual=2.0, aporte_ordinario=20.0,
            multa_mora=5.0, multa_atraso=3.0, dia_corte=10,
            color_primario="#1B3A6B", color_acento="#E8A838",
        )
        db.add(caja); db.flush()

        # --- tesorero ---
        tesorero_user = models.Usuario(
            nombre="Tesorero Test", cedula="1111111111",
            password_hash=hash_password("TestPass1!"), activo=True,
            totp_activo=False,
        )
        db.add(tesorero_user); db.flush()
        db.add(models.Membresia(usuario_id=tesorero_user.id, caja_id=caja.id, rol="tesorero"))
        db.flush()

        # --- socios ---
        socios = []
        for i, (nombre, cedula) in enumerate([
            ("Ana García", "1234567890"),
            ("Luis Pérez", "0987654321"),
            ("María Torres", "1357924680"),
        ], 1):
            s = models.Socio(caja_id=caja.id, nombres=nombre, cedula=cedula,
                             fecha_ingreso=date(2024, 1, 1))
            db.add(s); db.flush()
            socios.append(s)
            # aporte ordinario
            db.add(models.Aporte(caja_id=caja.id, socio_id=s.id, monto=20.0 * i,
                                 fecha=date(2025, 1, 15), tipo="ordinario",
                                 registrado_por=tesorero_user.id))

        db.flush()

        # --- crédito para socio 0 (Ana) ---
        credito = models.Credito(
            caja_id=caja.id, socio_id=socios[0].id, monto=100.0,
            tasa_mensual=2.0, plazo_meses=3,
            fecha_desembolso=date(2025, 1, 1),
            destino="Negocio", tipo="ordinario", estado="activo",
            registrado_por=tesorero_user.id,
        )
        db.add(credito); db.flush()
        for n in range(1, 4):
            venc = date(2025, n + 1, 1)
            db.add(models.Cuota(credito_id=credito.id, numero=n,
                                fecha_vencimiento=venc, capital=33.33,
                                interes=2.0, total=35.33,
                                pagada=(n == 1)))
        db.commit()

        yield {"caja_id": caja.id, "tesorero_user_id": tesorero_user.id,
               "socios": socios, "credito_id": credito.id}
    finally:
        db.close()


@pytest.fixture(scope="session")
def token_tesorero(client, seed):
    """JWT del tesorero ya anclado a la caja de test."""
    r = client.post("/auth/login", json={"cedula": "1111111111", "password": "TestPass1!"})
    assert r.status_code == 200, r.text
    data = r.json()
    if data.get("requiere_seleccion"):
        r2 = client.post("/auth/seleccionar",
                         json={"caja_id": seed["caja_id"]},
                         headers={"Authorization": f"Bearer {data['access_token']}"})
        assert r2.status_code == 200, r2.text
        return r2.json()["access_token"]
    return data["access_token"]
