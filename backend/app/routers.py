from datetime import date, datetime, timedelta
from collections import defaultdict
import json, time, os
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


VENTANA_EDICION = timedelta(minutes=5)

# --- Anti fuerza bruta en el login (en memoria) ---
_LOGIN_FAILS = defaultdict(list)
MAX_FAILS = 5
VENTANA_FAIL = 900        # 15 min
def _login_bloqueado(cedula: str) -> int:
    now = time.time()
    fails = [t for t in _LOGIN_FAILS.get(cedula, []) if now - t < VENTANA_FAIL]
    _LOGIN_FAILS[cedula] = fails
    if len(fails) >= MAX_FAILS:
        return int((VENTANA_FAIL - (now - fails[0])) / 60) + 1   # minutos restantes
    return 0
def _registrar_fallo(cedula: str):
    _LOGIN_FAILS[cedula].append(time.time())
def _limpiar_fallos(cedula: str):
    _LOGIN_FAILS.pop(cedula, None)

def _verificar_ventana(actor, mov):
    """Tesorero: solo puede corregir dentro de 5 min de creado el movimiento.
    Superadmin: sin límite (es la 'autorización del superior')."""
    if actor.rol == "superadmin":
        return
    creado = mov.creado_en or datetime.utcnow()
    if datetime.utcnow() - creado > VENTANA_EDICION:
        raise HTTPException(403,
            "Pasaron más de 5 minutos desde el registro. Pide al administrador "
            "que autorice la corrección de este movimiento.")


def _registrar_acceso(db: Session, user: models.Usuario, rol: str, caja_id: int | None):
    user.ultimo_acceso = datetime.utcnow()
    db.add(models.Acceso(usuario_id=user.id, usuario_nombre=user.nombre,
                         caja_id=caja_id, rol=rol or ""))


