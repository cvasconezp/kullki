from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .database import get_db
from . import models, schemas
from .auth import (
    create_token, verify_password, hash_password,
    get_current_user, require_roles, caja_scope, log_audit,
)

# ---------------------------------------------------------------- helpers
def _add_months(d: date, n: int) -> date:
    m = d.month - 1 + n
    y = d.year + m // 12
    m = m % 12 + 1
    day = min(d.day, [31, 29 if y % 4 == 0 and (y % 100 != 0 or y % 400 == 0) else 28,
                      31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1])
    return date(y, m, day)


def _saldo_capital(credito: models.Credito) -> float:
    return round(sum(c.capital for c in credito.cuotas if not c.pagada), 2)


def _en_mora(credito: models.Credito) -> bool:
    hoy = date.today()
    return any((not c.pagada) and c.fecha_vencimiento < hoy for c in credito.cuotas)


def _socio_out(db: Session, s: models.Socio) -> schemas.SocioOut:
    total = db.scalar(select(func.coalesce(func.sum(models.Aporte.monto), 0))
                      .where(models.Aporte.socio_id == s.id)) or 0
    saldo = 0.0
    for cr in s.creditos:
        if cr.estado == "activo":
            saldo += _saldo_capital(cr)
    out = schemas.SocioOut.model_validate(s)
    out.total_aportes = round(total, 2)
    out.saldo_credito = round(saldo, 2)
    return out


# ---------------------------------------------------------------- auth
auth_router = APIRouter(prefix="/auth", tags=["auth"])


@auth_router.post("/login", response_model=schemas.TokenOut)
def login(data: schemas.LoginIn, db: Session = Depends(get_db)):
    user = db.scalar(select(models.Usuario).where(models.Usuario.cedula == data.cedula))
    if not user or not user.activo or not verify_password(data.password, user.password_hash):
        raise HTTPException(401, "Cédula o contraseña incorrecta")
    caja_nombre = None
    if user.caja_id:
        caja = db.get(models.Caja, user.caja_id)
        caja_nombre = caja.nombre if caja else None
    return schemas.TokenOut(
        access_token=create_token(user), rol=user.rol, nombre=user.nombre,
        caja_id=user.caja_id, socio_id=user.socio_id, caja_nombre=caja_nombre,
    )


@auth_router.post("/cambiar-password")
def cambiar_password(data: schemas.CambioPassword, db: Session = Depends(get_db),
                     user: models.Usuario = Depends(get_current_user)):
    if not verify_password(data.actual, user.password_hash):
        raise HTTPException(400, "La contraseña actual no coincide")
    user.password_hash = hash_password(data.nueva)
    log_audit(db, user, "editar", "usuario", user.id, "Cambio de contraseña")
    db.commit()
    return {"ok": True}


# ---------------------------------------------------------------- cajas
cajas_router = APIRouter(prefix="/cajas", tags=["cajas"])


@cajas_router.get("", response_model=list[schemas.CajaOut])
def listar_cajas(db: Session = Depends(get_db),
                 user: models.Usuario = Depends(require_roles("superadmin"))):
    return db.scalars(select(models.Caja).order_by(models.Caja.nombre)).all()


@cajas_router.post("", response_model=schemas.CajaOut)
def crear_caja(data: schemas.CajaIn, db: Session = Depends(get_db),
               user: models.Usuario = Depends(require_roles("superadmin"))):
    if db.scalar(select(models.Caja).where(models.Caja.slug == data.slug)):
        raise HTTPException(400, "Ya existe una caja con ese identificador (slug)")
    if db.scalar(select(models.Usuario).where(models.Usuario.cedula == data.tesorero_cedula)):
        raise HTTPException(400, "Ya existe un usuario con la cédula del tesorero")
    caja = models.Caja(nombre=data.nombre, slug=data.slug, comunidad=data.comunidad,
                       tasa_interes_mensual=data.tasa_interes_mensual,
                       aporte_ordinario=data.aporte_ordinario)
    db.add(caja)
    db.flush()
    tesorero = models.Usuario(caja_id=caja.id, nombre=data.tesorero_nombre,
                              cedula=data.tesorero_cedula,
                              password_hash=hash_password(data.tesorero_password),
                              rol="tesorero")
    db.add(tesorero)
    db.flush()
    log_audit(db, user, "crear", "caja", caja.id,
              f"Caja '{caja.nombre}' creada con tesorero {tesorero.nombre}", caja_id=caja.id)
    db.commit()
    db.refresh(caja)
    return caja


# ---------------------------------------------------------------- socios
socios_router = APIRouter(prefix="/socios", tags=["socios"])


