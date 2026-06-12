"""Tests de Kullki. Ejecutar desde backend/: pytest -v"""
import os
os.environ["DATABASE_URL"] = "sqlite:///./test_kullki.db"
os.environ["SUPERADMIN_CEDULA"] = "admin"
os.environ["SUPERADMIN_PASSWORD"] = "test-admin-123"
os.environ["SEED_DEMO"] = "0"  # tests deterministas: sin auto-seed demo
os.environ["BACKUP_ENABLED"] = "0"

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
        + d["abonos_en_transito"] - d["total_retiros"] - d["utilidades_capitalizadas"]
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


# ---------------- ficha ampliada, anulación, ventana, export ----------------

def test_socio_ficha_ampliada_y_edicion(setup):
    ta = setup["ta"]
    s = client.post("/socios", headers=ta, json={
        "nombres": "Elena Demográfica", "cedula": "2000000444",
        "correo": "elena@example.com", "genero": "F", "ocupacion": "Agricultora",
        "fecha_nacimiento": "1990-05-20", "num_cargas": 2}).json()
    assert s["correo"] == "elena@example.com" and s["genero"] == "F" and s["num_cargas"] == 2
    r = client.patch(f"/socios/{s['id']}", headers=ta, json={"ocupacion": "Comerciante", "whatsapp": "0991234567"})
    assert r.status_code == 200
    assert r.json()["ocupacion"] == "Comerciante" and r.json()["whatsapp"] == "0991234567"


def test_anular_aporte_excluye_del_saldo(setup):
    ta = setup["ta"]
    s = client.post("/socios", headers=ta, json={"nombres": "Anula Aporte", "cedula": "2000000555"}).json()
    a = client.post("/aportes", headers=ta, json={"socio_id": s["id"], "monto": 30}).json()
    lib = client.get(f"/mi-libreta?socio_id={s['id']}", headers=ta).json()
    assert lib["socio"]["total_aportes"] == 30
    r = client.post(f"/aportes/{a['id']}/anular", headers=ta)
    assert r.status_code == 200 and r.json()["anulado"] is True
    lib = client.get(f"/mi-libreta?socio_id={s['id']}", headers=ta).json()
    assert lib["socio"]["total_aportes"] == 0          # el anulado no cuenta
    assert all(x["id"] != a["id"] for x in lib["aportes"])  # ni aparece en la libreta


def test_editar_aporte_dentro_de_ventana(setup):
    ta = setup["ta"]
    s = client.post("/socios", headers=ta, json={"nombres": "Edita Aporte", "cedula": "2000000556"}).json()
    a = client.post("/aportes", headers=ta, json={"socio_id": s["id"], "monto": 10}).json()
    r = client.patch(f"/aportes/{a['id']}", headers=ta, json={"monto": 12})
    assert r.status_code == 200 and r.json()["monto"] == 12


def test_tesorero_no_edita_pasada_la_ventana(setup):
    """Si el movimiento se creó hace >5 min, el tesorero recibe 403; el superadmin sí puede."""
    ta = setup["ta"]; sa = setup["sa"]
    s = client.post("/socios", headers=ta, json={"nombres": "Tardío", "cedula": "2000000557"}).json()
    a = client.post("/aportes", headers=ta, json={"socio_id": s["id"], "monto": 10}).json()
    # forzar creado_en al pasado
    db = SessionLocal()
    try:
        ap = db.get(models.Aporte, a["id"])
        from datetime import datetime, timedelta
        ap.creado_en = datetime.utcnow() - timedelta(minutes=10)
        db.commit()
    finally:
        db.close()
    r = client.post(f"/aportes/{a['id']}/anular", headers=ta)
    assert r.status_code == 403
    # superadmin autoriza (anula) sin límite
    ca = next(c for c in client.get("/cajas", headers=sa).json() if c["slug"] == "caja-a")
    imp = client.post("/auth/asumir-caja", headers=sa, json={"caja_id": ca["id"], "rol": "tesorero"}).json()
    # el superadmin actúa directamente con su propio token
    r2 = client.post(f"/aportes/{a['id']}/anular", headers=sa)
    # superadmin necesita caja_id para scope en algunos endpoints, pero anular usa el del aporte
    assert r2.status_code in (200,)  # superadmin puede anular pasado el tiempo


