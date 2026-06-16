"""Tests del endpoint POST /aportes/multas-masivas."""
import pytest
from datetime import date
from app import models
from sqlalchemy import select
from tests.conftest import TestSession


@pytest.fixture
def headers(token_tesorero):
    return {"Authorization": f"Bearer {token_tesorero}"}


def _contar_multas(caja_id):
    db = TestSession()
    try:
        return db.scalar(select(models.Aporte).where(
            models.Aporte.caja_id == caja_id,
            models.Aporte.tipo == "multa",
            models.Aporte.anulado == False,
        ).__class__.__func__ if False else
        __import__("sqlalchemy", fromlist=["func"]).func.count().where if False else
        models.Aporte.__table__.select()  # placeholder
        ) or 0
    finally:
        db.close()


def test_multas_sin_dia_corte(client, seed, headers):
    """Caja sin dia_corte → 400."""
    db = TestSession()
    try:
        caja = db.get(models.Caja, seed["caja_id"])
        old = caja.dia_corte
        caja.dia_corte = 0
        db.commit()
        r = client.post("/aportes/multas-masivas", headers=headers)
        assert r.status_code == 400
        assert "corte" in r.json()["detail"].lower()
        caja = db.get(models.Caja, seed["caja_id"])
        caja.dia_corte = old
        db.commit()
    finally:
        db.close()


def test_multas_sin_monto(client, seed, headers):
    """Caja sin multa_atraso → 400."""
    db = TestSession()
    try:
        caja = db.get(models.Caja, seed["caja_id"])
        old = caja.multa_atraso
        caja.multa_atraso = 0
        db.commit()
        r = client.post("/aportes/multas-masivas", headers=headers)
        assert r.status_code == 400
        caja = db.get(models.Caja, seed["caja_id"])
        caja.multa_atraso = old
        db.commit()
    finally:
        db.close()


def test_multas_antes_del_corte(client, seed, headers):
    """Si hoy.day <= dia_corte el endpoint rechaza."""
    db = TestSession()
    try:
        caja = db.get(models.Caja, seed["caja_id"])
        old = caja.dia_corte
        # Poner corte al último día del mes (siempre futuro)
        caja.dia_corte = 31
        db.commit()
        r = client.post("/aportes/multas-masivas", headers=headers)
        assert r.status_code == 400
        assert "pasado" in r.json()["detail"].lower()
        caja = db.get(models.Caja, seed["caja_id"])
        caja.dia_corte = old
        db.commit()
    finally:
        db.close()


def test_multas_masivas_aplica(client, seed, headers):
    """Socios sin aporte este mes + día de corte pasado → reciben multa."""
    from sqlalchemy import select, func
    db = TestSession()
    try:
        # Asegura dia_corte=1 (ya pasó si hoy > 1, lo cual es casi siempre true)
        caja = db.get(models.Caja, seed["caja_id"])
        caja.dia_corte = 1
        caja.multa_atraso = 3.0
        db.commit()

        today = date.today()
        if today.day <= 1:
            pytest.skip("Test requiere que el día de corte (1) ya haya pasado hoy")

        # Eliminar aportes del mes actual de los socios (si los hubiera)
        from sqlalchemy import delete
        mes_inicio = date(today.year, today.month, 1)
        for s in seed["socios"]:
            db.execute(delete(models.Aporte).where(
                models.Aporte.socio_id == s.id,
                models.Aporte.fecha >= mes_inicio,
            ))
        db.commit()

        r = client.post("/aportes/multas-masivas", headers=headers)
        assert r.status_code == 200
        data = r.json()
        assert data["ok"] is True
        assert data["multados"] == len(seed["socios"])
        assert data["monto_por_socio"] == 3.0
        assert data["total"] == round(3.0 * len(seed["socios"]), 2)

        # Verificar en BD
        count = db.scalar(select(func.count()).where(
            models.Aporte.caja_id == seed["caja_id"],
            models.Aporte.tipo == "multa",
            models.Aporte.fecha >= mes_inicio,
            models.Aporte.anulado == False,
        ))
        assert count == len(seed["socios"])
    finally:
        db.close()


def test_multas_no_duplica(client, seed, headers):
    """Segunda llamada no duplica multas del mismo mes."""
    today = date.today()
    if today.day <= 1:
        pytest.skip("Test requiere que el día de corte (1) ya haya pasado hoy")

    r = client.post("/aportes/multas-masivas", headers=headers)
    assert r.status_code == 200
    data = r.json()
    # Ya fueron multados → 0 nuevos
    assert data["multados"] == 0
