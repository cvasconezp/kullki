"""
Módulo de migración de datos: socios, aportes y créditos desde Excel/CSV.
Endpoints:
  POST /importar/analizar      → parse + propone mapeo de columnas
  POST /importar/preview       → aplica mapeo, normaliza, valida (dry-run)
  POST /importar/confirmar     → inserta datos válidos en un lote trazable
  DELETE /importar/{lote_id}   → revierte un lote completo
"""
from __future__ import annotations
import io, json, unicodedata, re
from datetime import date, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from .database import get_db
from . import models
from .crypto import blind_index
from .auth import require_roles, Actor, caja_scope, hash_password

router = APIRouter(prefix="/importar", tags=["importar"])

# ── helpers ────────────────────────────────────────────────────────────────

def _norm(s: str) -> str:
    """Normaliza texto: sin tildes, minúsculas, guiones→underscore."""
    s = unicodedata.normalize("NFD", str(s or ""))
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[\s\-/]+", "_", s.lower()).strip("_")


def _fecha(raw: str) -> date | None:
    raw = str(raw or "").strip()
    if not raw or raw.lower() in ("none", "null", "nan", ""):
        return None
    # Número Excel serial
    try:
        n = float(raw)
        return (date(1899, 12, 30) + timedelta(days=int(n)))
    except ValueError:
        pass
    for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%Y-%m-%d", "%Y/%m/%d",
                "%d/%m/%y", "%d-%m-%y"):
        try:
            return datetime.strptime(raw, fmt).date()
        except ValueError:
            pass
    return None


def _monto(raw: str) -> float | None:
    raw = re.sub(r"[^\d.,\-]", "", str(raw or "")).strip()
    if not raw:
        return None
    # Separador de miles: si hay punto Y coma, el último es decimal
    if "," in raw and "." in raw:
        if raw.rfind(",") > raw.rfind("."):
            raw = raw.replace(".", "").replace(",", ".")
        else:
            raw = raw.replace(",", "")
    elif "," in raw:
        raw = raw.replace(",", ".")
    try:
        return float(raw)
    except ValueError:
        return None


def _cedula_ec(raw: str) -> str:
    """Limpia y valida cédula ecuatoriana (10 dígitos + dígito verificador)."""
    c = re.sub(r"[^\d]", "", str(raw or ""))
    return c  # devolver limpia; validación en preview


def _validar_cedula(c: str) -> bool:
    if not re.fullmatch(r"\d{10}", c):
        return False
    coefs = [2, 1, 2, 1, 2, 1, 2, 1, 2]
    s = sum((d * coefs[i] - 9 if d * coefs[i] > 9 else d * coefs[i])
            for i, d in enumerate(int(x) for x in c[:9]))
    ver = (10 - (s % 10)) % 10
    return ver == int(c[9])


# ── mapeo de columnas ──────────────────────────────────────────────────────

CAMPOS_SOCIO = {
    "nombres":             ["nombres","nombre","nombre_completo","apellidos_nombres","socio"],
    "cedula":              ["cedula","cedula_identidad","ci","cc","dni","identificacion","id"],
    "telefono":            ["telefono","tel","celular","cel","movil","telf"],
    "correo":              ["correo","email","mail","correo_electronico"],
    "whatsapp":            ["whatsapp","wa","numero_wa"],
    "direccion":           ["direccion","domicilio","dir","residencia"],
    "ocupacion":           ["ocupacion","trabajo","profesion","actividad","cargo"],
    "genero":              ["genero","sexo","genero_sexo"],
    "estado_civil":        ["estado_civil","estadocivil","civil"],
    "nivel_instruccion":   ["nivel_instruccion","instruccion","educacion","nivel_educativo"],
    "num_cargas":          ["num_cargas","cargas","cargas_familiares","dependientes"],
    "contacto_emergencia": ["contacto_emergencia","emergencia","contacto","referencia"],
    "fecha_ingreso":       ["fecha_ingreso","ingreso","fecha_entrada","f_ingreso"],
    "fecha_nacimiento":    ["fecha_nacimiento","nacimiento","f_nac","fecha_nac"],
}