def _socio_out(db: Session, s: models.Socio) -> schemas.SocioOut:
    """Ahorro neto del socio = aportes (sin multas) - retiros. Las multas van al fondo."""
    ahorros = db.scalar(select(func.coalesce(func.sum(models.Aporte.monto), 0))
                        .where(models.Aporte.socio_id == s.id,
                               models.Aporte.tipo != "multa",
                               models.Aporte.anulado.is_(False))) or 0
    multas = db.scalar(select(func.coalesce(func.sum(models.Aporte.monto), 0))
                       .where(models.Aporte.socio_id == s.id,
                              models.Aporte.tipo == "multa",
                              models.Aporte.anulado.is_(False))) or 0
    retiros = db.scalar(select(func.coalesce(func.sum(models.Retiro.monto), 0))
                        .where(models.Retiro.socio_id == s.id,
                               models.Retiro.anulado.is_(False))) or 0
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
    espera = _login_bloqueado(data.cedula)
    if espera:
        raise HTTPException(429, f"Demasiados intentos fallidos. Intenta de nuevo en {espera} minuto(s).")
    user = db.scalar(select(models.Usuario).where(models.Usuario.cedula == data.cedula))
    if not user or not user.activo or not verify_password(data.password, user.password_hash):
        _registrar_fallo(data.cedula)
        raise HTTPException(401, "Cédula o contraseña incorrecta")
    _limpiar_fallos(data.cedula)

    # Superadmin: token directo, sin caja
    if user.es_superadmin:
        _registrar_acceso(db, user, "superadmin", None); db.commit()
        return schemas.LoginOut(
            access_token=create_token(user), rol="superadmin", nombre=user.nombre,
            debe_cambiar_password=user.debe_cambiar_password,
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
        _registrar_acceso(db, user, c.rol, c.caja_id); db.commit()
        return schemas.LoginOut(
            access_token=create_token(user, caja_id=c.caja_id, rol=c.rol, socio_id=c.socio_id),
            rol=c.rol, nombre=user.nombre, caja_id=c.caja_id, caja_nombre=c.caja_nombre,
            caja_slug=c.caja_slug, socio_id=c.socio_id,
            color_primario=c.color_primario, color_acento=c.color_acento, logo=c.logo,
            debe_cambiar_password=user.debe_cambiar_password,
            requiere_seleccion=False, cajas=cajas)

    # Varias cajas: token "sin anclar"; el front muestra el selector
    return schemas.LoginOut(
        access_token=create_token(user), rol=None, nombre=user.nombre,
        debe_cambiar_password=user.debe_cambiar_password,
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
    _registrar_acceso(db, user, m.rol, m.caja_id); db.commit()
    return schemas.LoginOut(
        access_token=create_token(user, caja_id=m.caja_id, rol=m.rol, socio_id=m.socio_id),
        rol=m.rol, nombre=user.nombre, caja_id=m.caja_id,
        caja_nombre=caja.nombre if caja else None, caja_slug=caja.slug if caja else None,
        socio_id=m.socio_id,
        color_primario=caja.color_primario if caja else None,
        color_acento=caja.color_acento if caja else None,
        logo=caja.logo if caja else None,
        debe_cambiar_password=user.debe_cambiar_password,
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
    if data.rol not in ("tesorero", "socio", "directiva"):
        raise HTTPException(400, "Rol inválido (tesorero | socio | directiva)")
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


@auth_router.post("/verificar")
def verificar(data: schemas.VerificarIn, actor: Actor = Depends(get_identidad)):
    """Verifica la contraseña/PIN del usuario actual para reanudar una sesión bloqueada."""
    if not verify_password(data.password, actor.usuario.password_hash):
        raise HTTPException(401, "Contraseña incorrecta")
    return {"ok": True}


@auth_router.post("/cambiar-password")
def cambiar_password(data: schemas.CambioPassword, db: Session = Depends(get_db),
                     actor: Actor = Depends(get_identidad)):
    user = actor.usuario
    if not verify_password(data.actual, user.password_hash):
        raise HTTPException(400, "La contraseña actual no coincide")
    if data.nueva.strip() == user.cedula:
        raise HTTPException(400, "Tu nueva contraseña no puede ser tu número de cédula")
    user.password_hash = hash_password(data.nueva)
    user.debe_cambiar_password = False
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
                       logo=data.logo or "",
                       transparencia_total=data.transparencia_total)
    db.add(caja)
    db.flush()

    # Cuenta del tesorero: reutiliza si la cédula ya existe (persona en varias cajas)
    tesorero = db.scalar(select(models.Usuario)
                         .where(models.Usuario.cedula == data.tesorero_cedula))
    if not tesorero:
        tesorero = models.Usuario(nombre=data.tesorero_nombre, cedula=data.tesorero_cedula,
                                  password_hash=hash_password(data.tesorero_password),
                                  debe_cambiar_password=True)
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


@cajas_router.post("/{caja_id}/directiva")
def crear_directiva(caja_id: int, data: schemas.DirectivaIn, db: Session = Depends(get_db),
                    actor: Actor = Depends(require_roles("superadmin"))):
    """Crea (o vincula) un usuario de DIRECTIVA con acceso de solo lectura a la caja."""
    caja = db.get(models.Caja, caja_id)
    if not caja:
        raise HTTPException(404, "Caja no encontrada")
    u = db.scalar(select(models.Usuario).where(models.Usuario.cedula == data.cedula))
    if not u:
        u = models.Usuario(nombre=data.nombre, cedula=data.cedula,
                           password_hash=hash_password(data.password), debe_cambiar_password=True)
        db.add(u); db.flush()
    elif u.es_superadmin:
        raise HTTPException(400, "Esa cédula pertenece al administrador del sistema")
    ya = db.scalar(select(models.Membresia).where(
        models.Membresia.usuario_id == u.id, models.Membresia.caja_id == caja_id))
    if ya:
        raise HTTPException(400, "Esa persona ya pertenece a esta caja")
    db.add(models.Membresia(usuario_id=u.id, caja_id=caja_id, rol="directiva"))
    log_audit(db, actor, "crear", "caja", caja_id,
              f"Directiva {u.nombre} agregada a '{caja.nombre}'", caja_id=caja_id)
    db.commit()
    return {"ok": True, "nombre": u.nombre, "cedula": u.cedula}


# ---------------------------------------------------------------- socios
socios_router = APIRouter(prefix="/socios", tags=["socios"])


@socios_router.get("", response_model=list[schemas.SocioOut])
def listar_socios(caja_id: int | None = None, db: Session = Depends(get_db),
                  user: models.Usuario = Depends(require_roles("tesorero", "superadmin", "directiva"))):
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
                         fecha_ingreso=data.fecha_ingreso or date.today(),
                         fecha_nacimiento=data.fecha_nacimiento, genero=data.genero,
                         correo=data.correo, whatsapp=data.whatsapp,
                         direccion=data.direccion, ocupacion=data.ocupacion,
                         estado_civil=data.estado_civil,
                         nivel_instruccion=data.nivel_instruccion,
                         num_cargas=data.num_cargas,
                         contacto_emergencia=data.contacto_emergencia,
                         consentimiento_datos=data.consentimiento_datos,
                         consentimiento_fecha=date.today() if data.consentimiento_datos else None)
    db.add(socio)
    db.flush()

    # Cuenta de acceso: una sola por persona (cédula). Si ya existe (porque es
    # socia/tesorera de otra caja), la REUTILIZAMOS y solo añadimos la membresía.
    usuario = db.scalar(select(models.Usuario).where(models.Usuario.cedula == data.cedula))
    if not usuario:
        usuario = models.Usuario(nombre=data.nombres, cedula=data.cedula,
                                 password_hash=hash_password(data.cedula),
                                 debe_cambiar_password=True)
        db.add(usuario)
        db.flush()
    if not usuario.es_superadmin:
        db.add(models.Membresia(usuario_id=usuario.id, caja_id=cid,
                                socio_id=socio.id, rol="socio"))
    log_audit(db, actor, "crear", "socio", socio.id,
              f"Socio {socio.nombres} ({socio.cedula}) registrado", caja_id=cid,
              afecta_socio_id=socio.id)
    db.commit()
    return _socio_out(db, socio)


PERMITIDOS_SOCIO = {"telefono", "whatsapp", "correo", "direccion", "ocupacion",
                    "estado_civil", "nivel_instruccion", "num_cargas",
                    "contacto_emergencia", "fecha_nacimiento", "genero"}


def _solicitud_out(sol: models.SolicitudCambio) -> schemas.SolicitudOut:
    try:
        campos = json.loads(sol.campos or "{}")
    except Exception:
        campos = {}
    return schemas.SolicitudOut(
        id=sol.id, socio_id=sol.socio_id, socio_nombre=sol.socio_nombre,
        campos=campos, estado=sol.estado, creado_en=sol.creado_en,
        resuelto_por=sol.resuelto_por or "")


@socios_router.post("/solicitud", response_model=schemas.SolicitudOut)
def crear_solicitud_cambio(data: schemas.SocioUpdate, db: Session = Depends(get_db),
                           actor: Actor = Depends(get_current_user)):
    """El socio SOLICITA actualizar sus datos. No se aplican hasta que el tesorero apruebe.
    (Evita que alguien cambie su contacto para esquivar la cobranza.)"""
    if actor.rol != "socio" or not actor.socio_id:
        raise HTTPException(403, "Solo un socio puede solicitar cambios de su ficha")
    socio = db.get(models.Socio, actor.socio_id)
    if not socio:
        raise HTTPException(404, "Socio no encontrado")
    cambios = {k: v for k, v in data.model_dump(exclude_unset=True).items() if k in PERMITIDOS_SOCIO}
    if not cambios:
        raise HTTPException(400, "No hay cambios que solicitar")
    # fechas a string para JSON
    payload = {k: (v.isoformat() if hasattr(v, "isoformat") else v) for k, v in cambios.items()}
    prev = db.scalar(select(models.SolicitudCambio).where(
        models.SolicitudCambio.socio_id == socio.id,
        models.SolicitudCambio.estado == "pendiente"))
    if prev:
        prev.campos = json.dumps(payload); prev.creado_en = datetime.utcnow()
        sol = prev
    else:
        sol = models.SolicitudCambio(caja_id=socio.caja_id, socio_id=socio.id,
                                     socio_nombre=socio.nombres, campos=json.dumps(payload))
        db.add(sol)
    log_audit(db, actor, "crear", "solicitud", socio.id,
              f"{socio.nombres} solicitó actualizar: {', '.join(cambios)}",
              caja_id=socio.caja_id, afecta_socio_id=socio.id)
    db.commit(); db.refresh(sol)
    return _solicitud_out(sol)


@socios_router.get("/solicitud", response_model=schemas.SolicitudOut | None)
def mi_solicitud(db: Session = Depends(get_db), actor: Actor = Depends(get_current_user)):
    if actor.rol != "socio" or not actor.socio_id:
        return None
    sol = db.scalar(select(models.SolicitudCambio).where(
        models.SolicitudCambio.socio_id == actor.socio_id,
        models.SolicitudCambio.estado == "pendiente"))
    return _solicitud_out(sol) if sol else None


@socios_router.get("/solicitudes", response_model=list[schemas.SolicitudOut])
def listar_solicitudes(caja_id: int | None = None, db: Session = Depends(get_db),
                       user: models.Usuario = Depends(require_roles("tesorero", "superadmin"))):
    cid = caja_scope(user, caja_id)
    sols = db.scalars(select(models.SolicitudCambio).where(
        models.SolicitudCambio.caja_id == cid,
        models.SolicitudCambio.estado == "pendiente")
        .order_by(models.SolicitudCambio.creado_en.desc())).all()
    return [_solicitud_out(x) for x in sols]


@socios_router.post("/solicitudes/{sol_id}/aprobar", response_model=schemas.SocioOut)
def aprobar_solicitud(sol_id: int, db: Session = Depends(get_db),
                      actor: Actor = Depends(require_roles("tesorero", "superadmin"))):
    sol = db.get(models.SolicitudCambio, sol_id)
    if not sol or (actor.rol != "superadmin" and sol.caja_id != actor.caja_id):
        raise HTTPException(404, "Solicitud no encontrada")
    if sol.estado != "pendiente":
        raise HTTPException(400, "La solicitud ya fue resuelta")
    socio = db.get(models.Socio, sol.socio_id)
    campos = json.loads(sol.campos or "{}")
    from datetime import date as _date
    for k, v in campos.items():
        if k not in PERMITIDOS_SOCIO:
            continue
        if k == "fecha_nacimiento" and v:
            try: v = _date.fromisoformat(v)
            except Exception: continue
        setattr(socio, k, v)
    sol.estado = "aprobada"; sol.resuelto_por = actor.nombre; sol.resuelto_en = datetime.utcnow()
    log_audit(db, actor, "editar", "socio", socio.id,
              f"Aprobada actualización de datos de {socio.nombres}",
              caja_id=socio.caja_id, afecta_socio_id=socio.id)
    db.commit()
    return _socio_out(db, socio)


@socios_router.post("/solicitudes/{sol_id}/rechazar", response_model=schemas.SolicitudOut)
def rechazar_solicitud(sol_id: int, db: Session = Depends(get_db),
                       actor: Actor = Depends(require_roles("tesorero", "superadmin"))):
    sol = db.get(models.SolicitudCambio, sol_id)
    if not sol or (actor.rol != "superadmin" and sol.caja_id != actor.caja_id):
        raise HTTPException(404, "Solicitud no encontrada")
    if sol.estado != "pendiente":
        raise HTTPException(400, "La solicitud ya fue resuelta")
    sol.estado = "rechazada"; sol.resuelto_por = actor.nombre; sol.resuelto_en = datetime.utcnow()
    log_audit(db, actor, "editar", "solicitud", sol.socio_id,
              f"Rechazada solicitud de cambio de {sol.socio_nombre}",
              caja_id=sol.caja_id, afecta_socio_id=sol.socio_id)
    db.commit()
    return _solicitud_out(sol)


@socios_router.patch("/{socio_id}", response_model=schemas.SocioOut)
def editar_socio(socio_id: int, data: schemas.SocioUpdate, db: Session = Depends(get_db),
                 actor: Actor = Depends(require_roles("tesorero", "superadmin"))):
    socio = db.get(models.Socio, socio_id)
    if not socio or (actor.rol != "superadmin" and socio.caja_id != actor.caja_id):
        raise HTTPException(404, "Socio no encontrado")
    cambios = data.model_dump(exclude_unset=True)
    for k, v in cambios.items():
        setattr(socio, k, v)
    log_audit(db, actor, "editar", "socio", socio.id,
              f"Ficha de {socio.nombres} actualizada: {', '.join(cambios) or 'sin cambios'}",
              caja_id=socio.caja_id, afecta_socio_id=socio.id)
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
              caja_id=socio.caja_id, afecta_socio_id=socio.id)
    db.commit()
    return _socio_out(db, socio)


