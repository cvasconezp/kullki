from datetime import date
from collections import defaultdict
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .database import get_db
from . import models, schemas
from .auth import (
    get_identidad,
    Actor, create_token, verify_password, hash_password, membresias_activas,
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
    """Capital pendiente; los abonos parciales se imputan primero al interés de la cuota."""
    saldo = 0.0
    for c in credito.cuotas:
        if c.pagada:
            continue
        abono_a_capital = max(0.0, (c.abonado or 0) - c.interes)
        saldo += max(0.0, c.capital - abono_a_capital)
    return round(saldo, 2)


def _en_mora(credito: models.Credito) -> bool:
    hoy = date.today()
    return any((not c.pagada) and c.fecha_vencimiento < hoy for c in credito.cuotas)


def _socio_out(db: Session, s: models.Socio) -> schemas.SocioOut:
    """Ahorro neto del socio = aportes (sin multas) - retiros. Las multas van al fondo."""
    ahorros = db.scalar(select(func.coalesce(func.sum(models.Aporte.monto), 0))
                        .where(models.Aporte.socio_id == s.id,
                               models.Aporte.tipo != "multa")) or 0
    multas = db.scalar(select(func.coalesce(func.sum(models.Aporte.monto), 0))
                       .where(models.Aporte.socio_id == s.id,
                              models.Aporte.tipo == "multa")) or 0
    retiros = db.scalar(select(func.coalesce(func.sum(models.Retiro.monto), 0))
                        .where(models.Retiro.socio_id == s.id)) or 0
    saldo = 0.0
    for cr in s.creditos:
        if cr.estado == "activo":
            saldo += _saldo_capital(cr)
    out = schemas.SocioOut.model_validate(s)
    out.total_aportes = round(ahorros - retiros, 2)
    out.total_multas = round(multas, 2)
    out.saldo_credito = round(saldo, 2)
    return out


# ---------------------------------------------------------------- auth
auth_router = APIRouter(prefix="/auth", tags=["auth"])


@auth_router.post("/login", response_model=schemas.LoginOut)
def login(data: schemas.LoginIn, db: Session = Depends(get_db)):
    user = db.scalar(select(models.Usuario).where(models.Usuario.cedula == data.cedula))
    if not user or not user.activo or not verify_password(data.password, user.password_hash):
        raise HTTPException(401, "Cédula o contraseña incorrecta")

    # Superadmin: token directo, sin caja
    if user.es_superadmin:
        return schemas.LoginOut(
            access_token=create_token(user), rol="superadmin", nombre=user.nombre,
            requiere_seleccion=False, cajas=[])

    mems = membresias_activas(db, user)
    if not mems:
        raise HTTPException(403, "Tu cuenta no está vinculada a ninguna caja activa")

    cajas = []
    for m in mems:
        caja = db.get(models.Caja, m.caja_id)
        if caja and caja.activa:
            cajas.append(schemas.CajaMembresia(
                caja_id=caja.id, caja_nombre=caja.nombre, caja_slug=caja.slug,
                comunidad=caja.comunidad, rol=m.rol, socio_id=m.socio_id,
                color_primario=caja.color_primario, color_acento=caja.color_acento,
                logo=caja.logo))

    if not cajas:
        raise HTTPException(403, "Tu cuenta no está vinculada a ninguna caja activa")

    # Una sola caja: token ya anclado, entra directo
    if len(cajas) == 1:
        c = cajas[0]
        return schemas.LoginOut(
            access_token=create_token(user, caja_id=c.caja_id, rol=c.rol, socio_id=c.socio_id),
            rol=c.rol, nombre=user.nombre, caja_id=c.caja_id, caja_nombre=c.caja_nombre,
            caja_slug=c.caja_slug, socio_id=c.socio_id,
            color_primario=c.color_primario, color_acento=c.color_acento, logo=c.logo,
            requiere_seleccion=False, cajas=cajas)

    # Varias cajas: token "sin anclar"; el front muestra el selector
    return schemas.LoginOut(
        access_token=create_token(user), rol=None, nombre=user.nombre,
        requiere_seleccion=True, cajas=cajas)


@auth_router.post("/seleccionar-caja", response_model=schemas.LoginOut)
def seleccionar_caja(data: schemas.SeleccionCaja, db: Session = Depends(get_db),
                     actor: Actor = Depends(get_identidad)):
    """Cambia/elige la caja activa. Emite un token nuevo anclado a esa caja."""
    user = actor.usuario
    if user.es_superadmin:
        raise HTTPException(400, "El superadmin no opera dentro de una caja")
    m = db.scalar(select(models.Membresia).where(
        models.Membresia.usuario_id == user.id,
        models.Membresia.caja_id == data.caja_id,
        models.Membresia.activo))
    if not m:
        raise HTTPException(403, "No perteneces a esa caja")
    caja = db.get(models.Caja, m.caja_id)
    return schemas.LoginOut(
        access_token=create_token(user, caja_id=m.caja_id, rol=m.rol, socio_id=m.socio_id),
        rol=m.rol, nombre=user.nombre, caja_id=m.caja_id,
        caja_nombre=caja.nombre if caja else None, caja_slug=caja.slug if caja else None,
        socio_id=m.socio_id,
        color_primario=caja.color_primario if caja else None,
        color_acento=caja.color_acento if caja else None,
        logo=caja.logo if caja else None,
        requiere_seleccion=False, cajas=[])


@auth_router.post("/asumir-caja", response_model=schemas.LoginOut)
def asumir_caja(data: schemas.AsumirCaja, db: Session = Depends(get_db),
                actor: Actor = Depends(get_identidad)):
    """Solo superadmin: entra a una caja como tesorero o socio SIN cerrar sesión.
    Toda acción posterior queda en la bitácora con el nombre del administrador."""
    user = actor.usuario
    if not user.es_superadmin:
        raise HTTPException(403, "Solo el administrador puede asumir un rol en una caja")
    caja = db.get(models.Caja, data.caja_id)
    if not caja:
        raise HTTPException(404, "Caja no encontrada")
    if data.rol not in ("tesorero", "socio"):
        raise HTTPException(400, "Rol inválido (tesorero | socio)")
    socio_id = None
    if data.rol == "socio":
        if not data.socio_id:
            raise HTTPException(400, "Indica el socio que quieres ver")
        socio = db.get(models.Socio, data.socio_id)
        if not socio or socio.caja_id != caja.id:
            raise HTTPException(404, "Socio no encontrado en esta caja")
        socio_id = socio.id
    token = create_token(user, caja_id=caja.id, rol=data.rol,
                         socio_id=socio_id, impersonando=True)
    log_audit(db, actor, "editar", "caja", caja.id,
              f"Administrador {user.nombre} entró como {data.rol} a '{caja.nombre}'",
              caja_id=caja.id)
    db.commit()
    return schemas.LoginOut(
        access_token=token, rol=data.rol, nombre=user.nombre, caja_id=caja.id,
        caja_nombre=caja.nombre, caja_slug=caja.slug, socio_id=socio_id,
        color_primario=caja.color_primario, color_acento=caja.color_acento,
        logo=caja.logo, es_impersonacion=True, requiere_seleccion=False, cajas=[])


@auth_router.get("/mis-cajas", response_model=list[schemas.CajaMembresia])
def mis_cajas(db: Session = Depends(get_db), actor: Actor = Depends(get_identidad)):
    """Lista las cajas a las que la persona pertenece (para el selector)."""
    if actor.usuario.es_superadmin:
        return []
    out = []
    for m in membresias_activas(db, actor.usuario):
        caja = db.get(models.Caja, m.caja_id)
        if caja and caja.activa:
            out.append(schemas.CajaMembresia(
                caja_id=caja.id, caja_nombre=caja.nombre, caja_slug=caja.slug,
                comunidad=caja.comunidad, rol=m.rol, socio_id=m.socio_id,
                color_primario=caja.color_primario, color_acento=caja.color_acento,
                logo=caja.logo))
    return out


@auth_router.post("/cambiar-password")
def cambiar_password(data: schemas.CambioPassword, db: Session = Depends(get_db),
                     actor: Actor = Depends(get_identidad)):
    user = actor.usuario
    if not verify_password(data.actual, user.password_hash):
        raise HTTPException(400, "La contraseña actual no coincide")
    user.password_hash = hash_password(data.nueva)
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
               actor: Actor = Depends(require_roles("superadmin"))):
    if db.scalar(select(models.Caja).where(models.Caja.slug == data.slug)):
        raise HTTPException(400, "Ya existe una caja con ese identificador (slug)")
    caja = models.Caja(nombre=data.nombre, slug=data.slug, comunidad=data.comunidad,
                       tasa_interes_mensual=data.tasa_interes_mensual,
                       aporte_ordinario=data.aporte_ordinario,
                       multa_mora=data.multa_mora,
                       color_primario=data.color_primario or "#1B3A6B",
                       color_acento=data.color_acento or "#E8A838",
                       logo=data.logo or "")
    db.add(caja)
    db.flush()

    # Cuenta del tesorero: reutiliza si la cédula ya existe (persona en varias cajas)
    tesorero = db.scalar(select(models.Usuario)
                         .where(models.Usuario.cedula == data.tesorero_cedula))
    if not tesorero:
        tesorero = models.Usuario(nombre=data.tesorero_nombre, cedula=data.tesorero_cedula,
                                  password_hash=hash_password(data.tesorero_password))
        db.add(tesorero)
        db.flush()
    elif tesorero.es_superadmin:
        raise HTTPException(400, "Esa cédula pertenece al administrador del sistema")
    db.add(models.Membresia(usuario_id=tesorero.id, caja_id=caja.id, rol="tesorero"))
    db.flush()
    log_audit(db, actor, "crear", "caja", caja.id,
              f"Caja '{caja.nombre}' creada con tesorero {tesorero.nombre}", caja_id=caja.id)
    db.commit()
    db.refresh(caja)
    return caja