CAMPOS_APORTE = {
    "cedula_socio":  ["cedula","cedula_socio","ci","cc","identificacion","socio_cedula"],
    "nombre_socio":  ["nombre","nombres","socio","nombre_socio"],
    "monto":         ["monto","valor","cantidad","deposito","aporte","importe"],
    "fecha":         ["fecha","fecha_aporte","fecha_deposito","fecha_pago","dia"],
    "tipo":          ["tipo","tipo_aporte","categoria"],
    "nota":          ["nota","observacion","concepto","descripcion","detalle","comentario"],
}

CAMPOS_CREDITO = {
    "cedula_socio":   ["cedula","cedula_socio","ci","cc","identificacion","socio"],
    "nombre_socio":   ["nombre","nombres","nombre_socio"],
    "monto":          ["monto","valor","capital","monto_credito","prestamo","importe"],
    "tasa_mensual":   ["tasa","tasa_mensual","interes","tasa_interes","tasa_mes","interes_mensual"],
    "plazo_meses":    ["plazo","plazo_meses","meses","num_cuotas","cuotas","numero_cuotas"],
    "fecha_desembolso":["fecha_desembolso","fecha","fecha_credito","fecha_otorgamiento","inicio"],
    "destino":        ["destino","proposito","motivo","uso","para"],
    "garante":        ["garante","garante1","fiador","aval"],
    "tipo":           ["tipo","tipo_credito","modalidad"],
    "estado":         ["estado","status","situacion"],
    "cuotas_pagadas": ["cuotas_pagadas","pagadas","cuotas_canceladas","num_pagadas","n_cuotas_pagadas"],
}

ALL_CAMPOS = {
    "socios":   CAMPOS_SOCIO,
    "aportes":  CAMPOS_APORTE,
    "creditos": CAMPOS_CREDITO,
}

TIPOS_APORTE_VALIDOS = {"ordinario", "extraordinario", "multa", "eco_ahorro", "mascotas"}
TIPOS_CREDITO_VALIDOS = {"ordinario", "emergente"}


def _detectar_entidad(cabeceras: list[str]) -> str:
    """Detecta el tipo de entidad por las cabeceras."""
    normas = {_norm(h) for h in cabeceras}
    scores = {}
    for entidad, campos in ALL_CAMPOS.items():
        sc = 0
        for campo, alias in campos.items():
            for a in alias:
                if _norm(a) in normas:
                    sc += (3 if campo in ("cedula", "cedula_socio", "monto", "nombres") else 1)
                    break
        scores[entidad] = sc
    return max(scores, key=scores.get)


def _mapear_columnas(cabeceras: list[str], entidad: str) -> dict[str, str | None]:
    """Devuelve {campo_kullki: col_archivo | None}."""
    campos = ALL_CAMPOS[entidad]
    normas = {_norm(h): h for h in cabeceras}
    mapeo: dict[str, str | None] = {}
    for campo, alias in campos.items():
        mapeo[campo] = None
        for a in alias:
            if _norm(a) in normas:
                mapeo[campo] = normas[_norm(a)]
                break
    return mapeo


