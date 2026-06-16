"""Tests de política de contraseñas."""
import pytest


@pytest.fixture
def headers(token_tesorero):
    return {"Authorization": f"Bearer {token_tesorero}"}


def test_password_sin_mayuscula(client, headers):
    r = client.post("/auth/cambiar-password",
                    json={"actual": "TestPass1!", "nueva": "sinmayuscula1"},
                    headers=headers)
    assert r.status_code == 400
    assert "mayúscula" in r.json()["detail"].lower()


def test_password_sin_minuscula(client, headers):
    r = client.post("/auth/cambiar-password",
                    json={"actual": "TestPass1!", "nueva": "SINMINUSCULA1"},
                    headers=headers)
    assert r.status_code == 400
    assert "minúscula" in r.json()["detail"].lower()


def test_password_sin_numero(client, headers):
    r = client.post("/auth/cambiar-password",
                    json={"actual": "TestPass1!", "nueva": "SinNumeroAqui"},
                    headers=headers)
    assert r.status_code == 400
    assert "número" in r.json()["detail"].lower()


def test_password_muy_corta(client, headers):
    r = client.post("/auth/cambiar-password",
                    json={"actual": "TestPass1!", "nueva": "Ab1"},
                    headers=headers)
    # Pydantic min_length=8 → 422
    assert r.status_code == 422


def test_password_igual_cedula(client, headers):
    r = client.post("/auth/cambiar-password",
                    json={"actual": "TestPass1!", "nueva": "1111111111"},
                    headers=headers)
    assert r.status_code in (400, 422)


def test_password_valida(client, headers):
    """Contraseña correcta: 8+ chars, mayúscula, minúscula, número."""
    r = client.post("/auth/cambiar-password",
                    json={"actual": "TestPass1!", "nueva": "NuevaPass9"},
                    headers=headers)
    assert r.status_code == 200
    assert r.json()["ok"] is True
    # Restaurar contraseña para el resto de los tests
    r2 = client.post("/auth/cambiar-password",
                     json={"actual": "NuevaPass9", "nueva": "TestPass1!"},
                     headers=headers)
    assert r2.status_code == 200
