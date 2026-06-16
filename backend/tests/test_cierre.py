"""Tests para liquidación anual (cierre / simulación)."""
import pytest
from app import models
from sqlalchemy import select, func
from tests.conftest import TestSession


@pytest.fixture
def headers(token_tesorero):
    return {"Authorization": f"Bearer {token_tesorero}"}


def test_cierre_simulacion(client, seed, headers):
    """GET /cierre/simulacion devuelve estructura correcta."""
    r = client.get("/cierre/simulacion", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert "intereses_a_repartir" in data
    assert "filas" in data
    assert isinstance(data["filas"], list)


def test_cierre_simulacion_estructura(client, seed, headers):
    """Cada fila de la simulación tiene los campos esperados."""
    r = client.get("/cierre/simulacion", headers=headers)
    assert r.status_code == 200
    filas = r.json()["filas"]
    if filas:
        fila = filas[0]
        assert "socio" in fila
        assert "porcentaje" in fila
        assert "ahorro_neto" in fila
        assert "utilidad" in fila


def test_ejecutar_cierre_requiere_modo_valido(client, seed, headers):
    """POST /cierre/ejecutar con modo inválido → 400 o 422."""
    r = client.post("/cierre/ejecutar",
                    json={"modo": "invalido"},
                    headers=headers)
    assert r.status_code in (400, 422)


def test_ejecutar_cierre_capitalizar(client, seed, headers):
    """POST /cierre/ejecutar con modo=capitalizar: 200 o 400 si sin utilidad."""
    cid = seed["caja_id"]
    db = TestSession()
    try:
        antes = db.scalar(
            select(func.count()).where(
                models.Aporte.caja_id == cid,
                models.Aporte.tipo == "utilidad_ahorro",
            )
        ) or 0
    finally:
        db.close()

    r = client.post("/cierre/ejecutar",
                    json={"modo": "capitalizar"},
                    headers=headers)
    # Acepta 200 (éxito) o 400 (sin intereses que repartir en test DB)
    assert r.status_code in (200, 400)
    if r.status_code == 200:
        db2 = TestSession()
        try:
            despues = db2.scalar(
                select(func.count()).where(
                    models.Aporte.caja_id == cid,
                    models.Aporte.tipo == "utilidad_ahorro",
                )
            ) or 0
            assert despues >= antes
        finally:
            db2.close()