def _leer_xlsx(contenido: bytes):
    """Lee .xlsx y devuelve (cabeceras, filas_como_dict_str)."""
    import openpyxl
    wb = openpyxl.load_workbook(io.BytesIO(contenido), data_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        raise HTTPException(400, "El archivo está vacío")
    cabeceras = [str(c or "").strip() for c in rows[0]]
    filas = []
    for row in rows[1:]:
        if all(v is None or str(v).strip() == "" for v in row):
            continue
        filas.append({cabeceras[i]: str(v).strip() if v is not None else ""
                      for i, v in enumerate(row) if i < len(cabeceras)})
    return cabeceras, filas


def _leer_csv(contenido: bytes):
    import csv
    texto = contenido.decode("utf-8-sig", errors="replace")
    reader = csv.DictReader(io.StringIO(texto))
    cabeceras = list(reader.fieldnames or [])
    filas = [dict(row) for row in reader if any(v.strip() for v in row.values())]
    return cabeceras, filas


# ── normalización y validación ─────────────────────────────────────────────

def _normalizar_socio(raw: dict, mapeo: dict) -> tuple[dict, list[str]]:
    errores = []
    def g(campo): return raw.get(mapeo.get(campo) or "", "")

    nombres = g("nombres").strip()
    cedula  = _cedula_ec(g("cedula"))

    if not nombres:
        errores.append("nombres vacío")
    if not cedula:
        errores.append("cédula vacía")
    elif not _validar_cedula(cedula):
        errores.append(f"cédula inválida: {cedula}")

    fi = _fecha(g("fecha_ingreso"))
    fn = _fecha(g("fecha_nacimiento"))

    try:
        cargas = int(g("num_cargas") or "0")
    except ValueError:
        cargas = 0

    datos = {
        "nombres": nombres, "cedula": cedula,
        "telefono": g("telefono"), "correo": g("correo"),
        "whatsapp": g("whatsapp"), "direccion": g("direccion"),
        "ocupacion": g("ocupacion"), "genero": g("genero"),
        "estado_civil": g("estado_civil"),
        "nivel_instruccion": g("nivel_instruccion"),
        "num_cargas": cargas,
        "contacto_emergencia": g("contacto_emergencia"),
        "fecha_ingreso": str(fi or date.today()),
        "fecha_nacimiento": str(fn) if fn else "",
    }
    return datos, errores


def _normalizar_aporte(raw: dict, mapeo: dict) -> tuple[dict, list[str]]:
    errores = []
    def g(campo): return raw.get(mapeo.get(campo) or "", "")

    cedula = _cedula_ec(g("cedula_socio"))
    nombre = g("nombre_socio").strip()
    monto  = _monto(g("monto"))
    fecha  = _fecha(g("fecha"))
    tipo   = _norm(g("tipo")) or "ordinario"
    if tipo not in TIPOS_APORTE_VALIDOS:
        tipo = "ordinario"

    if not cedula and not nombre:
        errores.append("falta cédula o nombre del socio")
    if monto is None or monto <= 0:
        errores.append(f"monto inválido: {g('monto')!r}")
    if fecha is None:
        errores.append(f"fecha inválida: {g('fecha')!r}")

    datos = {
        "cedula_socio": cedula, "nombre_socio": nombre,
        "monto": monto, "fecha": str(fecha or date.today()),
        "tipo": tipo, "nota": g("nota"),
    }
    return datos, errores


def _normalizar_credito(raw: dict, mapeo: dict) -> tuple[dict, list[str]]:
    errores = []
    def g(campo): return raw.get(mapeo.get(campo) or "", "")

    cedula = _cedula_ec(g("cedula_socio"))
    nombre = g("nombre_socio").strip()
    monto  = _monto(g("monto"))
    tasa   = _monto(g("tasa_mensual"))
    plazo  = _monto(g("plazo_meses"))
    fecha  = _fecha(g("fecha_desembolso"))
    tipo   = _norm(g("tipo")) or "ordinario"
    if tipo not in TIPOS_CREDITO_VALIDOS:
        tipo = "ordinario"
    estado = _norm(g("estado")) or "activo"
    if estado not in ("activo", "pagado"):
        estado = "activo"

    cuotas_pg_raw = g("cuotas_pagadas")
    try:
        cuotas_pagadas = int(float(cuotas_pg_raw)) if cuotas_pg_raw else None
    except ValueError:
        cuotas_pagadas = None

    if not cedula and not nombre:
        errores.append("falta cédula o nombre del socio")
    if monto is None or monto <= 0:
        errores.append(f"monto inválido: {g('monto')!r}")
    if tasa is None or tasa < 0:
        errores.append(f"tasa inválida: {g('tasa_mensual')!r}")
    if plazo is None or int(plazo or 0) < 1:
        errores.append(f"plazo inválido: {g('plazo_meses')!r}")

    datos = {
        "cedula_socio": cedula, "nombre_socio": nombre,
        "monto": monto, "tasa_mensual": tasa,
        "plazo_meses": int(plazo) if plazo else None,
        "fecha_desembolso": str(fecha or date.today()),
        "destino": g("destino"), "garante": g("garante"),
        "tipo": tipo, "estado": estado,
        "cuotas_pagadas": cuotas_pagadas,
    }
    return datos, errores


NORMALIZADORES = {
    "socios":   _normalizar_socio,
    "aportes":  _normalizar_aporte,
    "creditos": _normalizar_credito,
}


# ── endpoints ──────────────────────────────────────────────────────────────

@router.post("/analizar")
async def analizar(
    archivo: UploadFile = File(...),
    entidad: str = Form("auto"),
    db: Session = Depends(get_db),
    actor: Actor = Depends(require_roles("tesorero", "superadmin")),
):
    """
    Parsea el archivo, detecta el tipo de entidad y propone el mapeo de columnas.
    Devuelve cabeceras, muestra de 5 filas, entidad detectada y mapeo propuesto.
    """
    contenido = await archivo.read()
    nombre = archivo.filename or ""
    try:
        if nombre.lower().endswith(".csv"):
            cabeceras, filas = _leer_csv(contenido)
        else:
            cabeceras, filas = _leer_xlsx(contenido)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(400, f"No se pudo leer el archivo: {exc}")

    if not cabeceras:
        raise HTTPException(400, "El archivo no tiene cabeceras")

    det = entidad if entidad in ALL_CAMPOS else _detectar_entidad(cabeceras)
    mapeo = _mapear_columnas(cabeceras, det)
    muestra = filas[:5]

    return {
        "entidad":   det,
        "total":     len(filas),
        "cabeceras": cabeceras,
        "muestra":   muestra,
        "mapeo":     mapeo,
    }


@router.post("/preview")
async def preview(
    archivo: UploadFile = File(...),
    entidad: str = Form(...),
    mapeo_json: str = Form(...),
    db: Session = Depends(get_db),
    actor: Actor = Depends(require_roles("tesorero", "superadmin")),
):
    """
    Aplica el mapeo a todas las filas, normaliza y valida (sin escribir en DB).
    Devuelve: filas normalizadas, lista de errores por fila, resumen.
    """
    try:
        mapeo: dict = json.loads(mapeo_json)
    except json.JSONDecodeError:
        raise HTTPException(400, "mapeo_json inválido")

    if entidad not in ALL_CAMPOS:
        raise HTTPException(400, f"Entidad desconocida: {entidad}")

    contenido = await archivo.read()
    nombre = archivo.filename or ""
    try:
        if nombre.lower().endswith(".csv"):
            _, filas = _leer_csv(contenido)
        else:
            _, filas = _leer_xlsx(contenido)
    except Exception as exc:
        raise HTTPException(400, str(exc))

    norm_fn = NORMALIZADORES[entidad]
    resultados = []
    validos = omitidos = con_error = 0

    for i, fila in enumerate(filas, 1):
        datos, errs = norm_fn(fila, mapeo)
        if errs:
            con_error += 1
            resultados.append({"fila": i, "datos": datos, "errores": errs, "estado": "error"})
        else:
            validos += 1
            resultados.append({"fila": i, "datos": datos, "errores": [], "estado": "ok"})

    return {
        "total": len(filas),
        "validos": validos,
        "con_error": con_error,
        "filas": resultados[:200],   # máx 200 en preview
    }


def _add_months(d: date, n: int) -> date:
    m = d.month - 1 + n
    return d.replace(year=d.year + m // 12, month=m % 12 + 1, day=min(d.day, 28))


@router.post("/confirmar")
async def confirmar(
    archivo: UploadFile = File(...),
    entidad: str = Form(...),
    mapeo_json: str = Form(...),
    solo_validos: bool = Form(True),
    db: Session = Depends(get_db),
    actor: Actor = Depends(require_roles("tesorero", "superadmin")),
):
    """
    Inserta los datos en la base. Crea un ImportLote para poder revertir.
    """
    try:
        mapeo: dict = json.loads(mapeo_json)
    except json.JSONDecodeError:
        raise HTTPException(400, "mapeo_json inválido")
    if entidad not in ALL_CAMPOS:
        raise HTTPException(400, f"Entidad desconocida: {entidad}")

    cid = caja_scope(actor, None)
    contenido = await archivo.read()
    nombre = archivo.filename or ""
    try:
        if nombre.lower().endswith(".csv"):
            _, filas = _leer_csv(contenido)
        else:
            _, filas = _leer_xlsx(contenido)
    except Exception as exc:
        raise HTTPException(400, str(exc))

    norm_fn = NORMALIZADORES[entidad]

    # Crear lote
    lote = models.ImportLote(
        caja_id=cid, usuario_id=actor.id,
        entidad=entidad, archivo=nombre[:200],
        estado="procesando",
    )
    db.add(lote); db.flush()
    lote_id = lote.id

    importados = omitidos = errores_count = 0
    errores_lista: list[str] = []

    for nrow, fila in enumerate(filas, 1):
        datos, errs = norm_fn(fila, mapeo)
        if errs and solo_validos:
            errores_count += 1
            errores_lista.append(f"Fila {nrow}: {'; '.join(errs)}")
            continue

        try:
            if entidad == "socios":
                _insertar_socio(db, actor, cid, datos, lote_id)
                importados += 1
            elif entidad == "aportes":
                ok = _insertar_aporte(db, actor, cid, datos, lote_id)
                if ok:
                    importados += 1
                else:
                    omitidos += 1
                    errores_lista.append(f"Fila {nrow}: socio no encontrado ({datos.get('cedula_socio')})")
            elif entidad == "creditos":
                ok = _insertar_credito(db, actor, cid, datos, lote_id)
                if ok:
                    importados += 1
                else:
                    omitidos += 1
                    errores_lista.append(f"Fila {nrow}: socio no encontrado ({datos.get('cedula_socio')})")
            db.flush()
        except Exception as exc:
            db.rollback()
            errores_count += 1
            errores_lista.append(f"Fila {nrow}: {exc}")
            # Re-add lote (rollback lo eliminó del session)
            lote = db.get(models.ImportLote, lote_id)

    lote.importados = importados
    lote.omitidos = omitidos + errores_count
    lote.estado = "completado"
    lote.resumen = json.dumps(errores_lista[:50])
    db.commit()

    return {
        "lote_id":   lote_id,
        "importados": importados,
        "omitidos":   omitidos,
        "errores":    errores_count,
        "detalle_errores": errores_lista[:50],
    }


@router.delete("/{lote_id}")
def revertir(
    lote_id: int,
    db: Session = Depends(get_db),
    actor: Actor = Depends(require_roles("tesorero", "superadmin")),
):
    """Elimina todos los registros del lote y marca el lote como revertido."""
    cid = caja_scope(actor, None)
    lote = db.get(models.ImportLote, lote_id)
    if not lote:
        raise HTTPException(404, "Lote no encontrado")
    if lote.caja_id != cid and not actor.es_superadmin:
        raise HTTPException(403, "Sin acceso a este lote")
    if lote.estado == "revertido":
        raise HTTPException(400, "Este lote ya fue revertido")

    entidad = lote.entidad
    if entidad == "socios":
        db.query(models.Socio).filter(models.Socio.import_lote_id == lote_id).delete()
    elif entidad == "aportes":
        db.query(models.Aporte).filter(models.Aporte.import_lote_id == lote_id).delete()
    elif entidad == "creditos":
        # Cuotas se eliminan en cascada
        db.query(models.Credito).filter(models.Credito.import_lote_id == lote_id).delete()

    lote.estado = "revertido"
    db.commit()
    return {"ok": True, "revertidos": lote.importados}


# ── inserción por entidad ──────────────────────────────────────────────────

def _buscar_socio(db, cid, cedula, nombre) -> models.Socio | None:
    if cedula:
        s = db.scalar(select(models.Socio).where(
            models.Socio.caja_id == cid, models.Socio.cedula_bidx == blind_index(cedula)))
        if s:
            return s
    if nombre:
        s = db.scalar(select(models.Socio).where(
            models.Socio.caja_id == cid,
            models.Socio.nombres.ilike(f"%{nombre}%")))
        return s
    return None


def _insertar_socio(db, actor, cid, datos, lote_id):
    cedula = datos["cedula"]
    # Ignorar duplicados
    existe = db.scalar(select(models.Socio).where(
        models.Socio.caja_id == cid, models.Socio.cedula_bidx == blind_index(cedula)))
    if existe:
        return False

    fi = _fecha(datos.get("fecha_ingreso")) or date.today()
    fn = _fecha(datos.get("fecha_nacimiento"))

    socio = models.Socio(
        caja_id=cid, nombres=datos["nombres"], cedula=cedula,
        telefono=datos.get("telefono",""), correo=datos.get("correo",""),
        whatsapp=datos.get("whatsapp",""), direccion=datos.get("direccion",""),
        ocupacion=datos.get("ocupacion",""), genero=datos.get("genero",""),
        estado_civil=datos.get("estado_civil",""),
        nivel_instruccion=datos.get("nivel_instruccion",""),
        num_cargas=datos.get("num_cargas",0),
        contacto_emergencia=datos.get("contacto_emergencia",""),
        fecha_ingreso=fi, fecha_nacimiento=fn,
        import_lote_id=lote_id,
    )
    db.add(socio); db.flush()

    # Crear usuario si no existe
    usuario = db.scalar(select(models.Usuario).where(models.Usuario.cedula_bidx == blind_index(cedula)))
    if not usuario:
        usuario = models.Usuario(nombre=datos["nombres"], cedula=cedula,
                                  password_hash=hash_password(cedula),
                                  debe_cambiar_password=True)
        db.add(usuario); db.flush()
    if not usuario.es_superadmin:
        db.add(models.Membresia(usuario_id=usuario.id, caja_id=cid,
                                socio_id=socio.id, rol="socio"))
    return True


def _insertar_aporte(db, actor, cid, datos, lote_id) -> bool:
    socio = _buscar_socio(db, cid, datos.get("cedula_socio"), datos.get("nombre_socio"))
    if not socio:
        return False

    monto = float(datos["monto"])
    fecha = _fecha(datos["fecha"]) or date.today()
    tipo  = datos.get("tipo") or "ordinario"

    aporte = models.Aporte(
        caja_id=cid, socio_id=socio.id,
        monto=monto, fecha=fecha, tipo=tipo,
        nota=datos.get("nota",""),
        registrado_por=actor.id,
        import_lote_id=lote_id,
    )
    db.add(aporte)
    return True


def _insertar_credito(db, actor, cid, datos, lote_id) -> bool:
    socio = _buscar_socio(db, cid, datos.get("cedula_socio"), datos.get("nombre_socio"))
    if not socio:
        return False

    monto  = float(datos["monto"])
    tasa   = float(datos["tasa_mensual"])
    plazo  = int(datos["plazo_meses"])
    inicio = _fecha(datos["fecha_desembolso"]) or date.today()
    tipo   = datos.get("tipo","ordinario")
    estado = datos.get("estado","activo")
    cuotas_pagadas = datos.get("cuotas_pagadas")

    credito = models.Credito(
        caja_id=cid, socio_id=socio.id,
        monto=monto, tasa_mensual=tasa, plazo_meses=plazo,
        fecha_desembolso=inicio,
        destino=datos.get("destino",""),
        garante=datos.get("garante",""),
        tipo=tipo, estado=estado,
        registrado_por=actor.id,
        import_lote_id=lote_id,
    )
    db.add(credito); db.flush()

    # Tabla de amortización (sistema francés)
    i = tasa / 100.0; n = plazo; saldo = monto
    cuota_fija = monto * (i * (1 + i)**n) / ((1+i)**n - 1) if i > 0 else monto / n

    if estado == "pagado":
        pagadas_hasta = plazo
    elif cuotas_pagadas is not None:
        pagadas_hasta = min(cuotas_pagadas, plazo)
    else:
        pagadas_hasta = 0

    for k in range(1, n + 1):
        interes = round(saldo * i, 2)
        capital = round(cuota_fija - interes, 2) if k < n else round(saldo, 2)
        total   = round(capital + interes, 2)
        saldo   = round(saldo - capital, 2)
        venc    = _add_months(inicio, k)
        pagada  = k <= pagadas_hasta
        db.add(models.Cuota(
            credito_id=credito.id, numero=k,
            fecha_vencimiento=venc,
            capital=capital, interes=interes, total=total,
            abonado=total if pagada else 0.0,
            pagada=pagada,
            fecha_pago=venc if pagada else None,
        ))
    return True