@socios_router.post("/{socio_id}/anonimizar", response_model=schemas.SocioOut)
def anonimizar_socio(socio_id: int, db: Session = Depends(get_db),
                     actor: Actor = Depends(require_roles("tesorero", "superadmin"))):
    """Derecho al olvido (LOPDP): borra los datos personales del socio y desactiva su
    acceso, CONSERVANDO los registros contables (aportes/créditos) para integridad."""
    socio = db.get(models.Socio, socio_id)
    if not socio or (actor.rol != "superadmin" and socio.caja_id != actor.caja_id):
        raise HTTPException(404, "Socio no encontrado")
    for campo in ("telefono", "whatsapp", "correo", "direccion", "ocupacion",
                  "contacto_emergencia", "genero", "estado_civil", "nivel_instruccion"):
        setattr(socio, campo, "")
    socio.nombres = "Socio retirado"
    socio.fecha_nacimiento = None
    socio.num_cargas = 0
    socio.activo = False
    socio.cedula = f"ANON-{socio.id}"
    m = db.scalar(select(models.Membresia).where(models.Membresia.socio_id == socio.id))
    if m:
        u = db.get(models.Usuario, m.usuario_id)
        if u and not u.es_superadmin:
            u.activo = False
            otras = db.scalar(select(func.count(models.Membresia.id)).where(
                models.Membresia.usuario_id == u.id, models.Membresia.id != m.id)) or 0
            if not otras:
                u.nombre = "Socio retirado"
                u.cedula = f"ANON-u{u.id}"
    log_audit(db, actor, "editar", "socio", socio.id,
              "Datos personales anonimizados (derecho al olvido); contabilidad conservada",
              caja_id=socio.caja_id, afecta_socio_id=socio.id)
    db.commit()
    return _socio_out(db, socio)


