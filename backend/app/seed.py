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
        for i, n in enumerate(NOMBRES):
            ced = f"17{i+1:08d}"
            s = models.Socio(caja_id=caja.id, nombres=n, cedula=ced,
                             telefono=f"09{random.randint(10000000, 99999999)}",
                             fecha_ingreso=date(2025, 1, 15))
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

        for s_i, monto, plazo in ((socios[0], 300, 6), (socios[2], 500, 8), (socios[5], 200, 4)):
            inicio = date(2025, 3, 10)
            cr = models.Credito(caja_id=caja.id, socio_id=s_i.id, monto=monto,
                                tasa_mensual=1.5, plazo_meses=plazo, fecha_desembolso=inicio,
                                destino="capital de trabajo", registrado_por=tes.id)
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
