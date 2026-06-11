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
                           comunidad="Cayambe", tasa_interes_mensual=1.5, aporte_ordinario=10)
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
        db.commit()
        print("Caja demo creada. Tesorera: 1700000000 / tesorera123. "
              "Socios: cédula como usuario y contraseña.")
    finally:
        db.close()

if __name__ == "__main__":
    run()