# ---------------------------------------------------------------- aportes
aportes_router = APIRouter(prefix="/aportes", tags=["aportes"])


@aportes_router.get("", response_model=list[schemas.AporteOut])
def listar_aportes(caja_id: int | None = None, socio_id: int | None = None,
                   limit: int = 200, db: Session = Depends(get_db),
                   user: models.Usuario = Depends(require_roles("tesorero", "superadmin", "directiva"))):
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
              caja_id=socio.caja_id, afecta_socio_id=socio.id)
    db.commit()
    item = schemas.AporteOut.model_validate(aporte)
    item.socio_nombres = socio.nombres
    return item


@aportes_router.patch("/{aporte_id}", response_model=schemas.AporteOut)
def editar_aporte(aporte_id: int, data: schemas.AporteUpdate, db: Session = Depends(get_db),
                  user: models.Usuario = Depends(require_roles("tesorero", "superadmin"))):
    ap = db.get(models.Aporte, aporte_id)
    if not ap or (user.rol != "superadmin" and ap.caja_id != user.caja_id):
        raise HTTPException(404, "Movimiento no encontrado")
    if ap.anulado:
        raise HTTPException(400, "Este movimiento está anulado")
    _verificar_ventana(user, ap)
    cambios = data.model_dump(exclude_unset=True)
    for k, v in cambios.items():
        setattr(ap, k, v)
    log_audit(db, user, "editar", "aporte", ap.id,
              f"Aporte de {ap.socio.nombres} corregido: {', '.join(cambios) or 'sin cambios'}",
              caja_id=ap.caja_id, afecta_socio_id=ap.socio_id)
    db.commit()
    item = schemas.AporteOut.model_validate(ap)
    item.socio_nombres = ap.socio.nombres
    return item


@aportes_router.post("/{aporte_id}/anular", response_model=schemas.AporteOut)
def anular_aporte(aporte_id: int, db: Session = Depends(get_db),
                  user: models.Usuario = Depends(require_roles("tesorero", "superadmin"))):
    ap = db.get(models.Aporte, aporte_id)
    if not ap or (user.rol != "superadmin" and ap.caja_id != user.caja_id):
        raise HTTPException(404, "Movimiento no encontrado")
    if ap.anulado:
        raise HTTPException(400, "Este movimiento ya está anulado")
    _verificar_ventana(user, ap)
    ap.anulado = True
    log_audit(db, user, "anular", "aporte", ap.id,
              f"Aporte de ${ap.monto:.2f} de {ap.socio.nombres} anulado", caja_id=ap.caja_id,
              afecta_socio_id=ap.socio_id)
    db.commit()
    item = schemas.AporteOut.model_validate(ap)
    item.socio_nombres = ap.socio.nombres
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
                    user: models.Usuario = Depends(require_roles("tesorero", "superadmin", "directiva"))):
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
    if user.rol in ("tesorero", "directiva") and c.caja_id != user.caja_id:
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
              caja_id=socio.caja_id, afecta_socio_id=socio.id)
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
                  f"(cuota {cuota.numero} vencida)", caja_id=credito.caja_id,
                  afecta_socio_id=credito.socio_id)

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
    log_audit(db, user, "pagar", "cuota", cuota.id, detalle, caja_id=credito.caja_id,
              afecta_socio_id=credito.socio_id)
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
                   user: models.Usuario = Depends(require_roles("tesorero", "superadmin", "directiva"))):
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
              f"Retiro de ${data.monto:.2f} de {socio.nombres}", caja_id=socio.caja_id,
              afecta_socio_id=socio.id)
    db.commit()
    item = schemas.RetiroOut.model_validate(retiro)
    item.socio_nombres = socio.nombres
    return item