@socios_router.get("", response_model=list[schemas.SocioOut])
def listar_socios(caja_id: int | None = None, db: Session = Depends(get_db),
                  user: models.Usuario = Depends(require_roles("tesorero", "superadmin"))):
    cid = caja_scope(user, caja_id)
    socios = db.scalars(select(models.Socio).where(models.Socio.caja_id == cid)
                        .order_by(models.Socio.nombres)).all()
    return [_socio_out(db, s) for s in socios]


@socios_router.post("", response_model=schemas.SocioOut)
def crear_socio(data: schemas.SocioIn, db: Session = Depends(get_db),
                user: models.Usuario = Depends(require_roles("tesorero", "superadmin"))):
    cid = caja_scope(user, data.caja_id)
    if db.scalar(select(models.Socio).where(models.Socio.caja_id == cid,
                                            models.Socio.cedula == data.cedula)):
        raise HTTPException(400, "Ya existe un socio con esa cédula en esta caja")
    socio = models.Socio(caja_id=cid, nombres=data.nombres, cedula=data.cedula,
                         telefono=data.telefono,
                         fecha_ingreso=data.fecha_ingreso or date.today())
    db.add(socio)
    db.flush()
    # cuenta de acceso del socio: usuario = cédula, contraseña inicial = cédula
    if not db.scalar(select(models.Usuario).where(models.Usuario.cedula == data.cedula)):
        db.add(models.Usuario(caja_id=cid, socio_id=socio.id, nombre=data.nombres,
                              cedula=data.cedula, password_hash=hash_password(data.cedula),
                              rol="socio"))
    log_audit(db, user, "crear", "socio", socio.id,
              f"Socio {socio.nombres} ({socio.cedula}) registrado", caja_id=cid)
    db.commit()
    return _socio_out(db, socio)


@socios_router.patch("/{socio_id}/estado", response_model=schemas.SocioOut)
def cambiar_estado_socio(socio_id: int, activo: bool, db: Session = Depends(get_db),
                         user: models.Usuario = Depends(require_roles("tesorero", "superadmin"))):
    socio = db.get(models.Socio, socio_id)
    if not socio or (user.rol != "superadmin" and socio.caja_id != user.caja_id):
        raise HTTPException(404, "Socio no encontrado")
    socio.activo = activo
    log_audit(db, user, "editar", "socio", socio.id,
              f"Socio {socio.nombres} {'activado' if activo else 'desactivado'}",
              caja_id=socio.caja_id)
    db.commit()
    return _socio_out(db, socio)


# ---------------------------------------------------------------- aportes
aportes_router = APIRouter(prefix="/aportes", tags=["aportes"])


@aportes_router.get("", response_model=list[schemas.AporteOut])
def listar_aportes(caja_id: int | None = None, socio_id: int | None = None,
                   limit: int = 200, db: Session = Depends(get_db),
                   user: models.Usuario = Depends(require_roles("tesorero", "superadmin"))):
    cid = caja_scope(user, caja_id)
    q = select(models.Aporte).where(models.Aporte.caja_id == cid)
    if socio_id:
        q = q.where(models.Aporte.socio_id == socio_id)
    aportes = db.scalars(q.order_by(models.Aporte.fecha.desc(),
                                    models.Aporte.id.desc()).limit(limit)).all()
    out = []
    for a in aportes:
        item = schemas.AporteOut.model_validate(a)
        item.socio_nombres = a.socio.nombres
        out.append(item)
    return out


@aportes_router.post("", response_model=schemas.AporteOut)
def registrar_aporte(data: schemas.AporteIn, db: Session = Depends(get_db),
                     user: models.Usuario = Depends(require_roles("tesorero", "superadmin"))):
    socio = db.get(models.Socio, data.socio_id)
    if not socio or (user.rol != "superadmin" and socio.caja_id != user.caja_id):
        raise HTTPException(404, "Socio no encontrado")
    if not socio.activo:
        raise HTTPException(400, "El socio está inactivo")
    aporte = models.Aporte(caja_id=socio.caja_id, socio_id=socio.id, monto=data.monto,
                           fecha=data.fecha or date.today(), tipo=data.tipo,
                           nota=data.nota, registrado_por=user.id)
    db.add(aporte)
    db.flush()
    log_audit(db, user, "crear", "aporte", aporte.id,
              f"Aporte {data.tipo} de ${data.monto:.2f} de {socio.nombres}",
              caja_id=socio.caja_id)
    db.commit()
    item = schemas.AporteOut.model_validate(aporte)
    item.socio_nombres = socio.nombres
    return item


# ---------------------------------------------------------------- créditos
creditos_router = APIRouter(prefix="/creditos", tags=["creditos"])