@cajas_router.patch("/{caja_id}", response_model=schemas.CajaOut)
def editar_caja(caja_id: int, data: schemas.CajaUpdate, db: Session = Depends(get_db),
                actor: Actor = Depends(require_roles("superadmin"))):
    caja = db.get(models.Caja, caja_id)
    if not caja:
        raise HTTPException(404, "Caja no encontrada")
    cambios = data.model_dump(exclude_unset=True)
    for k, v in cambios.items():
        setattr(caja, k, v)
    log_audit(db, actor, "editar", "caja", caja.id,
              f"Caja '{caja.nombre}' editada: {', '.join(cambios) or 'sin cambios'}",
              caja_id=caja.id)
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
                actor: Actor = Depends(require_roles("tesorero", "superadmin"))):
    cid = caja_scope(actor, data.caja_id)
    if db.scalar(select(models.Socio).where(models.Socio.caja_id == cid,
                                            models.Socio.cedula == data.cedula)):
        raise HTTPException(400, "Ya existe un socio con esa cédula en esta caja")
    socio = models.Socio(caja_id=cid, nombres=data.nombres, cedula=data.cedula,
                         telefono=data.telefono,
                         fecha_ingreso=data.fecha_ingreso or date.today())
    db.add(socio)
    db.flush()

    # Cuenta de acceso: una sola por persona (cédula). Si ya existe (porque es
    # socia/tesorera de otra caja), la REUTILIZAMOS y solo añadimos la membresía.
    usuario = db.scalar(select(models.Usuario).where(models.Usuario.cedula == data.cedula))
    if not usuario:
        usuario = models.Usuario(nombre=data.nombres, cedula=data.cedula,
                                 password_hash=hash_password(data.cedula))
        db.add(usuario)
        db.flush()
    if not usuario.es_superadmin:
        db.add(models.Membresia(usuario_id=usuario.id, caja_id=cid,
                                socio_id=socio.id, rol="socio"))
    log_audit(db, actor, "crear", "socio", socio.id,
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


def _aplicar_abono(db, user, cuota: models.Cuota, monto: float, fecha) -> models.Credito:
    credito = cuota.credito
    if cuota.pagada:
        raise HTTPException(400, "Esta cuota ya está pagada")
    if any(not q.pagada and q.numero < cuota.numero for q in credito.cuotas):
        raise HTTPException(400, "Hay cuotas anteriores pendientes; abónalas primero")
    pendiente = round(cuota.total - (cuota.abonado or 0), 2)
    if monto > pendiente + 0.005:
        raise HTTPException(400, f"El abono excede lo pendiente de la cuota (${pendiente:.2f})")
    fecha = fecha or date.today()

    # Multa de mora automática: una sola vez, en el primer abono tras el vencimiento
    caja = db.get(models.Caja, credito.caja_id)
    if (caja.multa_mora > 0 and fecha > cuota.fecha_vencimiento
            and (cuota.abonado or 0) == 0):
        db.add(models.Aporte(caja_id=credito.caja_id, socio_id=credito.socio_id,
                             monto=caja.multa_mora, fecha=fecha, tipo="multa",
                             nota=f"Mora cuota {cuota.numero} crédito #{credito.id}",
                             registrado_por=user.id))
        log_audit(db, user, "crear", "aporte", 0,
                  f"Multa por mora de ${caja.multa_mora:.2f} a {credito.socio.nombres} "
                  f"(cuota {cuota.numero} vencida)", caja_id=credito.caja_id)

    cuota.abonado = round((cuota.abonado or 0) + monto, 2)
    if cuota.abonado >= cuota.total - 0.005:
        cuota.abonado = cuota.total
        cuota.pagada = True
        cuota.fecha_pago = fecha
        cuota.registrado_por = user.id
        detalle = (f"Pago cuota {cuota.numero}/{credito.plazo_meses} de ${cuota.total:.2f} "
                   f"— crédito #{credito.id} de {credito.socio.nombres}")
    else:
        detalle = (f"Abono parcial de ${monto:.2f} a cuota {cuota.numero} "
                   f"(pendiente ${cuota.total - cuota.abonado:.2f}) "
                   f"— crédito #{credito.id} de {credito.socio.nombres}")
    if all(q.pagada for q in credito.cuotas):
        credito.estado = "pagado"
    log_audit(db, user, "pagar", "cuota", cuota.id, detalle, caja_id=credito.caja_id)
    db.commit()
    db.refresh(credito)
    return credito


@creditos_router.post("/cuotas/{cuota_id}/pagar", response_model=schemas.CreditoDetalle)
def pagar_cuota(cuota_id: int, data: schemas.PagoCuotaIn, db: Session = Depends(get_db),
                user: models.Usuario = Depends(require_roles("tesorero", "superadmin"))):
    """Cobra el total pendiente de la cuota."""
    cuota = db.get(models.Cuota, cuota_id)
    if not cuota:
        raise HTTPException(404, "Cuota no encontrada")
    if user.rol != "superadmin" and cuota.credito.caja_id != user.caja_id:
        raise HTTPException(404, "Cuota no encontrada")
    pendiente = round(cuota.total - (cuota.abonado or 0), 2)
    credito = _aplicar_abono(db, user, cuota, pendiente, data.fecha_pago)
    return _credito_out(credito, detalle=True)


@creditos_router.post("/cuotas/{cuota_id}/abonar", response_model=schemas.CreditoDetalle)
def abonar_cuota(cuota_id: int, data: schemas.AbonoIn, db: Session = Depends(get_db),
                 user: models.Usuario = Depends(require_roles("tesorero", "superadmin"))):
    """Abono parcial a la cuota en curso."""
    cuota = db.get(models.Cuota, cuota_id)
    if not cuota:
        raise HTTPException(404, "Cuota no encontrada")
    if user.rol != "superadmin" and cuota.credito.caja_id != user.caja_id:
        raise HTTPException(404, "Cuota no encontrada")
    credito = _aplicar_abono(db, user, cuota, data.monto, data.fecha_pago)
    return _credito_out(credito, detalle=True)


# ---------------------------------------------------------------- retiros
retiros_router = APIRouter(prefix="/retiros", tags=["retiros"])


@retiros_router.get("", response_model=list[schemas.RetiroOut])
def listar_retiros(caja_id: int | None = None, limit: int = 100, db: Session = Depends(get_db),
                   user: models.Usuario = Depends(require_roles("tesorero", "superadmin"))):
    cid = caja_scope(user, caja_id)
    retiros = db.scalars(select(models.Retiro).where(models.Retiro.caja_id == cid)
                         .order_by(models.Retiro.fecha.desc(), models.Retiro.id.desc())
                         .limit(limit)).all()
    out = []
    for r in retiros:
        item = schemas.RetiroOut.model_validate(r)
        item.socio_nombres = r.socio.nombres
        out.append(item)
    return out


@retiros_router.post("", response_model=schemas.RetiroOut)
def registrar_retiro(data: schemas.RetiroIn, db: Session = Depends(get_db),
                     user: models.Usuario = Depends(require_roles("tesorero", "superadmin"))):
    socio = db.get(models.Socio, data.socio_id)
    if not socio or (user.rol != "superadmin" and socio.caja_id != user.caja_id):
        raise HTTPException(404, "Socio no encontrado")
    info = _socio_out(db, socio)
    if data.monto > info.total_aportes + 0.005:
        raise HTTPException(400,
            f"El retiro excede el ahorro disponible del socio (${info.total_aportes:.2f})")
    if info.saldo_credito > 0 and data.monto > info.total_aportes - info.saldo_credito + 0.005:
        raise HTTPException(400,
            "El socio tiene crédito activo: su ahorro respalda la deuda. "
            f"Puede retirar máximo ${max(0, info.total_aportes - info.saldo_credito):.2f}")
    retiro = models.Retiro(caja_id=socio.caja_id, socio_id=socio.id, monto=data.monto,
                           fecha=data.fecha or date.today(), nota=data.nota,
                           registrado_por=user.id)
    db.add(retiro)
    db.flush()
    log_audit(db, user, "crear", "retiro", retiro.id,
              f"Retiro de ${data.monto:.2f} de {socio.nombres}", caja_id=socio.caja_id)
    db.commit()
    item = schemas.RetiroOut.model_validate(retiro)
    item.socio_nombres = socio.nombres
    return item


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
    total_retiros = db.scalar(select(func.coalesce(func.sum(models.Retiro.monto), 0))
                              .where(models.Retiro.caja_id == cid)) or 0
    desembolsado = db.scalar(select(func.coalesce(func.sum(models.Credito.monto), 0))
                             .where(models.Credito.caja_id == cid)) or 0
    pagado = db.execute(
        select(func.coalesce(func.sum(models.Cuota.capital), 0),
               func.coalesce(func.sum(models.Cuota.interes), 0))
        .join(models.Credito).where(models.Credito.caja_id == cid, models.Cuota.pagada)
    ).one()
    cap_recuperado, intereses = float(pagado[0]), float(pagado[1])
    abonos_transito = float(db.scalar(
        select(func.coalesce(func.sum(models.Cuota.abonado), 0))
        .join(models.Credito)
        .where(models.Credito.caja_id == cid, models.Cuota.pagada.is_(False))) or 0)
    hoy = date.today()
    mora = db.execute(
        select(func.count(models.Cuota.id),
               func.coalesce(func.sum(models.Cuota.total - models.Cuota.abonado), 0))
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
        fondo_disponible=round(total_aportes + cap_recuperado + intereses
                               + abonos_transito - desembolsado - total_retiros, 2),
        total_aportes=round(total_aportes, 2),
        capital_prestado=round(desembolsado - cap_recuperado, 2),
        capital_recuperado=round(cap_recuperado, 2),
        intereses_cobrados=round(intereses, 2),
        total_retiros=round(total_retiros, 2),
        abonos_en_transito=round(abonos_transito, 2),
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
    retiros = db.scalars(select(models.Retiro).where(models.Retiro.socio_id == sid)
                         .order_by(models.Retiro.fecha.desc())).all()
    return schemas.LibretaOut(
        socio=_socio_out(db, socio),
        caja_nombre=caja.nombre,
        aportes=[schemas.AporteOut.model_validate(a) for a in aportes],
        retiros=[schemas.RetiroOut.model_validate(x) for x in retiros],
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


@reportes_router.get("/informe-asamblea", response_model=schemas.InformeAsamblea)
def informe_asamblea(caja_id: int | None = None, db: Session = Depends(get_db),
                     user: models.Usuario = Depends(require_roles("tesorero", "superadmin"))):
    """Informe imprimible para la asamblea: estado de la caja y fila por socio."""
    cid = caja_scope(user, caja_id)
    dash = dashboard(caja_id=cid, db=db, user=user)
    socios = db.scalars(select(models.Socio).where(models.Socio.caja_id == cid)
                        .order_by(models.Socio.nombres)).all()
    filas = []
    for s in socios:
        info = _socio_out(db, s)
        en_mora = any(c.estado == "activo" and _en_mora(c) for c in s.creditos)
        filas.append(schemas.FilaInforme(
            socio=s.nombres, cedula=s.cedula, ahorro_neto=info.total_aportes,
            multas=info.total_multas, saldo_credito=info.saldo_credito, en_mora=en_mora))
    log_audit(db, user, "crear", "informe", 0, "Informe de asamblea generado", caja_id=cid)
    db.commit()
    return schemas.InformeAsamblea(caja=dash.caja, fecha=date.today(),
                                   dashboard=dash, filas=filas)


@reportes_router.get("/cierre/simulacion", response_model=schemas.CierreSimulacion)
def cierre_simulacion(caja_id: int | None = None, db: Session = Depends(get_db),
                      user: models.Usuario = Depends(require_roles("tesorero", "superadmin"))):
    """Simula el reparto de intereses cobrados, proporcional al ahorro neto de cada socio."""
    cid = caja_scope(user, caja_id)
    dash = dashboard(caja_id=cid, db=db, user=user)
    socios = db.scalars(select(models.Socio).where(models.Socio.caja_id == cid,
                                                   models.Socio.activo)).all()
    infos = [(s, _socio_out(db, s)) for s in socios]
    total_ahorro = sum(i.total_aportes for _, i in infos)
    filas = []
    for s, i in sorted(infos, key=lambda x: -x[1].total_aportes):
        pct = (i.total_aportes / total_ahorro * 100) if total_ahorro > 0 else 0
        filas.append(schemas.FilaCierre(
            socio=s.nombres, ahorro_neto=i.total_aportes, porcentaje=round(pct, 2),
            utilidad=round(dash.intereses_cobrados * pct / 100, 2)))
    return schemas.CierreSimulacion(intereses_a_repartir=dash.intereses_cobrados,
                                    total_ahorro=round(total_ahorro, 2), filas=filas)


@reportes_router.get("/balances", response_model=schemas.BalancesOut)
def balances(caja_id: int | None = None, db: Session = Depends(get_db),
             user: models.Usuario = Depends(require_roles("tesorero", "superadmin"))):
    """Series mensuales para el dashboard interactivo de balances del tesorero."""
    cid = caja_scope(user, caja_id)
    dash = dashboard(caja_id=cid, db=db, user=user)

    MES = ["ene", "feb", "mar", "abr", "may", "jun",
           "jul", "ago", "sep", "oct", "nov", "dic"]

    def clave(d: date):
        return f"{d.year:04d}-{d.month:02d}", f"{MES[d.month-1]} {d.year % 100:02d}"

    movs: dict[str, dict] = defaultdict(lambda: dict(
        periodo="", etiqueta="", aportes=0.0, retiros=0.0,
        desembolsos=0.0, recuperado=0.0, intereses=0.0))

    def slot(d: date):
        k, lbl = clave(d)
        m = movs[k]; m["periodo"], m["etiqueta"] = k, lbl
        return m

    for a in db.scalars(select(models.Aporte).where(models.Aporte.caja_id == cid)):
        slot(a.fecha)["aportes"] += a.monto
    for r in db.scalars(select(models.Retiro).where(models.Retiro.caja_id == cid)):
        slot(r.fecha)["retiros"] += r.monto
    for c in db.scalars(select(models.Credito).where(models.Credito.caja_id == cid)):
        slot(c.fecha_desembolso)["desembolsos"] += c.monto
    cuotas = db.scalars(select(models.Cuota).join(models.Credito)
                        .where(models.Credito.caja_id == cid,
                               models.Cuota.pagada, models.Cuota.fecha_pago.isnot(None)))
    for q in cuotas:
        m = slot(q.fecha_pago)
        m["recuperado"] += q.capital + q.interes
        m["intereses"] += q.interes

    serie, acum = [], 0.0
    for k in sorted(movs):
        m = movs[k]
        # flujo neto del fondo en el mes
        acum += m["aportes"] - m["retiros"] - m["desembolsos"] + m["recuperado"]
        serie.append(schemas.PuntoSerie(
            periodo=m["periodo"], etiqueta=m["etiqueta"],
            aportes=round(m["aportes"], 2), retiros=round(m["retiros"], 2),
            desembolsos=round(m["desembolsos"], 2), recuperado=round(m["recuperado"], 2),
            intereses=round(m["intereses"], 2), fondo_acumulado=round(acum, 2)))

    composicion = {
        "ahorros_disponibles": round(max(0.0, dash.total_aportes - dash.total_retiros
                                         - dash.capital_prestado), 2),
        "capital_en_calle": round(dash.capital_prestado, 2),
        "intereses": round(dash.intereses_cobrados, 2),
    }

    socios = db.scalars(select(models.Socio).where(models.Socio.caja_id == cid,
                                                   models.Socio.activo)).all()
    tops = sorted((( _socio_out(db, s).total_aportes, s.nombres) for s in socios),
                  reverse=True)[:6]
    top_socios = [schemas.TopSocio(socio=n, ahorro_neto=round(v, 2)) for v, n in tops if v > 0]

    return schemas.BalancesOut(dashboard=dash, serie=serie,
                               composicion_fondo=composicion, top_socios=top_socios)