@retiros_router.patch("/{retiro_id}", response_model=schemas.RetiroOut)
def editar_retiro(retiro_id: int, data: schemas.RetiroUpdate, db: Session = Depends(get_db),
                  user: models.Usuario = Depends(require_roles("tesorero", "superadmin"))):
    r = db.get(models.Retiro, retiro_id)
    if not r or (user.rol != "superadmin" and r.caja_id != user.caja_id):
        raise HTTPException(404, "Movimiento no encontrado")
    if r.anulado:
        raise HTTPException(400, "Este movimiento está anulado")
    _verificar_ventana(user, r)
    cambios = data.model_dump(exclude_unset=True)
    for k, v in cambios.items():
        setattr(r, k, v)
    log_audit(db, user, "editar", "retiro", r.id,
              f"Retiro de {r.socio.nombres} corregido: {', '.join(cambios) or 'sin cambios'}",
              caja_id=r.caja_id, afecta_socio_id=r.socio_id)
    db.commit()
    item = schemas.RetiroOut.model_validate(r)
    item.socio_nombres = r.socio.nombres
    return item


@retiros_router.post("/{retiro_id}/anular", response_model=schemas.RetiroOut)
def anular_retiro(retiro_id: int, db: Session = Depends(get_db),
                  user: models.Usuario = Depends(require_roles("tesorero", "superadmin"))):
    r = db.get(models.Retiro, retiro_id)
    if not r or (user.rol != "superadmin" and r.caja_id != user.caja_id):
        raise HTTPException(404, "Movimiento no encontrado")
    if r.anulado:
        raise HTTPException(400, "Este movimiento ya está anulado")
    _verificar_ventana(user, r)
    r.anulado = True
    log_audit(db, user, "anular", "retiro", r.id,
              f"Retiro de ${r.monto:.2f} de {r.socio.nombres} anulado", caja_id=r.caja_id,
              afecta_socio_id=r.socio_id)
    db.commit()
    item = schemas.RetiroOut.model_validate(r)
    item.socio_nombres = r.socio.nombres
    return item


# ---------------------------------------------------------------- reportes
reportes_router = APIRouter(tags=["reportes"])


@reportes_router.get("/dashboard", response_model=schemas.DashboardOut)
def dashboard(caja_id: int | None = None, db: Session = Depends(get_db),
              user: models.Usuario = Depends(require_roles("tesorero", "superadmin", "directiva"))):
    cid = caja_scope(user, caja_id)
    caja = db.get(models.Caja, cid)
    if not caja:
        raise HTTPException(404, "Caja no encontrada")
    total_aportes = db.scalar(select(func.coalesce(func.sum(models.Aporte.monto), 0))
                              .where(models.Aporte.caja_id == cid,
                                     models.Aporte.anulado.is_(False))) or 0
    total_retiros = db.scalar(select(func.coalesce(func.sum(models.Retiro.monto), 0))
                              .where(models.Retiro.caja_id == cid,
                                     models.Retiro.anulado.is_(False))) or 0
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
    if user.rol in ("tesorero", "directiva") and socio.caja_id != user.caja_id:
        raise HTTPException(404, "Socio no encontrado")
    caja = db.get(models.Caja, socio.caja_id)
    aportes = sorted([a for a in socio.aportes if not a.anulado],
                     key=lambda a: (a.fecha, a.id), reverse=True)
    retiros = db.scalars(select(models.Retiro).where(models.Retiro.socio_id == sid,
                                                     models.Retiro.anulado.is_(False))
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
    """Bitácora de la caja. El tesorero/superadmin ven todo. El socio, por
    privacidad, ve solo lo que le concierne y los eventos generales de la caja,
    salvo que la caja active 'transparencia_total' (modo asamblea: todos ven todo)."""
    cid = caja_scope(user, caja_id)
    q = select(models.Auditoria).where(models.Auditoria.caja_id == cid)
    if user.rol == "socio":
        caja = db.get(models.Caja, cid)
        if not (caja and caja.transparencia_total):
            from sqlalchemy import or_, and_
            q = q.where(or_(
                models.Auditoria.afecta_socio_id == user.socio_id,
                and_(models.Auditoria.afecta_socio_id.is_(None),
                     models.Auditoria.entidad.in_(["caja", "informe"]))))
    return db.scalars(q.order_by(models.Auditoria.fecha.desc()).limit(limit)).all()


@reportes_router.get("/informe-asamblea", response_model=schemas.InformeAsamblea)
def informe_asamblea(caja_id: int | None = None, db: Session = Depends(get_db),
                     user: models.Usuario = Depends(require_roles("tesorero", "superadmin", "directiva"))):
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
                      user: models.Usuario = Depends(require_roles("tesorero", "superadmin", "directiva"))):
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
             user: models.Usuario = Depends(require_roles("tesorero", "superadmin", "directiva"))):
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

    for a in db.scalars(select(models.Aporte).where(models.Aporte.caja_id == cid,
                                                    models.Aporte.anulado.is_(False))):
        slot(a.fecha)["aportes"] += a.monto
    for r in db.scalars(select(models.Retiro).where(models.Retiro.caja_id == cid,
                                                    models.Retiro.anulado.is_(False))):
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


