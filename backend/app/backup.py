"""Respaldos automáticos de la base (snapshot JSON completo, con rotación)."""
import os, json, glob, datetime, logging
from .database import SessionLocal
from . import models

log = logging.getLogger("kullki.backup")
BACKUP_DIR = os.getenv("BACKUP_DIR", "backups")
BACKUP_KEEP = int(os.getenv("BACKUP_KEEP", "14"))

TABLAS = [models.Caja, models.Usuario, models.Membresia, models.Socio, models.Aporte,
          models.Retiro, models.Credito, models.Cuota, models.Auditoria,
          models.SolicitudCambio, models.Acceso, models.Cierre]


def crear_respaldo():
    os.makedirs(BACKUP_DIR, exist_ok=True)
    db = SessionLocal()
    try:
        data = {"generado_en": datetime.datetime.utcnow().isoformat(), "tablas": {}}
        for M in TABLAS:
            filas = []
            for o in db.query(M).all():
                d = {}
                for c in M.__table__.columns:
                    v = getattr(o, c.name)
                    d[c.name] = v.isoformat() if hasattr(v, "isoformat") else v
                filas.append(d)
            data["tablas"][M.__tablename__] = filas
        fn = os.path.join(BACKUP_DIR, f"kullki_{datetime.datetime.utcnow():%Y%m%d_%H%M%S}.json")
        with open(fn, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
        _rotar()
        return fn
    finally:
        db.close()


def _rotar():
    files = sorted(glob.glob(os.path.join(BACKUP_DIR, "kullki_*.json")))
    for old in files[:-BACKUP_KEEP] if len(files) > BACKUP_KEEP else []:
        try:
            os.remove(old)
        except OSError:
            pass


def listar_respaldos():
    files = sorted(glob.glob(os.path.join(BACKUP_DIR, "kullki_*.json")), reverse=True)
    out = []
    for f in files:
        st = os.stat(f)
        out.append({"archivo": os.path.basename(f), "bytes": st.st_size,
                    "fecha": datetime.datetime.utcfromtimestamp(st.st_mtime).isoformat()})
    return out


def iniciar_scheduler():
    """Hilo en segundo plano que respalda cada BACKUP_INTERVAL_HORAS (def. 24h)."""
    if os.getenv("BACKUP_ENABLED", "1") == "0":
        return
    import threading, time
    horas = float(os.getenv("BACKUP_INTERVAL_HORAS", "24"))

    def loop():
        while True:
            try:
                ruta = crear_respaldo()
                log.info("Respaldo creado: %s", ruta)
            except Exception:
                log.exception("Respaldo automático falló")
            time.sleep(max(0.1, horas) * 3600)

    threading.Thread(target=loop, daemon=True).start()
    log.warning("Scheduler de respaldos activo cada %sh en '%s'.", horas, BACKUP_DIR)