def test_export_solo_superadmin(setup):
    assert client.get("/export", headers=setup["ta"]).status_code == 403
    r = client.get("/export", headers=setup["sa"])
    assert r.status_code == 200
    d = r.json()
    assert "cajas" in d and "aportes" in d and "auditoria" in d
    # nunca exporta contraseñas
    assert all("password_hash" not in u for u in d["usuarios"])


# ---------------- cambio de clave obligatorio, demografía, recordatorios ----------------

def test_socio_nuevo_debe_cambiar_password(setup):
    ta = setup["ta"]
    client.post("/socios", headers=ta, json={"nombres": "Nueva Clave", "cedula": "2000000601"})
    data = login_full("2000000601", "2000000601")
    assert data["debe_cambiar_password"] is True
    # cambiarla limpia el flag
    tok = data["access_token"]
    r = client.post("/auth/cambiar-password", headers={"Authorization": f"Bearer {tok}"},
                    json={"actual": "2000000601", "nueva": "claveNueva1"})
    assert r.status_code == 200
    data2 = login_full("2000000601", "claveNueva1")
    assert data2["debe_cambiar_password"] is False


def test_demografia(setup):
    ta = setup["ta"]
    client.post("/socios", headers=ta, json={"nombres": "Demo Uno", "cedula": "2000000611",
        "genero": "F", "fecha_nacimiento": "1985-01-01", "nivel_instruccion": "Secundaria"})
    r = client.get("/demografia", headers=ta)
    assert r.status_code == 200
    d = r.json()
    assert "genero" in d and "edad" in d and d["total"] >= 1


def test_recordatorios(setup):
    ta = setup["ta"]
    s = client.post("/socios", headers=ta, json={"nombres": "Recordar Yo", "cedula": "2000000612",
        "whatsapp": "0991112222"}).json()
    from datetime import date, timedelta
    client.post("/creditos", headers=ta, json={"socio_id": s["id"], "monto": 120, "plazo_meses": 3,
        "fecha_desembolso": (date.today() - timedelta(days=40)).isoformat()})
    r = client.get("/recordatorios", headers=ta)
    assert r.status_code == 200
    items = r.json()
    assert any(x["socio"] == "Recordar Yo" and x["whatsapp"] == "0991112222" for x in items)


def test_socio_solicita_y_tesorero_aprueba(setup):
    ta = setup["ta"]
    s = client.post("/socios", headers=ta, json={"nombres": "Auto Edita", "cedula": "2000000701"}).json()
    socio = login("2000000701", "2000000701")
    # el socio SOLICITA (no se aplica todavía)
    r = client.post("/socios/solicitud", headers=socio,
                    json={"whatsapp": "0987654321", "correo": "a@b.com", "nombres": "HACK"})
    assert r.status_code == 200
    assert r.json()["estado"] == "pendiente" and "nombres" not in r.json()["campos"]
    # aún no cambió
    assert client.get("/mi-libreta", headers=socio).json()["socio"]["whatsapp"] != "0987654321"
    # el tesorero ve la solicitud y la aprueba
    sols = client.get("/socios/solicitudes", headers=ta).json()
    sid = next(x["id"] for x in sols if x["socio_id"] == s["id"])
    ap = client.post(f"/socios/solicitudes/{sid}/aprobar", headers=ta)
    assert ap.status_code == 200 and ap.json()["whatsapp"] == "0987654321"
    assert ap.json()["nombres"] == "Auto Edita"  # nunca se cambia el nombre
    # el tesorero no puede crear solicitud
    assert client.post("/socios/solicitud", headers=ta, json={"whatsapp": "x"}).status_code == 403