def _credito_out(c: models.Credito, detalle: bool = False):
    cls = schemas.CreditoDetalle if detalle else schemas.CreditoOut
    out = cls.model_validate(c)
    out.socio_nombres = c.socio.nombres
    out.saldo_capital = _saldo_capital(c)
    out.cuotas_pagadas = sum(1 for q in c.cuotas if q.pagada)
    out.en_mora = _en_mora(c)
    if detalle:
        out.cuotas = [schemas.CuotaOut.model_validate(q) for q in c.cuotas]
    return out


@creditos_router.get("", response_model=list[schemas.CreditoOut])
def listar_creditos(caja_id: int | None = None, estado: str | None = None,
                    db: Session = Depends(get_db),
                    user: models.Usuario = Depends(require_roles("tesorero", "superadmin"))):
    cid = caja_scope(user, caja_id)
    q = select(models.Credito).where(models.Credito.caja_id == cid)
    if estado:
        q = q.where(models.Credito.estado == estado)
    creditos = db.scalars(q.order_by(models.Credito.creado_en.desc())).all()
    return [_credito_out(c) for c in creditos]


@creditos_router.get("/{credito_id}", response_model=schemas.CreditoDetalle)
def detalle_credito(credito_id: int, db: Session = Depends(get_db),
                    user: models.Usuario = Depends(get_current_user)):
    c = db.get(models.Credito, credito_id)
    if not c:
        raise HTTPException(404, "Crédito no encontrado")
    if user.rol == "socio" and c.socio_id != user.socio_id:
        raise HTTPException(403, "No puedes ver créditos de otros socios")
    if user.rol == "tesorero" and c.caja_id != user.caja_id:
        raise HTTPException(404, "Crédito no encontrado")
    return _credito_out(c, detalle=True)


@creditos_router.post("", response_model=schemas.CreditoDetalle)
def crear_credito(data: schemas.CreditoIn, db: Session = Depends(get_db),
                  user: models.Usuario = Depends(require_roles("tesorero", "superadmin"))):
    socio = db.get(models.Socio, data.socio_id)
    if not socio or (user.rol != "superadmin" and socio.caja_id != user.caja_id):
        raise HTTPException(404, "Socio no encontrado")
    if not socio.activo:
        raise HTTPException(400, "El socio está inactivo")
    caja = db.get(models.Caja, socio.caja_id)
    tasa = data.tasa_mensual if data.tasa_mensual is not None else caja.tasa_interes_mensual
    inicio = data.fecha_desembolso or date.today()

    credito = models.Credito(caja_id=socio.caja_id, socio_id=socio.id, monto=data.monto,
                             tasa_mensual=tasa, plazo_meses=data.plazo_meses,
                             fecha_desembolso=inicio, destino=data.destino,
                             registrado_por=user.id)
    db.add(credito)
    db.flush()

    # Amortización francesa (cuota fija). Si tasa = 0, capital fijo.
    i = tasa / 100.0
    n = data.plazo_meses
    saldo = data.monto
    if i > 0:
        cuota_fija = data.monto * (i * (1 + i) ** n) / ((1 + i) ** n - 1)
    else:
        cuota_fija = data.monto / n
    for k in range(1, n + 1):
        interes = round(saldo * i, 2)
        capital = round(cuota_fija - interes, 2)
        if k == n:  # ajuste final por redondeo
            capital = round(saldo, 2)
        total = round(capital + interes, 2)
        saldo = round(saldo - capital, 2)
        db.add(models.Cuota(credito_id=credito.id, numero=k,
                            fecha_vencimiento=_add_months(inicio, k),
                            capital=capital, interes=interes, total=total))
    log_audit(db, user, "crear", "credito", credito.id,
              f"Crédito de ${data.monto:.2f} a {socio.nombres}, {n} meses al {tasa}% mensual",
              caja_id=socio.caja_id)
    db.commit()
    db.refresh(credito)
    return _credito_out(credito, detalle=True)


@creditos_router.post("/cuotas/{cuota_id}/pagar", response_model=schemas.CreditoDetalle)
def pagar_cuota(cuota_id: int, data: schemas.PagoCuotaIn, db: Session = Depends(get_db),
                user: models.Usuario = Depends(require_roles("tesorero", "superadmin"))):
    cuota = db.get(models.Cuota, cuota_id)
    if not cuota:
        raise HTTPException(404, "Cuota no encontrada")
    credito = cuota.credito
    if user.rol != "superadmin" and credito.caja_id != user.caja_id:
        raise HTTPException(404, "Cuota no encontrada")
    if cuota.pagada:
        raise HTTPException(400, "Esta cuota ya está pagada")
    pendientes_previas = [q for q in credito.cuotas if not q.pagada and q.numero < cuota.numero]
    if pendientes_previas:
        raise HTTPException(400, "Hay cuotas anteriores pendientes; págalas primero")
    cuota.pagada = True
    cuota.fecha_pago = data.fecha_pago or date.today()
    cuota.registrado_por = user.id
    if all(q.pagada for q in credito.cuotas):
        credito.estado = "pagado"
    log_audit(db, user, "pagar", "cuota", cuota.id,
              f"Pago cuota {cuota.numero}/{credito.plazo_meses} de ${cuota.total:.2f} "
              f"— crédito #{credito.id} de {credito.socio.nombres}",
              caja_id=credito.caja_id)
    db.commit()
    db.refresh(credito)
    return _credito_out(credito, detalle=True)


