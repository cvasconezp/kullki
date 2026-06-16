"""Tests para los endpoints de exportación Excel."""
import pytest

_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


@pytest.fixture
def headers(token_tesorero):
    return {"Authorization": f"Bearer {token_tesorero}"}


def test_excel_balance(client, seed, headers):
    r = client.get("/exportar/excel/balance", headers=headers)
    assert r.status_code == 200
    assert r.headers["content-type"].startswith(_XLSX)
    assert len(r.content) > 100


def test_excel_cartera(client, seed, headers):
    r = client.get("/exportar/excel/cartera", headers=headers)
    assert r.status_code == 200
    assert r.headers["content-type"].startswith(_XLSX)


def test_excel_movimientos(client, seed, headers):
    r = client.get("/exportar/excel/movimientos", headers=headers)
    assert r.status_code == 200
    assert r.headers["content-type"].startswith(_XLSX)


def test_excel_completo(client, seed, headers):
    r = client.get("/exportar/excel/completo", headers=headers)
    assert r.status_code == 200
    assert r.headers["content-type"].startswith(_XLSX)
    cd = r.headers.get("content-disposition", "")
    assert "attachment" in cd


def test_excel_sin_auth(client, seed):
    """Sin token → 401 o 403."""
    r = client.get("/exportar/excel/balance")
    assert r.status_code in (401, 403)


def test_excel_movimientos_tesorero_puede(client, seed, headers):
    """El tesorero puede descargar movimientos."""
    r = client.get("/exportar/excel/movimientos", headers=headers)
    assert r.status_code == 200