def test_estadisticas_uso_superadmin(setup):
    # genera algún acceso
    login("admin", "test-admin-123"); login("1000000001", "secreta123")
    assert client.get("/admin/estadisticas", headers=setup["ta"]).status_code == 403
    r = client.get("/admin/estadisticas", headers=setup["sa"])
    assert r.status_code == 200
    d = r.json()
    assert "resumen" in d and "accesos_por_dia" in d and "usuarios" in d
    assert d["resumen"]["accesos_30d"] >= 1
    assert len(d["accesos_por_dia"]) == 30


def test_bitacora_socio_no_ve_a_otros_socios(setup):
    """El socio no ve en la bitácora los movimientos (monto/nombre) de otros socios,
    salvo que la caja active transparencia_total."""
    sa, ta = setup["sa"], setup["ta"]
    ca = next(c for c in client.get("/cajas", headers=sa).json() if c["slug"] == "caja-a")
    # asegurar transparencia_total = False
    client.patch(f"/cajas/{ca['id']}", headers=sa, json={"transparencia_total": False})
    otro = client.post("/socios", headers=ta, json={"nombres": "Privado Otro", "cedula": "2000000801"}).json()
    client.post("/aportes", headers=ta, json={"socio_id": otro["id"], "monto": 33})
    socio_a = login("2000000001", "2000000001")
    items = client.get("/auditoria", headers=socio_a).json()
    detalles = " ".join(i["detalle"] for i in items)
    assert "Privado Otro" not in detalles    # no ve al otro socio
    # con transparencia total, sí lo ve
    client.patch(f"/cajas/{ca['id']}", headers=sa, json={"transparencia_total": True})
    items2 = client.get("/auditoria", headers=socio_a).json()
    assert "Privado Otro" in " ".join(i["detalle"] for i in items2)
    client.patch(f"/cajas/{ca['id']}", headers=sa, json={"transparencia_total": False})


def test_rol_directiva_solo_lectura(setup):
    sa = setup["sa"]
    ca = next(c for c in client.get("/cajas", headers=sa).json() if c["slug"] == "caja-a")
    r = client.post(f"/cajas/{ca['id']}/directiva", headers=sa,
                    json={"nombre": "Presi Directiva", "cedula": "1000000900", "password": "clave123"})
    assert r.status_code == 200, r.text
    dire = login("1000000900", "clave123")
    # lectura: OK
    assert client.get("/dashboard", headers=dire).status_code == 200
    assert client.get("/socios", headers=dire).status_code == 200
    assert client.get("/analitica", headers=dire).status_code == 200
    assert client.get("/balances", headers=dire).status_code == 200
    # escritura: prohibido
    assert client.post("/socios", headers=dire, json={"nombres": "X", "cedula": "9999"}).status_code == 403
    assert client.post("/aportes", headers=dire, json={"socio_id": setup["socio_a"]["id"], "monto": 5}).status_code == 403


def test_analitica_contenido(setup):
    r = client.get("/analitica", headers=setup["ta"])
    assert r.status_code == 200
    d = r.json()
    for k in ("serie", "top_ingresos", "destinos", "distribucion_montos", "tipos_aporte", "resumen_creditos"):
        assert k in d


def test_login_rate_limit():
    for _ in range(5):
        r = client.post("/auth/login", json={"cedula": "9999999999", "password": "mala"})
        assert r.status_code == 401
    r = client.post("/auth/login", json={"cedula": "9999999999", "password": "mala"})
    assert r.status_code == 429


def test_anonimizar_socio_conserva_contabilidad(setup):
    ta = setup["ta"]
    s = client.post("/socios", headers=ta, json={"nombres": "Borrar Me", "cedula": "2000000910",
                    "whatsapp": "0991231231", "consentimiento_datos": True}).json()
    assert s["consentimiento_datos"] is True
    client.post("/aportes", headers=ta, json={"socio_id": s["id"], "monto": 40})
    r = client.post(f"/socios/{s['id']}/anonimizar", headers=ta)
    assert r.status_code == 200
    d = r.json()
    assert d["nombres"] == "Socio retirado" and d["whatsapp"] == "" and d["activo"] is False
    assert d["cedula"].startswith("ANON-")
    # la contabilidad se conserva (su ahorro sigue ahí)
    assert d["total_aportes"] == 40
    # ya no puede iniciar sesión
    assert client.post("/auth/login", json={"cedula": "2000000910", "password": "2000000910"}).status_code == 401