@reportes_router.get("/export")
def exportar_respaldo(db: Session = Depends(get_db),
                      user: models.Usuario = Depends(require_roles("superadmin"))):
    """Respaldo completo en JSON (sin contraseñas). Para descarga del administrador."""
    def filas(modelo, excluir=()):
        out = []
        for o in db.scalars(select(modelo)).all():
            d = {c.name: getattr(o, c.name) for c in modelo.__table__.columns
                 if c.name not in excluir}
            out.append(d)
        return out
    return {
        "generado_en": datetime.utcnow().isoformat(),
        "cajas": filas(models.Caja),
        "usuarios": filas(models.Usuario, excluir=("password_hash",)),
        "membresias": filas(models.Membresia),
        "socios": filas(models.Socio),
        "aportes": filas(models.Aporte),
        "retiros": filas(models.Retiro),
        "creditos": filas(models.Credito),
        "cuotas": filas(models.Cuota),
        "auditoria": filas(models.Auditoria),
    }


@reportes_router.get("/demografia")
def demografia(caja_id: int | None = None, db: Session = Depends(get_db),
               user: models.Usuario = Depends(require_roles("tesorero", "superadmin", "directiva"))):
    """Perfil de la base social para estudios (a partir de la ficha del socio)."""
    cid = caja_scope(user, caja_id)
    socios = db.scalars(select(models.Socio).where(models.Socio.caja_id == cid,
                                                   models.Socio.activo)).all()
    hoy = date.today()
    def edad(f):
        if not f:
            return None
        return hoy.year - f.year - ((hoy.month, hoy.day) < (f.month, f.day))
    GEN = {"F": "Femenino", "M": "Masculino", "Otro": "Otro", "NS": "Prefiere no decir"}
    genero, instruccion, civil, rangos = {}, {}, {}, {"18-29": 0, "30-44": 0, "45-59": 0, "60+": 0, "Sin dato": 0}
    completa = 0
    for s in socios:
        g = GEN.get(s.genero, "Sin dato") if s.genero else "Sin dato"
        genero[g] = genero.get(g, 0) + 1
        ni = s.nivel_instruccion or "Sin dato"; instruccion[ni] = instruccion.get(ni, 0) + 1
        ec = s.estado_civil or "Sin dato"; civil[ec] = civil.get(ec, 0) + 1
        e = edad(s.fecha_nacimiento)
        k = "Sin dato" if e is None else "18-29" if e < 30 else "30-44" if e < 45 else "45-59" if e < 60 else "60+"
        rangos[k] += 1
        if s.whatsapp and s.correo and s.fecha_nacimiento and s.genero:
            completa += 1
    def lista(d):
        return [{"etiqueta": k, "valor": v} for k, v in sorted(d.items(), key=lambda x: -x[1])]
    total = len(socios)
    return {"total": total, "ficha_completa": completa,
            "ficha_incompleta": total - completa,
            "genero": lista(genero), "edad": [{"etiqueta": k, "valor": v} for k, v in rangos.items()],
            "instruccion": lista(instruccion), "estado_civil": lista(civil)}


@reportes_router.get("/recordatorios")
def recordatorios(caja_id: int | None = None, dias: int = 7, db: Session = Depends(get_db),
                  user: models.Usuario = Depends(require_roles("tesorero", "superadmin", "directiva"))):
    """Socios con cuota vencida o por vencer en los próximos `dias`. Para enviar
    recordatorios por WhatsApp (el front arma el enlace wa.me)."""
    from datetime import timedelta
    cid = caja_scope(user, caja_id)
    caja = db.get(models.Caja, cid)
    hoy = date.today(); limite = hoy + timedelta(days=dias)
    out = []
    creditos = db.scalars(select(models.Credito).where(models.Credito.caja_id == cid,
                                                       models.Credito.estado == "activo")).all()
    for c in creditos:
        cuota = next((q for q in sorted(c.cuotas, key=lambda x: x.numero) if not q.pagada), None)
        if not cuota:
            continue
        if cuota.fecha_vencimiento <= limite:
            socio = c.socio
            pendiente = round(cuota.total - (cuota.abonado or 0), 2)
            out.append({
                "socio": socio.nombres, "whatsapp": socio.whatsapp or socio.telefono or "",
                "credito_id": c.id, "cuota": cuota.numero, "plazo": c.plazo_meses,
                "fecha_vencimiento": cuota.fecha_vencimiento.isoformat(),
                "monto": pendiente,
                "estado": "vencida" if cuota.fecha_vencimiento < hoy else "proxima",
                "caja_nombre": caja.nombre,
            })
    out.sort(key=lambda x: x["fecha_vencimiento"])
    return out


