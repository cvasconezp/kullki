"""Datos de demostración: una caja con socios, aportes y créditos.
Uso: python -m app.seed  (desde backend/)"""
from datetime import date, timedelta
import random
from app.database import Base, engine, SessionLocal
from app import models
from app.auth import hash_password

NOMBRES = ["María Quilumbaquí", "José Farinango", "Rosa Cabascango", "Luis Tuquerres",
           "Carmen Imbaquingo", "Pedro Catucuamba", "Dolores Ulcuango", "Manuel Lechón",
           "Teresa Pijal", "Segundo Andrango", "Blanca Cacuango", "Rafael Inlago"]

def run():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        if db.query(models.Caja).count():
            print("Ya existen datos; no se siembra de nuevo.")
            return
        caja = models.Caja(nombre="Caja de Ahorro Ñukanchik Kullki", slug="nukanchik",
                           comunidad="Cayambe", tasa_interes_mensual=1.5, aporte_ordinario=10,
                           multa_mora=2.0, color_primario="#0E7A5C",
                           color_acento="#D9A116", logo="🌾")
        db.add(caja); db.flush()
        tes = models.Usuario(nombre="Tesorera Demo", cedula="1700000000",
                             password_hash=hash_password("tesorera123"))
        db.add(tes); db.flush()
        db.add(models.Membresia(usuario_id=tes.id, caja_id=caja.id, rol="tesorero"))
        random.seed(7)
        socios = []
        GENEROS = ["F", "M"]
        INSTR = ["Primaria", "Secundaria", "Superior", "Ninguna"]
        CIVIL = ["Soltero/a", "Casado/a", "Unión libre", "Viudo/a"]
        OCUP = ["Agricultor/a", "Comerciante", "Artesano/a", "Ama de casa", "Jornalero/a",
                "Docente", "Albañil", "Costurera", "Ganadero/a", "Tendero/a"]
        for i, n in enumerate(NOMBRES):
            ced = f"17{i+1:08d}"
            anio = 1962 + (i * 3) % 42      # edades variadas (1962..2003)
            mes = (i * 5) % 12 + 1; dia = (i * 7) % 27 + 1
            wsp = f"09{random.randint(10000000, 99999999)}"
            s = models.Socio(caja_id=caja.id, nombres=n, cedula=ced,
                             telefono=wsp, whatsapp=wsp,
                             correo=(n.split()[0] + str(i) + "@example.com").lower() if i % 3 else "",
                             fecha_ingreso=date(2025, 1, 15),
                             fecha_nacimiento=date(anio, mes, dia),
                             genero=GENEROS[i % 2],
                             nivel_instruccion=INSTR[i % len(INSTR)],
                             estado_civil=CIVIL[i % len(CIVIL)],
                             ocupacion=OCUP[i % len(OCUP)],
                             num_cargas=i % 5)
            db.add(s); db.flush()
            u = models.Usuario(nombre=n, cedula=ced, password_hash=hash_password(ced))
            db.add(u); db.flush()
            db.add(models.Membresia(usuario_id=u.id, caja_id=caja.id, socio_id=s.id, rol="socio"))
            socios.append(s)
        # 16 meses de aportes ordinarios
        for k in range(16):
            f = date(2025, 1, 28) + timedelta(days=30 * k)
            if f > date.today():
                break
            for s in socios:
                db.add(models.Aporte(caja_id=caja.id, socio_id=s.id, monto=10, fecha=f,
                                     tipo="ordinario", registrado_por=tes.id))
        db.flush()

        # Algunos créditos con cuotas pagadas, para alimentar el dashboard de balances
        def _add_months(d, n):
            m = d.month - 1 + n
            y = d.year + m // 12
            return date(y, m % 12 + 1, min(d.day, 28))

        creds = ((socios[0], 300, 6, "Capital de trabajo", date(2025, 3, 10)),
                 (socios[2], 500, 8, "Siembra", date(2025, 4, 12)),
                 (socios[5], 200, 4, "Salud", date(2025, 5, 8)),
                 (socios[7], 800, 10, "Vivienda", date(2025, 2, 20)),
                 (socios[9], 150, 3, "Educación", date(2025, 6, 1)),
                 (socios[3], 400, 6, "Capital de trabajo", date(2025, 1, 25)))
        for s_i, monto, plazo, destino, inicio in creds:
            cr = models.Credito(caja_id=caja.id, socio_id=s_i.id, monto=monto,
                                tasa_mensual=1.5, plazo_meses=plazo, fecha_desembolso=inicio,
                                destino=destino, registrado_por=tes.id)
            db.add(cr); db.flush()
            i = 0.015; saldo = monto
            cuota_fija = monto * (i * (1 + i) ** plazo) / ((1 + i) ** plazo - 1)
            for k in range(1, plazo + 1):
                interes = round(saldo * i, 2)
                capital = round(cuota_fija - interes, 2) if k < plazo else round(saldo, 2)
                total = round(capital + interes, 2); saldo = round(saldo - capital, 2)
                venc = _add_months(inicio, k)
                pagada = k <= max(1, plazo // 2) and venc <= date.today()
                db.add(models.Cuota(credito_id=cr.id, numero=k, fecha_vencimiento=venc,
                                    capital=capital, interes=interes, total=total,
                                    abonado=total if pagada else 0.0, pagada=pagada,
                                    fecha_pago=venc if pagada else None,
                                    registrado_por=tes.id if pagada else None))

        # Un retiro de ejemplo
        db.add(models.Retiro(caja_id=caja.id, socio_id=socios[1].id, monto=20,
                             fecha=date(2025, 6, 5), nota="retiro parcial",
                             registrado_por=tes.id))

        db.commit()
        print("Caja demo creada. Tesorera: 1700000000 / tesorera123. "
              "Socios: cédula como usuario y contraseña.")
    finally:
        db.close()

if __name__ == "__main__":
    run()


def enriquecer_demo():
    """Rellena datos demográficos de los socios de la caja demo (nukanchik) si están vacíos.
    Idempotente: solo toca socios sin fecha_nacimiento. No afecta cajas reales."""
    from datetime import date as _date
    db = SessionLocal()
    try:
        caja = db.query(models.Caja).filter_by(slug="nukanchik").first()
        if not caja:
            return
        socios = db.query(models.Socio).filter_by(caja_id=caja.id).order_by(models.Socio.id).all()
        GENEROS = ["F", "M"]
        INSTR = ["Primaria", "Secundaria", "Superior", "Ninguna"]
        CIVIL = ["Soltero/a", "Casado/a", "Unión libre", "Viudo/a"]
        OCUP = ["Agricultor/a", "Comerciante", "Artesano/a", "Ama de casa", "Jornalero/a",
                "Docente", "Albañil", "Costurera", "Ganadero/a", "Tendero/a"]
        n = 0
        for i, s in enumerate(socios):
            if s.fecha_nacimiento:
                continue
            anio = 1962 + (i * 3) % 42; mes = (i * 5) % 12 + 1; dia = (i * 7) % 27 + 1
            s.fecha_nacimiento = _date(anio, mes, dia)
            s.genero = GENEROS[i % 2]
            s.nivel_instruccion = INSTR[i % len(INSTR)]
            s.estado_civil = CIVIL[i % len(CIVIL)]
            s.ocupacion = OCUP[i % len(OCUP)]
            s.num_cargas = i % 5
            if not s.whatsapp:
                s.whatsapp = s.telefono or ""
            if not s.correo and i % 3:
                s.correo = (s.nombres.split()[0] + str(i) + "@example.com").lower()
            n += 1
        if n:
            db.commit()
            print(f"Demo enriquecido: {n} socios con datos demográficos.")
    finally:
        db.close()