def test_estado_seguridad(setup):
    assert client.get("/admin/seguridad", headers=setup["ta"]).status_code == 403
    r = client.get("/admin/seguridad", headers=setup["sa"])
    assert r.status_code == 200 and "checks" in r.json()


def test_credito_limite_y_garante(setup):
    sa, ta = setup["sa"], setup["ta"]
    ca = next(c for c in client.get("/cajas", headers=sa).json() if c["slug"] == "caja-a")
    client.patch(f"/cajas/{ca['id']}", headers=sa, json={"credito_max": 50})
    r = client.post("/creditos", headers=ta, json={"socio_id": setup["socio_a"]["id"], "monto": 100, "plazo_meses": 3})
    assert r.status_code == 400 and "máximo" in r.json()["detail"]
    client.patch(f"/cajas/{ca['id']}", headers=sa, json={"credito_max": 0})
    r = client.post("/creditos", headers=ta, json={"socio_id": setup["socio_a"]["id"], "monto": 100,
                    "plazo_meses": 3, "garante": "José Farinango"})
    assert r.status_code == 200 and r.json()["garante"] == "José Farinango"


def test_cierre_capitalizar_mantiene_fondo(setup):
    ta = setup["ta"]
    antes = client.get("/dashboard", headers=ta).json()
    r = client.post("/cierre/ejecutar?caja_id=" + str(antes["caja"]["id"]), headers=ta, json={"modo": "capitalizar"})
    # caja-a tiene intereses por créditos pagados
    assert r.status_code == 200, r.text
    assert r.json()["repartido"] > 0
    despues = client.get("/dashboard", headers=ta).json()
    assert abs(despues["fondo_disponible"] - antes["fondo_disponible"]) < 1.0   # el fondo no cambia
    assert despues["total_aportes"] > antes["total_aportes"]                    # el ahorro sube
    assert despues["utilidades_capitalizadas"] > 0


def test_2fa_flujo(setup):
    """Activar 2FA y exigirlo en el login."""
    import pyotp
    ta = setup["ta"]
    ini = client.post("/auth/2fa/iniciar", headers=ta).json()
    secret = ini["secret"]; assert secret
    codigo = pyotp.TOTP(secret).now()
    assert client.post("/auth/2fa/activar", headers=ta, json={"codigo": codigo}).status_code == 200
    # ahora el login sin código falla
    r = client.post("/auth/login", json={"cedula": "1000000001", "password": "secreta123"})
    assert r.status_code == 401 and "2FA" in r.json()["detail"]
    # con código entra
    r = client.post("/auth/login", json={"cedula": "1000000001", "password": "secreta123",
                                         "totp": pyotp.TOTP(secret).now()})
    assert r.status_code == 200
    # desactivar
    h = {"Authorization": f"Bearer {r.json()['access_token']}"}
    assert client.post("/auth/2fa/desactivar", headers=h, json={"codigo": pyotp.TOTP(secret).now()}).status_code == 200