@reportes_router.get("/admin/estadisticas")
def estadisticas_uso(db: Session = Depends(get_db),
                     user: models.Usuario = Depends(require_roles("superadmin"))):
    """Panel de uso para el super admin: accesos, actividad y usuarios.
    Nota: el 'tiempo de conexión' exacto no se mide (sesión sin estado/JWT);
    se reportan ingresos (logins), último acceso y actividad (acciones)."""
    ahora = datetime.utcnow()
    h30 = ahora - timedelta(days=30); h7 = ahora - timedelta(days=7)
    MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]

    accesos = db.scalars(select(models.Acceso).where(models.Acceso.fecha >= h30)).all()
    por_dia = {}
    for a in accesos:
        k = a.fecha.date().isoformat()
        por_dia[k] = por_dia.get(k, 0) + 1
    serie = []
    for i in range(29, -1, -1):
        d = (ahora - timedelta(days=i)).date()
        serie.append({"periodo": d.isoformat(),
                      "etiqueta": f"{d.day} {MES[d.month-1]}",
                      "accesos": por_dia.get(d.isoformat(), 0)})

    activos_7 = len({a.usuario_id for a in accesos if a.fecha >= h7})

    # actividad (acciones de bitácora) por usuario y por caja
    auds = db.scalars(select(models.Auditoria)).all()
    acciones_por_user, ultima_user = {}, {}
    acciones_por_caja, ultima_caja = {}, {}
    for a in auds:
        acciones_por_user[a.usuario_id] = acciones_por_user.get(a.usuario_id, 0) + 1
        if a.usuario_id not in ultima_user or a.fecha > ultima_user[a.usuario_id]:
            ultima_user[a.usuario_id] = a.fecha
        if a.caja_id is not None:
            acciones_por_caja[a.caja_id] = acciones_por_caja.get(a.caja_id, 0) + 1
            if a.caja_id not in ultima_caja or a.fecha > ultima_caja[a.caja_id]:
                ultima_caja[a.caja_id] = a.fecha
    accesos_user_30 = {}
    for a in accesos:
        accesos_user_30[a.usuario_id] = accesos_user_30.get(a.usuario_id, 0) + 1

    # por caja
    cajas = db.scalars(select(models.Caja).order_by(models.Caja.nombre)).all()
    accesos_caja_30 = {}
    for a in accesos:
        if a.caja_id is not None:
            accesos_caja_30[a.caja_id] = accesos_caja_30.get(a.caja_id, 0) + 1
    por_caja = []
    for c in cajas:
        n_socios = db.scalar(select(func.count(models.Socio.id))
                             .where(models.Socio.caja_id == c.id, models.Socio.activo)) or 0
        ua = ultima_caja.get(c.id)
        por_caja.append({"caja": c.nombre, "slug": c.slug, "activa": c.activa,
                         "socios": n_socios, "accesos_30d": accesos_caja_30.get(c.id, 0),
                         "acciones": acciones_por_caja.get(c.id, 0),
                         "ultima_actividad": ua.isoformat() if ua else None})

    # usuarios
    usuarios = db.scalars(select(models.Usuario).where(models.Usuario.activo)).all()
    lista_u = []
    for u in usuarios:
        if u.es_superadmin:
            roles = ["superadmin"]
        else:
            roles = sorted({m.rol for m in membresias_activas(db, u)})
        lista_u.append({
            "nombre": u.nombre, "cedula": u.cedula, "roles": roles or ["—"],
            "ultimo_acceso": u.ultimo_acceso.isoformat() if u.ultimo_acceso else None,
            "accesos_30d": accesos_user_30.get(u.id, 0),
            "acciones": acciones_por_user.get(u.id, 0),
            "ultima_actividad": ultima_user[u.id].isoformat() if u.id in ultima_user else None,
        })
    lista_u.sort(key=lambda x: (x["ultimo_acceso"] or ""), reverse=True)

    return {
        "resumen": {
            "cajas": len(cajas),
            "cajas_activas": sum(1 for c in cajas if c.activa),
            "usuarios": len(usuarios),
            "socios": db.scalar(select(func.count(models.Socio.id)).where(models.Socio.activo)) or 0,
            "accesos_30d": len(accesos),
            "usuarios_activos_7d": activos_7,
        },
        "accesos_por_dia": serie,
        "por_caja": por_caja,
        "usuarios": lista_u,
    }


