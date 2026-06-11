"""Tests de Kullki. Ejecutar desde backend/: pytest -v"""
import os
os.environ["DATABASE_URL"] = "sqlite:///./test_kullki.db"
os.environ["SUPERADMIN_CEDULA"] = "admin"
os.environ["SUPERADMIN_PASSWORD"] = "test-admin-123"

import pathlib
for f in ("test_kullki.db",):
    p = pathlib.Path(f)
    if p.exists():
        p.unlink()

from datetime import date, timedelta
import pytest
from fastapi.testclient import TestClient
from app.main import app, init_db
from app.database import SessionLocal
from app import models

init_db()  # crea tablas y superadmin (startup no corre fuera de contexto)
client = TestClient(app)


def login(cedula, password):
    r = client.post("/auth/login", json={"cedula": cedula, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="module")
def setup():
    """Superadmin crea dos cajas; cada una con tesorero y un socio."""
    sa = login("admin", "test-admin-123")
    for slug, ced in (("caja-a", "1000000001"), ("caja-b", "1000000002")):
        r = client.post("/cajas", headers=sa, json={
            "nombre": f"Caja {slug}", "slug": slug, "comunidad": "Test",
            "tasa_interes_mensual": 2.0, "aporte_ordinario": 10,
            "tesorero_nombre": f"Tesorero {slug}", "tesorero_cedula": ced,
            "tesorero_password": "secreta123",
        })
        assert r.status_code == 200, r.text
    ta = login("1000000001", "secreta123")
    tb = login("1000000002", "secreta123")
    ra = client.post("/socios", headers=ta, json={"nombres": "Ana A", "cedula": "2000000001"})
    rb = client.post("/socios", headers=tb, json={"nombres": "Beto B", "cedula": "2000000002"})
    assert ra.status_code == 200 and rb.status_code == 200
    return {"sa": sa, "ta": ta, "tb": tb,
            "socio_a": ra.json(), "socio_b": rb.json()}


# ---------------- autenticación y roles ----------------

def test_login_invalido():
    r = client.post("/auth/login", json={"cedula": "admin", "password": "mala"})
    assert r.status_code == 401


def test_endpoint_protegido_sin_token():
    assert client.get("/dashboard").status_code == 401


def test_socio_no_puede_crear_aportes(setup):
    socio = login("2000000001", "2000000001")  # contraseña inicial = cédula
    r = client.post("/aportes", headers=socio,
                    json={"socio_id": setup["socio_a"]["id"], "monto": 10})
    assert r.status_code == 403


def test_superadmin_requiere_caja_id(setup):
    assert client.get("/dashboard", headers=setup["sa"]).status_code == 400


# ---------------- aislamiento multi-caja ----------------

def test_tesorero_no_ve_socios_de_otra_caja(setup):
    socios_b = client.get("/socios", headers=setup["tb"]).json()
    ids = {s["id"] for s in socios_b}
    assert setup["socio_a"]["id"] not in ids


def test_tesorero_no_puede_aportar_a_socio_ajeno(setup):
    r = client.post("/aportes", headers=setup["tb"],
                    json={"socio_id": setup["socio_a"]["id"], "monto": 10})
    assert r.status_code == 404


def test_socio_solo_ve_su_libreta(setup):
    socio_a = login("2000000001", "2000000001")
    r = client.get(f"/mi-libreta?socio_id={setup['socio_b']['id']}", headers=socio_a)
    assert r.status_code == 200
    assert r.json()["socio"]["id"] == setup["socio_a"]["id"]  # ignora el socio_id ajeno


# ---------------- aportes ----------------

def test_aporte_y_total(setup):
    for monto in (10, 10, 5):
        r = client.post("/aportes", headers=setup["ta"],
                        json={"socio_id": setup["socio_a"]["id"], "monto": monto})
        assert r.status_code == 200
    lib = client.get(f"/mi-libreta?socio_id={setup['socio_a']['id']}",
                     headers=setup["ta"]).json()
    assert lib["socio"]["total_aportes"] == 25.0


def test_aporte_monto_invalido(setup):
    r = client.post("/aportes", headers=setup["ta"],
                    json={"socio_id": setup["socio_a"]["id"], "monto": -5})
    assert r.status_code == 422


# ---------------- créditos y amortización ----------------

def test_amortizacion_capital_cierra_exacto(setup):
    r = client.post("/creditos", headers=setup["ta"], json={
        "socio_id": setup["socio_a"]["id"], "monto": 500,
        "plazo_meses": 6, "destino": "test"})
    assert r.status_code == 200, r.text
    c = r.json()
    assert len(c["cuotas"]) == 6
    assert round(sum(q["capital"] for q in c["cuotas"]), 2) == 500.00
    intereses = sum(q["interes"] for q in c["cuotas"])
    assert intereses > 0
    # cuota fija francesa: todas iguales salvo ajuste final de centavos
    totales = [q["total"] for q in c["cuotas"]]
    assert max(totales) - min(totales) < 0.05
    setup["credito"] = c


def test_pago_fuera_de_orden_rechazado(setup):
    cuota2 = setup["credito"]["cuotas"][1]
    r = client.post(f"/creditos/cuotas/{cuota2['id']}/pagar",
                    headers=setup["ta"], json={})
    assert r.status_code == 400


def test_pago_en_orden_y_saldo(setup):
    c = setup["credito"]
    r = client.post(f"/creditos/cuotas/{c['cuotas'][0]['id']}/pagar",
                    headers=setup["ta"], json={})
    assert r.status_code == 200
    d = r.json()
    assert d["cuotas_pagadas"] == 1
    esperado = round(500 - c["cuotas"][0]["capital"], 2)
    assert d["saldo_capital"] == esperado


def test_doble_pago_rechazado(setup):
    cuota1 = setup["credito"]["cuotas"][0]
    r = client.post(f"/creditos/cuotas/{cuota1['id']}/pagar",
                    headers=setup["ta"], json={})
    assert r.status_code == 400


def test_credito_pagado_completo(setup):
    c = setup["credito"]
    for q in c["cuotas"][1:]:
        r = client.post(f"/creditos/cuotas/{q['id']}/pagar",
                        headers=setup["ta"], json={})
        assert r.status_code == 200
    assert r.json()["estado"] == "pagado"
    assert r.json()["saldo_capital"] == 0


def test_mora_detectada():
    """Cuota con vencimiento pasado debe marcar mora en el dashboard."""
    db = SessionLocal()
    try:
        caja = db.query(models.Caja).filter_by(slug="caja-a").one()
        cuota_futura = (db.query(models.Cuota).join(models.Credito)
                        .filter(models.Credito.caja_id == caja.id).first())
    finally:
        db.close()
    ta = login("1000000001", "secreta123")
    socios = client.get("/socios", headers=ta).json()
    r = client.post("/creditos", headers=ta, json={
        "socio_id": socios[0]["id"], "monto": 100, "plazo_meses": 2,
        "fecha_desembolso": (date.today() - timedelta(days=70)).isoformat()})
    assert r.status_code == 200
    dash = client.get("/dashboard", headers=ta).json()
    assert dash["cuotas_en_mora"] >= 1
    assert dash["monto_en_mora"] > 0


# ---------------- dashboard y auditoría ----------------

def test_dashboard_fondo_consistente(setup):
    d = client.get("/dashboard", headers=setup["ta"]).json()
    assert d["fondo_disponible"] == round(
        d["total_aportes"] + d["capital_recuperado"] + d["intereses_cobrados"]
        - (d["capital_prestado"] + d["capital_recuperado"]), 2)


def test_auditoria_visible_para_socio_y_aislada(setup):
    socio_a = login("2000000001", "2000000001")
    items = client.get("/auditoria", headers=socio_a).json()
    assert len(items) > 0
    detalles = " ".join(i["detalle"] for i in items)
    assert "Ana A" in detalles
    assert "Beto B" not in detalles  # nada de la otra caja
