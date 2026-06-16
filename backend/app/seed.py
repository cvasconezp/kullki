"""Datos de demostración variados (ahorros distintos, créditos sanos/en mora/pagados,
retiros y multas), con temporalidad de varios meses. Uso: python -m app.seed"""
from datetime import date, timedelta
import random
from app.database import Base, engine, SessionLocal
from app import models
from app.auth import hash_password

NOMBRES = ["María Quilumbaquí", "José Farinango", "Rosa Cabascango", "Luis Tuquerres",
           "Carmen Imbaquingo", "Pedro Catucuamba", "Dolores Ulcuango", "Manuel Lechón",
           "Teresa Pijal", "Segundo Andrango", "Blanca Cacuango", "Rafael Inlago"]
GENEROS = ["F", "M"]
INSTR = ["Primaria", "Secundaria", "Superior", "Ninguna"]
CIVIL = ["Soltero/a", "Casado/a", "Unión libre", "Viudo/a"]
OCUP = ["Agricultor/a", "Comerciante", "Artesano/a", "Ama de casa", "Jornalero/a",
        "Docente", "Albañil", "Costurera", "Ganadero/a", "Tendero/a"]
APORTE_MENSUAL = [25, 10, 15, 10, 30, 10, 12, 20, 8, 10, 15, 10]
IRREGULARES = {1, 8, 9}
GRANDES = {0, 4, 7}


def _add_months(d, n):
    m = d.month - 1 + n
    y = d.year + m // 12
    return date(y, m % 12 + 1, min(d.day, 28))


def _usuario(db, nombre, cedula, password):
    """Reutiliza el usuario si la cédula ya existe (la cédula es única global);
    si no, lo crea. Evita choques al regenerar el demo cuando la cédula ya se usó."""
    u = db.query(models.Usuario).filter_by(cedula=cedula).first()
    if not u:
        u = models.Usuario(nombre=nombre, cedula=cedula, password_hash=hash_password(password))
        db.add(u); db.flush()
    return u


def construir_demo(db):
    """Crea la caja demo con datos heterogéneos. Asume que aún no existe."""
    random.seed(7)
    hoy = date.today()
    inicio_aportes = _add_months(hoy, -15)   # ~15 meses de historia
    caja = models.Caja(nombre="Caja de Ahorro Ñukanchik Kullki", slug="nukanchik",
                       comunidad="Cayambe", tasa_interes_mensual=1.5, aporte_ordinario=10,
                       multa_mora=2.0, color_primario="#0E7A5C",
                       color_acento="#D9A116", logo="🌾")
    db.add(caja); db.flush()
    tes = _usuario(db, "Tesorera Demo", "1700000000", "tesorera123")
    db.add(models.Membresia(usuario_id=tes.id, caja_id=caja.id, rol="tesorero"))

    dire = _usuario(db, "Presidenta Demo", "1700000013", "1700000013")
    db.add(models.Membresia(usuario_id=dire.id, caja_id=caja.id, rol="directiva"))

    socios = []
    for i, n in enumerate(NOMBRES):
        ced = f"17{i+1:08d}"
        anio = 1962 + (i * 3) % 42; mes = (i * 5) % 12 + 1; dia = (i * 7) % 27 + 1
        wsp = f"09{random.randint(10000000, 99999999)}"
        s = models.Socio(caja_id=caja.id, nombres=n, cedula=ced, telefono=wsp, whatsapp=wsp,
                         correo=(n.split()[0] + str(i) + "@example.com").lower() if i % 3 else "",
                         fecha_ingreso=inicio_aportes,
                         fecha_nacimiento=date(anio, mes, dia), genero=GENEROS[i % 2],
                         nivel_instruccion=INSTR[i % len(INSTR)], estado_civil=CIVIL[i % len(CIVIL)],
                         ocupacion=OCUP[i % len(OCUP)], num_cargas=i % 5)
        db.add(s); db.flush()
        u = _usuario(db, n, ced, ced)
        db.add(models.Membresia(usuario_id=u.id, caja_id=caja.id, socio_id=s.id, rol="socio"))
        socios.append(s)

    # Aportes mensuales heterogéneos (montos distintos, algunos saltan meses)
    for k in range(16):
        f = _add_months(inicio_aportes, k)
        if f > hoy:
            break
        for i, s in enumerate(socios):
            if i in IRREGULARES and (i + k) % 3 == 0:
                continue
            db.add(models.Aporte(caja_id=caja.id, socio_id=s.id, monto=APORTE_MENSUAL[i], fecha=f,
                                 tipo="ordinario", registrado_por=tes.id))
        if k == 8:
            for i in GRANDES:
                db.add(models.Aporte(caja_id=caja.id, socio_id=socios[i].id, monto=50, fecha=f,
                                     tipo="extraordinario", nota="ahorro extra", registrado_por=tes.id))
    db.flush()

    # Créditos con perfiles: (socio, monto, plazo, destino, meses_atras, cuotas_pagadas)
    perfiles = [
        (socios[0], 300, 6, "Capital de trabajo", 4, 4),
        (socios[10], 600, 12, "Ganadería", 7, 5),
        (socios[5], 200, 4, "Salud", 6, 4),
        (socios[2], 500, 8, "Siembra", 6, 3),
        (socios[7], 800, 10, "Vivienda", 9, 2),
        (socios[3], 400, 6, "Educación", 5, 2),
        (socios[9], 150, 3, "Emprendimiento", 1, 0),
    ]
    for s_i, monto, plazo, destino, atras, pagar in perfiles:
        ini = _add_months(hoy, -atras)
        cr = models.Credito(caja_id=caja.id, socio_id=s_i.id, monto=monto, tasa_mensual=1.5,
                            plazo_meses=plazo, fecha_desembolso=ini, destino=destino,
                            registrado_por=tes.id)
        db.add(cr); db.flush()
        i = 0.015; saldo = monto
        cuota_fija = monto * (i * (1 + i) ** plazo) / ((1 + i) ** plazo - 1)
        primera_mora = None
        for k in range(1, plazo + 1):
            interes = round(saldo * i, 2)
            capital = round(cuota_fija - interes, 2) if k < plazo else round(saldo, 2)
            total = round(capital + interes, 2); saldo = round(saldo - capital, 2)
            venc = _add_months(ini, k)
            pagada = k <= pagar
            if (not pagada) and venc < hoy and primera_mora is None:
                primera_mora = venc
            db.add(models.Cuota(credito_id=cr.id, numero=k, fecha_vencimiento=venc,
                                capital=capital, interes=interes, total=total,
                                abonado=total if pagada else 0.0, pagada=pagada,
                                fecha_pago=venc if pagada else None,
                                registrado_por=tes.id if pagada else None))
        if pagar >= plazo:
            cr.estado = "pagado"
        if primera_mora is not None:
            db.add(models.Aporte(caja_id=caja.id, socio_id=s_i.id, monto=2.0, fecha=primera_mora,
                                 tipo="multa", nota="mora de cuota", registrado_por=tes.id))

    for idx, monto, dias in ((1, 20, 40), (4, 40, 120), (8, 15, 200)):
        db.add(models.Retiro(caja_id=caja.id, socio_id=socios[idx].id, monto=monto,
                             fecha=hoy - timedelta(days=dias), nota="retiro parcial",
                             registrado_por=tes.id))
    db.commit()
    return caja