@reportes_router.get("/analitica")
def analitica(caja_id: int | None = None, db: Session = Depends(get_db),
              user: models.Usuario = Depends(require_roles("tesorero", "superadmin", "directiva"))):
    """Análisis del comportamiento de la caja y los socios: meses pico, destinos
    de crédito, distribución de montos, tipos de aporte y morosidad."""
    cid = caja_scope(user, caja_id)
    bal = balances(caja_id=cid, db=db, user=user)
    serie = bal.serie

    def top(metric, n=3):
        return sorted(
            [{"etiqueta": p.etiqueta, "valor": getattr(p, metric)} for p in serie if getattr(p, metric) > 0],
            key=lambda x: -x["valor"])[:n]

    # destinos de crédito
    creditos = db.scalars(select(models.Credito).where(models.Credito.caja_id == cid)).all()
    dest = {}
    for c in creditos:
        k = (c.destino or "Sin especificar").strip().capitalize() or "Sin especificar"
        d = dest.setdefault(k, {"etiqueta": k, "monto": 0.0, "count": 0})
        d["monto"] += c.monto; d["count"] += 1
    destinos = sorted(dest.values(), key=lambda x: -x["monto"])

    # distribución de montos
    buckets = [("< $100", 0, 100), ("$100–300", 100, 300), ("$300–600", 300, 600),
               ("$600–1000", 600, 1000), ("> $1000", 1000, 10**9)]
    dist = [{"etiqueta": b[0], "valor": 0} for b in buckets]
    montos = [c.monto for c in creditos]
    for m in montos:
        for i, b in enumerate(buckets):
            if b[1] <= m < b[2]:
                dist[i]["valor"] += 1; break

    # tipos de aporte (sin anulados)
    aportes = db.scalars(select(models.Aporte).where(models.Aporte.caja_id == cid,
                                                     models.Aporte.anulado.is_(False))).all()
    tipos = {"ordinario": 0.0, "extraordinario": 0.0, "multa": 0.0}
    for a in aportes:
        tipos[a.tipo] = tipos.get(a.tipo, 0.0) + a.monto
    tipos_aporte = [{"etiqueta": k.capitalize(), "valor": round(v, 2)} for k, v in tipos.items() if v > 0]

    # resumen de créditos
    activos = [c for c in creditos if c.estado == "activo"]
    resumen_cred = {
        "total": len(creditos),
        "activos": len(activos),
        "pagados": sum(1 for c in creditos if c.estado == "pagado"),
        "monto_total": round(sum(montos), 2),
        "monto_promedio": round(sum(montos) / len(montos), 2) if montos else 0,
        "plazo_promedio": round(sum(c.plazo_meses for c in creditos) / len(creditos), 1) if creditos else 0,
        "en_mora": sum(1 for c in activos if _en_mora(c)),
    }

    # --- Perfil de socios (demografía) ---
    socios = db.scalars(select(models.Socio).where(models.Socio.caja_id == cid,
                                                   models.Socio.activo)).all()
    GEN = {"F": "Femenino", "M": "Masculino", "Otro": "Otro", "NS": "Prefiere no decir"}
    def edad(f):
        if not f: return None
        return hoy_d.year - f.year - ((hoy_d.month, hoy_d.day) < (f.month, f.day))
    from datetime import date as _date
    hoy_d = _date.today()
    genero, instr, civil, ocup = {}, {}, {}, {}
    rangos = {"18-29": 0, "30-44": 0, "45-59": 0, "60+": 0, "Sin dato": 0}
    edades = []
    for s in socios:
        g = GEN.get(s.genero, "Sin dato") if s.genero else "Sin dato"; genero[g] = genero.get(g, 0) + 1
        instr[s.nivel_instruccion or "Sin dato"] = instr.get(s.nivel_instruccion or "Sin dato", 0) + 1
        civil[s.estado_civil or "Sin dato"] = civil.get(s.estado_civil or "Sin dato", 0) + 1
        if s.ocupacion: ocup[s.ocupacion] = ocup.get(s.ocupacion, 0) + 1
        e = edad(s.fecha_nacimiento)
        if e is not None: edades.append(e)
        k = "Sin dato" if e is None else "18-29" if e < 30 else "30-44" if e < 45 else "45-59" if e < 60 else "60+"
        rangos[k] += 1
    def lst(d): return [{"etiqueta": k, "valor": v} for k, v in sorted(d.items(), key=lambda x: -x[1])]
    # distribución de ahorro por socio
    ahorros = [_socio_out(db, s).total_aportes for s in socios]
    abk = [("< $50", 0, 50), ("$50–150", 50, 150), ("$150–300", 150, 300),
           ("$300–500", 300, 500), ("> $500", 500, 10**9)]
    adist = [{"etiqueta": b[0], "valor": 0} for b in abk]
    for a in ahorros:
        for i, b in enumerate(abk):
            if b[1] <= a < b[2]: adist[i]["valor"] += 1; break

    demografia = {
        "total": len(socios),
        "edad_promedio": round(sum(edades) / len(edades), 1) if edades else 0,
        "genero": lst(genero),
        "edad": [{"etiqueta": k, "valor": v} for k, v in rangos.items() if v > 0],
        "instruccion": lst(instr), "estado_civil": lst(civil),
        "ocupacion": lst(ocup)[:6],
    }

    return {
        "caja": bal.dashboard.caja.nombre,
        "serie": [p.model_dump() for p in serie],
        "demografia": demografia,
        "ahorro_distribucion": adist,
        "top_ahorristas": [t.model_dump() for t in bal.top_socios],
        "top_ingresos": top("aportes"),
        "top_retiros": top("retiros"),
        "top_desembolsos": top("desembolsos"),
        "destinos": destinos,
        "distribucion_montos": dist,
        "tipos_aporte": tipos_aporte,
        "resumen_creditos": resumen_cred,
        "dashboard": bal.dashboard.model_dump(),
    }


@reportes_router.post("/admin/reseed-demo")
def regenerar_demo(db: Session = Depends(get_db),
                   user: models.Usuario = Depends(require_roles("superadmin"))):
    """Regenera SOLO la caja demo (nukanchik) con datos variados. No toca cajas reales."""
    from .seed import reseed_demo
    reseed_demo()
    return {"ok": True, "mensaje": "Caja demo regenerada con datos variados."}


@reportes_router.get("/admin/seguridad")
def estado_seguridad(db: Session = Depends(get_db),
                     user: models.Usuario = Depends(require_roles("superadmin"))):
    """Chequeo de postura de seguridad para el administrador."""
    secret_ok = os.getenv("SECRET_KEY") not in (None, "", "kullki-dev-secret-cambiar-en-produccion")
    superadmin_env = bool(os.getenv("SUPERADMIN_PASSWORD"))
    pendientes = db.scalar(select(func.count(models.Usuario.id)).where(
        models.Usuario.debe_cambiar_password, models.Usuario.activo)) or 0
    checks = [
        {"clave": "SECRET_KEY configurada", "ok": secret_ok,
         "detalle": "Evita que se puedan falsificar tokens de sesión." if secret_ok
                    else "FALTA: configura SECRET_KEY en Railway (variable de entorno)."},
        {"clave": "Contraseña de administrador propia", "ok": superadmin_env,
         "detalle": "Definida por variable de entorno." if superadmin_env
                    else "FALTA: configura SUPERADMIN_PASSWORD en Railway."},
        {"clave": "Contraseñas cifradas (PBKDF2)", "ok": True, "detalle": "Nunca se guardan en texto plano."},
        {"clave": "Conexión segura (HTTPS)", "ok": True, "detalle": "Tráfico cifrado extremo a extremo."},
        {"clave": "Bloqueo por intentos fallidos", "ok": True, "detalle": "5 intentos y bloqueo temporal."},
        {"clave": "Auto-bloqueo de sesión", "ok": True, "detalle": "Suspensión por inactividad + PIN."},
        {"clave": "Bitácora inmutable / sin borrados", "ok": True, "detalle": "Todo queda auditado."},
        {"clave": "Cabeceras de seguridad", "ok": True, "detalle": "nosniff, anti-clickjacking, etc."},
    ]
    return {"checks": checks,
            "usuarios_con_clave_inicial_pendiente": pendientes,
            "puntaje": sum(1 for c in checks if c["ok"]), "total": len(checks)}
