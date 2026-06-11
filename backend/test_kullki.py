"""Tests de Kullki. Ejecutar desde backend/: pytest -v"""
import os
os.environ["DATABASE_URL"] = "sqlite:///./test_kullki.db"
os.environ["SUPERADMIN_CEDULA"] = "admin"
os.environ["SUPERADMIN_PASSWORD"] = "test-admin-123"
os.environ["SEED_DEMO"] = "0"  # tests deterministas: sin auto-seed demo

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
    """Login simple: vale para superadmin y para quien tiene UNA sola caja."""
    r = client.post("/auth/login", json={"cedula": cedula, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def login_full(cedula, password):
    r = client.post("/auth/login", json={"cedula": cedula, "password": password})
    assert r.status_code == 200, r.text
    return r.json()


def login_en_caja(cedula, password, caja_id):
    """Login + seleccionar caja explícita (para usuarios multi-caja)."""
    data = login_full(cedula, password)
    tok = data["access_token"]
    if data.get("requiere_seleccion"):
        r = client.post("/auth/seleccionar-caja", json={"caja_id": caja_id},
                        headers={"Authorization": f"Bearer {tok}"})
        assert r.status_code == 200, r.text
        tok = r.json()["access_token"]
    return {"Authorization": f"Bearer {tok}"}


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


def test_tesorero_ve_expediente_de_su_socio(setup):
    """El tesorero puede abrir el expediente (libreta) de cualquier socio de SU caja."""
    r = client.get(f"/mi-libreta?socio_id={setup['socio_a']['id']}", headers=setup["ta"])
    assert r.status_code == 200
    d = r.json()
    assert d["socio"]["id"] == setup["socio_a"]["id"]
    assert "aportes" in d and "creditos" in d


def test_tesorero_no_ve_expediente_de_otra_caja(setup):
    r = client.get(f"/mi-libreta?socio_id={setup['socio_a']['id']}", headers=setup["tb"])
    assert r.status_code == 404


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
        + d["abonos_en_transito"] - d["total_retiros"]
        - (d["capital_prestado"] + d["capital_recuperado"]), 2)


def test_auditoria_visible_para_socio_y_aislada(setup):
    socio_a = login("2000000001", "2000000001")
    items = client.get("/auditoria", headers=socio_a).json()
    assert len(items) > 0
    detalles = " ".join(i["detalle"] for i in items)
    assert "Ana A" in detalles
    assert "Beto B" not in detalles  # nada de la otra caja


# ---------------- retiros, abonos parciales, multas, informes ----------------

def test_multa_no_suma_al_ahorro_pero_si_al_fondo(setup):
    antes = client.get("/dashboard", headers=setup["ta"]).json()
    lib_antes = client.get(f"/mi-libreta?socio_id={setup['socio_a']['id']}",
                           headers=setup["ta"]).json()
    r = client.post("/aportes", headers=setup["ta"], json={
        "socio_id": setup["socio_a"]["id"], "monto": 2, "tipo": "multa"})
    assert r.status_code == 200
    despues = client.get("/dashboard", headers=setup["ta"]).json()
    lib = client.get(f"/mi-libreta?socio_id={setup['socio_a']['id']}",
                     headers=setup["ta"]).json()
    assert lib["socio"]["total_aportes"] == lib_antes["socio"]["total_aportes"]  # ahorro intacto
    assert lib["socio"]["total_multas"] >= 2
    assert despues["fondo_disponible"] == round(antes["fondo_disponible"] + 2, 2)


def test_retiro_valido_descuenta_ahorro_y_fondo(setup):
    # socio nuevo sin créditos, para no chocar con la regla de respaldo de deuda
    s = client.post("/socios", headers=setup["ta"],
                    json={"nombres": "Diego D", "cedula": "2000000099"}).json()
    client.post("/aportes", headers=setup["ta"], json={"socio_id": s["id"], "monto": 20})
    antes = client.get("/dashboard", headers=setup["ta"]).json()
    r = client.post("/retiros", headers=setup["ta"], json={
        "socio_id": s["id"], "monto": 5, "nota": "test"})
    assert r.status_code == 200, r.text
    despues = client.get("/dashboard", headers=setup["ta"]).json()
    lib = client.get(f"/mi-libreta?socio_id={s['id']}", headers=setup["ta"]).json()
    assert lib["socio"]["total_aportes"] == 15.0
    assert despues["fondo_disponible"] == round(antes["fondo_disponible"] - 5, 2)
    assert len(lib["retiros"]) == 1


def test_retiro_excesivo_rechazado(setup):
    r = client.post("/retiros", headers=setup["ta"], json={
        "socio_id": setup["socio_a"]["id"], "monto": 99999})
    assert r.status_code == 400


def test_retiro_bloqueado_por_credito_activo(setup):
    """Caja B: socio con crédito activo no puede vaciar su ahorro."""
    tb = setup["tb"]
    sb = setup["socio_b"]["id"]
    for _ in range(3):
        client.post("/aportes", headers=tb, json={"socio_id": sb, "monto": 10})
    r = client.post("/creditos", headers=tb, json={
        "socio_id": sb, "monto": 25, "plazo_meses": 2})
    assert r.status_code == 200
    r = client.post("/retiros", headers=tb, json={"socio_id": sb, "monto": 30})
    assert r.status_code == 400
    assert "respalda" in r.json()["detail"]
    r = client.post("/retiros", headers=tb, json={"socio_id": sb, "monto": 5})
    assert r.status_code == 200


def test_abono_parcial_y_completar(setup):
    ta = setup["ta"]
    r = client.post("/creditos", headers=ta, json={
        "socio_id": setup["socio_a"]["id"], "monto": 200, "plazo_meses": 2})
    assert r.status_code == 200
    c = r.json()
    cuota1 = c["cuotas"][0]
    # abono parcial
    r = client.post(f"/creditos/cuotas/{cuota1['id']}/abonar", headers=ta,
                    json={"monto": 50})
    assert r.status_code == 200
    d = r.json()
    q1 = d["cuotas"][0]
    assert q1["abonado"] == 50 and q1["pagada"] is False
    assert d["cuotas_pagadas"] == 0
    # abono que excede lo pendiente -> rechazado
    r = client.post(f"/creditos/cuotas/{cuota1['id']}/abonar", headers=ta,
                    json={"monto": 9999})
    assert r.status_code == 400
    # completar con /pagar (cobra el restante)
    r = client.post(f"/creditos/cuotas/{cuota1['id']}/pagar", headers=ta, json={})
    assert r.status_code == 200
    q1 = r.json()["cuotas"][0]
    assert q1["pagada"] is True and q1["abonado"] == q1["total"]


def test_multa_mora_automatica():
    """Caja con multa_mora: primer abono a cuota vencida genera la multa una sola vez."""
    sa = login("admin", "test-admin-123")
    r = client.post("/cajas", headers=sa, json={
        "nombre": "Caja Mora", "slug": "caja-mora", "comunidad": "Test",
        "tasa_interes_mensual": 1.0, "aporte_ordinario": 10, "multa_mora": 1.5,
        "tesorero_nombre": "Tes Mora", "tesorero_cedula": "1000000003",
        "tesorero_password": "secreta123"})
    assert r.status_code == 200, r.text
    tm = login("1000000003", "secreta123")
    s = client.post("/socios", headers=tm,
                    json={"nombres": "Carla C", "cedula": "2000000003"}).json()
    client.post("/aportes", headers=tm, json={"socio_id": s["id"], "monto": 50})
    c = client.post("/creditos", headers=tm, json={
        "socio_id": s["id"], "monto": 60, "plazo_meses": 2,
        "fecha_desembolso": (date.today() - timedelta(days=70)).isoformat()}).json()
    cuota1 = c["cuotas"][0]  # ya vencida
    r = client.post(f"/creditos/cuotas/{cuota1['id']}/abonar", headers=tm,
                    json={"monto": 10})
    assert r.status_code == 200
    lib = client.get(f"/mi-libreta?socio_id={s['id']}", headers=tm).json()
    assert lib["socio"]["total_multas"] == 1.5
    # segundo abono a la misma cuota: NO duplica la multa
    client.post(f"/creditos/cuotas/{cuota1['id']}/abonar", headers=tm, json={"monto": 5})
    lib = client.get(f"/mi-libreta?socio_id={s['id']}", headers=tm).json()
    assert lib["socio"]["total_multas"] == 1.5


def test_informe_asamblea(setup):
    r = client.get("/informe-asamblea", headers=setup["ta"])
    assert r.status_code == 200
    d = r.json()
    assert d["caja"]["slug"] == "caja-a"
    assert len(d["filas"]) >= 1
    fila = next(f for f in d["filas"] if f["socio"] == "Ana A")
    lib = client.get(f"/mi-libreta?socio_id={setup['socio_a']['id']}",
                     headers=setup["ta"]).json()
    assert fila["ahorro_neto"] == lib["socio"]["total_aportes"]


def test_cierre_simulacion_proporcional(setup):
    r = client.get("/cierre/simulacion", headers=setup["ta"])
    assert r.status_code == 200
    d = r.json()
    if d["total_ahorro"] > 0:
        assert abs(sum(f["porcentaje"] for f in d["filas"]) - 100) < 0.5
        assert abs(sum(f["utilidad"] for f in d["filas"]) - d["intereses_a_repartir"]) < 0.1


# ---------------- multi-caja: una persona en dos cajas ----------------

def test_persona_en_dos_cajas_login_con_seleccion(setup):
    """El caso que motivó la Opción A: la misma cédula socia de A y B."""
    sa = setup["sa"]
    # Persona nueva: socia en caja A
    ta = setup["ta"]
    ra = client.post("/socios", headers=ta,
                     json={"nombres": "Multi Persona", "cedula": "2000000777"})
    assert ra.status_code == 200, ra.text
    # La misma cédula, ahora socia en caja B
    tb = setup["tb"]
    rb = client.post("/socios", headers=tb,
                     json={"nombres": "Multi Persona", "cedula": "2000000777"})
    assert rb.status_code == 200, rb.text

    # Login: como tiene 2 cajas, debe pedir selección
    data = login_full("2000000777", "2000000777")
    assert data["requiere_seleccion"] is True
    assert data["rol"] is None
    assert len(data["cajas"]) == 2
    slugs = {c["caja_nombre"] for c in data["cajas"]}
    assert "Caja caja-a" in slugs and "Caja caja-b" in slugs

    # Sin seleccionar caja, un endpoint con rol debe fallar (409)
    tok = data["access_token"]
    r = client.get("/mi-libreta", headers={"Authorization": f"Bearer {tok}"})
    assert r.status_code == 409

    # Selecciona caja A -> ve SU libreta de A
    ca = next(c for c in data["cajas"] if c["caja_nombre"] == "Caja caja-a")
    h = client.post("/auth/seleccionar-caja", json={"caja_id": ca["caja_id"]},
                    headers={"Authorization": f"Bearer {tok}"})
    assert h.status_code == 200
    tok_a = h.json()["access_token"]
    lib = client.get("/mi-libreta", headers={"Authorization": f"Bearer {tok_a}"})
    assert lib.status_code == 200
    assert lib.json()["socio"]["caja_id"] == ca["caja_id"]


def test_mis_cajas_endpoint(setup):
    cajas = client.get("/auth/mis-cajas", headers=setup["ta"]).json()
    # La tesorera de A solo pertenece a la caja A
    assert all(c["rol"] == "tesorero" for c in cajas)
    assert any(c["caja_nombre"] == "Caja caja-a" for c in cajas)


def test_persona_socia_y_tesorera_en_distintas_cajas(setup):
    """Una persona puede ser tesorera en una caja y socia en otra."""
    sa = setup["sa"]
    # Nueva caja C con tesorera cédula 2000000888
    r = client.post("/cajas", headers=sa, json={
        "nombre": "Caja caja-c", "slug": "caja-c", "comunidad": "Test",
        "tasa_interes_mensual": 1.0, "aporte_ordinario": 10,
        "tesorero_nombre": "Dual Rol", "tesorero_cedula": "2000000888",
        "tesorero_password": "secreta123"})
    assert r.status_code == 200, r.text
    # La misma persona, socia en caja A
    ra = client.post("/socios", headers=setup["ta"],
                     json={"nombres": "Dual Rol", "cedula": "2000000888"})
    assert ra.status_code == 200
    data = login_full("2000000888", "secreta123")
    assert data["requiere_seleccion"] is True
    roles = {c["caja_nombre"]: c["rol"] for c in data["cajas"]}
    assert roles["Caja caja-c"] == "tesorero"
    assert roles["Caja caja-a"] == "socio"


# ---------------- nuevos: branding, edición de caja, impersonación, balances ----------------

def test_branding_por_defecto_y_edicion(setup):
    sa = setup["sa"]
    cajas = client.get("/cajas", headers=sa).json()
    ca = next(c for c in cajas if c["slug"] == "caja-a")
    assert ca["color_primario"] == "#1B3A6B" and ca["color_acento"] == "#E8A838"
    r = client.patch(f"/cajas/{ca['id']}", headers=sa, json={
        "color_primario": "#7A1F1F", "logo": "🌽", "aporte_ordinario": 15})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["color_primario"] == "#7A1F1F" and d["logo"] == "🌽" and d["aporte_ordinario"] == 15


def test_editar_caja_requiere_superadmin(setup):
    r = client.patch("/cajas/1", headers=setup["ta"], json={"comunidad": "X"})
    assert r.status_code == 403


def test_superadmin_asume_caja_como_tesorero(setup):
    sa = setup["sa"]
    cajas = client.get("/cajas", headers=sa).json()
    ca = next(c for c in cajas if c["slug"] == "caja-a")
    r = client.post("/auth/asumir-caja", headers=sa, json={"caja_id": ca["id"], "rol": "tesorero"})
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["rol"] == "tesorero" and j["es_impersonacion"] is True
    h = {"Authorization": f"Bearer {j['access_token']}"}
    # con ese token, el admin opera como tesorero de la caja
    socios = client.get("/socios", headers=h)
    assert socios.status_code == 200
    dash = client.get("/dashboard", headers=h)
    assert dash.status_code == 200


def test_superadmin_asume_como_socio_requiere_socio_id(setup):
    sa = setup["sa"]
    cajas = client.get("/cajas", headers=sa).json()
    ca = next(c for c in cajas if c["slug"] == "caja-a")
    r = client.post("/auth/asumir-caja", headers=sa, json={"caja_id": ca["id"], "rol": "socio"})
    assert r.status_code == 400
    r = client.post("/auth/asumir-caja", headers=sa,
                    json={"caja_id": ca["id"], "rol": "socio", "socio_id": setup["socio_a"]["id"]})
    assert r.status_code == 200
    h = {"Authorization": f"Bearer {r.json()['access_token']}"}
    lib = client.get("/mi-libreta", headers=h)
    assert lib.status_code == 200
    assert lib.json()["socio"]["id"] == setup["socio_a"]["id"]


def test_tesorero_no_puede_asumir_caja(setup):
    r = client.post("/auth/asumir-caja", headers=setup["ta"], json={"caja_id": 1, "rol": "tesorero"})
    assert r.status_code == 403


def test_balances_series_y_composicion(setup):
    r = client.get("/balances", headers=setup["ta"])
    assert r.status_code == 200, r.text
    d = r.json()
    assert "dashboard" in d and "serie" in d
    assert set(["ahorros_disponibles", "capital_en_calle", "intereses"]) <= set(d["composicion_fondo"])
    for p in d["serie"]:
        assert "periodo" in p and "fondo_acumulado" in p