def test_solicitud_credito_aprueba_directiva(setup):
    sa, ta = setup["sa"], setup["ta"]
    ca = next(c for c in client.get("/cajas", headers=sa).json() if c["slug"] == "caja-a")
    client.post(f"/cajas/{ca['id']}/directiva", headers=sa,
                json={"nombre": "Dire Cred", "cedula": "1000000950", "password": "clave123"})
    dire = login("1000000950", "clave123")
    s = client.post("/socios", headers=ta, json={"nombres": "Pide Credito", "cedula": "2000000970"}).json()
    socio = login("2000000970", "2000000970")
    r = client.post("/creditos/solicitud", headers=socio, json={
        "monto": 300, "plazo_meses": 6, "tipo": "emergente", "destino": "Salud",
        "garante": "Ana A", "garante2": "Beto B", "documentos": "letra de cambio"})
    assert r.status_code == 200, r.text
    sid = r.json()["id"]
    # la directiva no puede aprobar antes del filtro del tesorero
    assert client.post(f"/creditos/solicitudes/{sid}/aprobar", headers=dire).status_code == 400
    # el tesorero hace el filtro previo y deriva a la directiva
    der = client.post(f"/creditos/solicitudes/{sid}/derivar", headers=ta)
    assert der.status_code == 200 and der.json()["estado"] == "en_aprobacion"
    # el tesorero NO puede aprobar
    assert client.post(f"/creditos/solicitudes/{sid}/aprobar", headers=ta).status_code == 403
    # ahora sí la directiva aprueba
    ap = client.post(f"/creditos/solicitudes/{sid}/aprobar", headers=dire)
    assert ap.status_code == 200 and ap.json()["tipo"] == "emergente" and ap.json()["monto"] == 300
    assert client.get("/creditos/solicitud", headers=socio).json() is None


def test_solicitud_credito_correccion_y_reenvio(setup):
    sa, ta = setup["sa"], setup["ta"]
    client.post("/socios", headers=ta, json={"nombres": "Corrige Doc", "cedula": "2000000981"})
    socio = login("2000000981", "2000000981")
    body = {"monto": 200, "plazo_meses": 4, "tipo": "ordinario", "destino": "Salud",
            "garante": "Ana A", "documentos": "incompleto"}
    sid = client.post("/creditos/solicitud", headers=socio, json=body).json()["id"]
    # tesorero pide corrección
    c = client.post(f"/creditos/solicitudes/{sid}/correccion?motivo=Falta+la+letra", headers=ta)
    assert c.status_code == 200 and c.json()["estado"] == "correccion"
    # el socio ve el motivo
    mi = client.get("/creditos/solicitud", headers=socio).json()
    assert mi["estado"] == "correccion" and "letra" in mi["motivo"].lower()
    # reenvía: reutiliza la misma fila y vuelve a "pendiente"
    r2 = client.post("/creditos/solicitud", headers=socio, json={**body, "documentos": "letra de cambio"})
    assert r2.status_code == 200 and r2.json()["id"] == sid and r2.json()["estado"] == "pendiente"


def test_restablecer_acceso(setup):
    sa, ta = setup["sa"], setup["ta"]
    client.post("/socios", headers=ta, json={"nombres": "Olvida Clave", "cedula": "2000000990"})
    # tesorero reinicia contraseña de su socio
    r = client.post("/auth/restablecer/password", headers=ta, json={"cedula": "2000000990"})
    assert r.status_code == 200 and r.json()["password_temporal"] == "2000000990"
    # y restablece su 2FA
    assert client.post("/auth/restablecer/2fa", headers=ta, json={"cedula": "2000000990"}).status_code == 200
    # superadmin puede con cualquiera; cédula inexistente -> 404
    assert client.post("/auth/restablecer/2fa", headers=sa, json={"cedula": "0000000000"}).status_code == 404
    # un socio no puede usar estos endpoints
    socio = login("2000000990", "2000000990")
    assert client.post("/auth/restablecer/2fa", headers=socio, json={"cedula": "2000000990"}).status_code == 403