def run():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        if db.query(models.Caja).count():
            print("Ya existen datos; no se siembra de nuevo.")
            return
        construir_demo(db)
        print("Caja demo creada (datos variados). Tesorera: 1700000000 / tesorera123.")
    finally:
        db.close()


def reseed_demo():
    """Borra SOLO la caja demo (nukanchik) y la recrea con datos variados."""
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        caja = db.query(models.Caja).filter_by(slug="nukanchik").first()
        if caja:
            cid = caja.id
            cred_ids = [c.id for c in db.query(models.Credito.id).filter_by(caja_id=cid).all()]
            usuario_ids = [m.usuario_id for m in db.query(models.Membresia).filter_by(caja_id=cid).all()]
            if cred_ids:
                db.query(models.Cuota).filter(models.Cuota.credito_id.in_(cred_ids)).delete(synchronize_session=False)
            for M in (models.SolicitudCredito, models.SolicitudCambio,
                      models.Credito, models.Aporte, models.Retiro, models.Auditoria,
                      models.Acceso, models.Membresia, models.Socio):
                db.query(M).filter_by(caja_id=cid).delete(synchronize_session=False)
            db.query(models.Caja).filter_by(id=cid).delete(synchronize_session=False)
            for uid in usuario_ids:
                u = db.get(models.Usuario, uid)
                if u and not u.es_superadmin and not db.query(models.Membresia).filter_by(usuario_id=uid).count():
                    db.delete(u)
            db.commit()
        construir_demo(db)
        print("Demo regenerado con datos variados.")
    finally:
        db.close()


def enriquecer_demo():
    """Rellena datos demográficos de los socios de la caja demo si están vacíos (idempotente)."""
    from datetime import date as _date
    db = SessionLocal()
    try:
        caja = db.query(models.Caja).filter_by(slug="nukanchik").first()
        if not caja:
            return
        socios = db.query(models.Socio).filter_by(caja_id=caja.id).order_by(models.Socio.id).all()
        n = 0
        for i, s in enumerate(socios):
            if s.fecha_nacimiento:
                continue
            anio = 1962 + (i * 3) % 42; mes = (i * 5) % 12 + 1; dia = (i * 7) % 27 + 1
            s.fecha_nacimiento = _date(anio, mes, dia); s.genero = GENEROS[i % 2]
            s.nivel_instruccion = INSTR[i % len(INSTR)]; s.estado_civil = CIVIL[i % len(CIVIL)]
            s.ocupacion = OCUP[i % len(OCUP)]; s.num_cargas = i % 5
            if not s.whatsapp:
                s.whatsapp = s.telefono or ""
            if not s.correo and i % 3:
                s.correo = (s.nombres.split()[0] + str(i) + "@example.com").lower()
            n += 1
        if n:
            db.commit(); print(f"Demo enriquecido: {n} socios.")
    finally:
        db.close()


if __name__ == "__main__":
    run()
