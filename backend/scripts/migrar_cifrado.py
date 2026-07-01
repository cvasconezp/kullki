"""
Backfill de cifrado en reposo (SCAFFOLD — plantilla para la Fase 2 del plan).

Rellena las columnas cifradas (*_enc) y el blind index (cedula_bidx) a partir de
las columnas de texto plano existentes. Idempotente, por lotes y verificable.

    # Simulación (no escribe nada):
    python -m scripts.migrar_cifrado --dry-run

    # Ejecutar backfill real:
    python -m scripts.migrar_cifrado

    # Verificar que todo lo cifrado descifra al valor original:
    python -m scripts.migrar_cifrado --verify

Requisitos: KULLKI_ENC_KEY y KULLKI_INDEX_KEY en el entorno, y que las columnas
nuevas ya existan (Fase 1 / expand). Este archivo es una PLANTILLA: las columnas
cedula_enc/cedula_bidx/*_enc deben existir en los modelos antes de usarlo.

SIEMPRE correr con un RESPALDO reciente y verificado de la base.
"""
from __future__ import annotations
import argparse, sys
from sqlalchemy import select
from app.database import SessionLocal
from app import models
from app.crypto import encrypt, decrypt, blind_index

LOTE = 500

# Campos a cifrar por modelo. (columna_plana -> columna_cifrada)
# Descomentar a medida que las columnas *_enc existan en los modelos.
PLAN = {
    models.Usuario: {
        "cedula": ("cedula_enc", "cedula_bidx"),   # (enc, blind_index)
        # "totp_secret": ("totp_secret_enc", None),
    },
    models.Socio: {
        "cedula": ("cedula_enc", "cedula_bidx"),
        # "telefono": ("telefono_enc", None),
        # "correo": ("correo_enc", None),
        # "whatsapp": ("whatsapp_enc", None),
        # "direccion": ("direccion_enc", None),
        # "contacto_emergencia": ("contacto_emergencia_enc", None),
    },
}


def _tiene_columnas(modelo, mapping) -> bool:
    for plano, (enc, bidx) in mapping.items():
        if not hasattr(modelo, enc):
            print(f"  ⚠ {modelo.__name__}: falta columna {enc} (aplica Fase 1 primero)")
            return False
    return True


def procesar(dry_run: bool, verify: bool) -> int:
    db = SessionLocal()
    total = 0
    try:
        for modelo, mapping in PLAN.items():
            if not _tiene_columnas(modelo, mapping):
                continue
            filas = db.scalars(select(modelo)).all()
            print(f"{modelo.__name__}: {len(filas)} filas")
            n = 0
            for i, fila in enumerate(filas, 1):
                for plano, (enc_col, bidx_col) in mapping.items():
                    valor = getattr(fila, plano, None)
                    if verify:
                        cifrado = getattr(fila, enc_col, None)
                        if valor and decrypt(cifrado) != valor:
                            print(f"  ✗ {modelo.__name__}#{fila.id}: {plano} NO coincide")
                            return 1
                        continue
                    if not valor:
                        continue
                    if not dry_run:
                        setattr(fila, enc_col, encrypt(valor))
                        if bidx_col:
                            setattr(fila, bidx_col, blind_index(valor))
                    n += 1
                if not dry_run and i % LOTE == 0:
                    db.commit()
            if not dry_run:
                db.commit()
            total += n
            print(f"  {'(dry-run) ' if dry_run else ''}{'verificadas' if verify else 'cifradas'}: {n} valores")
        return 0
    finally:
        db.close()
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Backfill de cifrado en reposo (Kullki)")
    ap.add_argument("--dry-run", action="store_true", help="No escribe; solo cuenta")
    ap.add_argument("--verify", action="store_true", help="Verifica que lo cifrado descifra al original")
    args = ap.parse_args()
    print("== Backfill de cifrado ==",
          "(DRY-RUN)" if args.dry_run else "(VERIFY)" if args.verify else "(ESCRITURA REAL)")
    sys.exit(procesar(args.dry_run, args.verify))