def test_flujo_garantes(setup):
    sa, ta = setup["sa"], setup["ta"]
    ca = next(c for c in client.get("/cajas", headers=sa).json() if c["slug"] == "caja-a")
    client.post(f"/cajas/{ca['id']}/directiva", headers=sa,
                json={"nombre": "Dire G", "cedula": "1000000960", "password": "clave123"})
    dire = login("1000000960", "clave123")
    sA = client.post("/socios", headers=ta, json={"nombres": "Solicita G", "cedula": "2000001001"}).json()
    sB = client.post("/socios", headers=ta, json={"nombres": "Garante Uno", "cedula": "2000001002"}).json()
    sC = client.post("/socios", headers=ta, json={"nombres": "Garante Dos", "cedula": "2000001003"}).json()
    socioA = login("2000001001", "2000001001")
    socioB = login("2000001002", "2000001002")
    socioC = login("2000001003", "2000001003")
    # A solicita con dos garantes (B y C)
    r = client.post("/creditos/solicitud", headers=socioA, json={
        "monto": 300, "plazo_meses": 6, "tipo": "ordinario", "destino": "Salud",
        "garante_id": sB["id"], "garante2_id": sC["id"], "documentos": "letra"})
    assert r.status_code == 200 and r.json()["estado"] == "garantes"
    sid = r.json()["id"]
    # aún no llega al tesorero
    assert not any(s["id"] == sid for s in client.get("/creditos/solicitudes", headers=ta).json())
    # B ve su garantía y acepta
    assert any(g["id"] == sid for g in client.get("/creditos/garantias", headers=socioB).json())
    client.post(f"/creditos/solicitudes/{sid}/garantia?accion=aceptar", headers=socioB)
    # sigue en garantes (falta C)
    assert client.get("/creditos/solicitud", headers=socioA).json()["estado"] == "garantes"
    # C acepta -> pasa al tesorero
    client.post(f"/creditos/solicitudes/{sid}/garantia?accion=aceptar", headers=socioC)
    assert client.get("/creditos/solicitud", headers=socioA).json()["estado"] == "pendiente"
    assert any(s["id"] == sid for s in client.get("/creditos/solicitudes", headers=ta).json())
    # tesorero deriva, directiva aprueba
    client.post(f"/creditos/solicitudes/{sid}/derivar", headers=ta)
    assert client.post(f"/creditos/solicitudes/{sid}/aprobar", headers=dire).status_code == 200


def test_garante_rechaza_vuelve_al_socio(setup):
    sa, ta = setup["sa"], setup["ta"]
    sA = client.post("/socios", headers=ta, json={"nombres": "Sol Rch", "cedula": "2000001010"}).json()
    sB = client.post("/socios", headers=ta, json={"nombres": "Gar Rch", "cedula": "2000001011"}).json()
    socioA = login("2000001010", "2000001010")
    socioB = login("2000001011", "2000001011")
    sid = client.post("/creditos/solicitud", headers=socioA, json={
        "monto": 200, "plazo_meses": 4, "tipo": "ordinario", "destino": "Salud",
        "garante_id": sB["id"], "documentos": "letra"}).json()["id"]
    # B rechaza -> vuelve al solicitante (correccion)
    client.post(f"/creditos/solicitudes/{sid}/garantia?accion=rechazar", headers=socioB)
    mi = client.get("/creditos/solicitud", headers=socioA).json()
    assert mi["estado"] == "correccion" and "garante" in mi["motivo"].lower()


def test_limite_dos_garantias(setup):
    ta = setup["ta"]
    g = client.post("/socios", headers=ta, json={"nombres": "Garante Top", "cedula": "2000001050"}).json()
    pedidores = []
    for i in range(3):
        ced = f"200000106{i}"
        client.post("/socios", headers=ta, json={"nombres": f"Pide {i}", "cedula": ced})
        pedidores.append(login(ced, ced))
    body = lambda: {"monto": 100, "plazo_meses": 3, "tipo": "ordinario", "destino": "Salud",
                    "garante_id": g["id"], "documentos": "x"}
    assert client.post("/creditos/solicitud", headers=pedidores[0], json=body()).status_code == 200
    assert client.post("/creditos/solicitud", headers=pedidores[1], json=body()).status_code == 200
    # el tercero debe fallar: el garante ya respalda a 2
    r = client.post("/creditos/solicitud", headers=pedidores[2], json=body())
    assert r.status_code == 400 and "2 socios" in r.json()["detail"]
    # el garante ve su historial con 2 registros
    gar = login("2000001050", "2000001050")
    assert len(client.get("/creditos/mis-garantias", headers=gar).json()) == 2
    # el solicitante ve su historial
    assert len(client.get("/creditos/mis-solicitudes", headers=pedidores[0]).json()) >= 1