# ---------------------------------------------------------------- reportes
reportes_router = APIRouter(tags=["reportes"])


@reportes_router.get("/dashboard", response_model=schemas.DashboardOut)
def dashboard(caja_id: int | None = None, db: Session = Depends(get_db),
              user: models.Usuario = Depends(require_roles("tesorero", "superadmin"))):
    cid = caja_scope(user, caja_id)
    caja = db.get(models.Caja, cid)
    if not caja:
        raise HTTPException(404, "Caja no encontrada")
    total_aportes = db.scalar(select(func.coalesce(func.sum(models.Aporte.monto), 0))
                              .where(models.Aporte.caja_id == cid)) or 0
    desembolsado = db.scalar(select(func.coalesce(func.sum(models.Credito.monto), 0))
                             .where(models.Credito.caja_id == cid)) or 0
    pagado = db.execute(
        select(func.coalesce(func.sum(models.Cuota.capital), 0),
               func.coalesce(func.sum(models.Cuota.interes), 0))
        .join(models.Credito).where(models.Credito.caja_id == cid, models.Cuota.pagada)
    ).one()
    cap_recuperado, intereses = float(pagado[0]), float(pagado[1])
    hoy = date.today()
    mora = db.execute(
        select(func.count(models.Cuota.id), func.coalesce(func.sum(models.Cuota.total), 0))
        .join(models.Credito)
        .where(models.Credito.caja_id == cid, models.Cuota.pagada.is_(False),
               models.Cuota.fecha_vencimiento < hoy)
    ).one()
    socios_activos = db.scalar(select(func.count(models.Socio.id))
                               .where(models.Socio.caja_id == cid, models.Socio.activo)) or 0
    creditos_activos = db.scalar(select(func.count(models.Credito.id))
                                 .where(models.Credito.caja_id == cid,
                                        models.Credito.estado == "activo")) or 0
    return schemas.DashboardOut(
        caja=schemas.CajaOut.model_validate(caja),
        socios_activos=socios_activos,
        fondo_disponible=round(total_aportes + cap_recuperado + intereses - desembolsado, 2),
        total_aportes=round(total_aportes, 2),
        capital_prestado=round(desembolsado - cap_recuperado, 2),
        capital_recuperado=round(cap_recuperado, 2),
        intereses_cobrados=round(intereses, 2),
        creditos_activos=creditos_activos,
        cuotas_en_mora=int(mora[0]),
        monto_en_mora=round(float(mora[1]), 2),
    )


@reportes_router.get("/mi-libreta", response_model=schemas.LibretaOut)
def mi_libreta(socio_id: int | None = None, db: Session = Depends(get_db),
               user: models.Usuario = Depends(get_current_user)):
    """Estado de cuenta. Un socio ve el suyo; tesorero/superadmin pueden indicar socio_id."""
    if user.rol == "socio":
        sid = user.socio_id
    else:
        if not socio_id:
            raise HTTPException(400, "Indica socio_id")
        sid = socio_id
    socio = db.get(models.Socio, sid)
    if not socio:
        raise HTTPException(404, "Socio no encontrado")
    if user.rol == "tesorero" and socio.caja_id != user.caja_id:
        raise HTTPException(404, "Socio no encontrado")
    caja = db.get(models.Caja, socio.caja_id)
    aportes = sorted(socio.aportes, key=lambda a: (a.fecha, a.id), reverse=True)
    return schemas.LibretaOut(
        socio=_socio_out(db, socio),
        caja_nombre=caja.nombre,
        aportes=[schemas.AporteOut.model_validate(a) for a in aportes],
        creditos=[_credito_out(c, detalle=True) for c in
                  sorted(socio.creditos, key=lambda c: c.creado_en, reverse=True)],
    )


@reportes_router.get("/auditoria", response_model=list[schemas.AuditoriaOut])
def auditoria(caja_id: int | None = None, limit: int = 200, db: Session = Depends(get_db),
              user: models.Usuario = Depends(get_current_user)):
    """Bitácora visible para todos los roles de la caja: transparencia total."""
    cid = caja_scope(user, caja_id)
    return db.scalars(select(models.Auditoria).where(models.Auditoria.caja_id == cid)
                      .order_by(models.Auditoria.fecha.desc()).limit(limit)).all()
