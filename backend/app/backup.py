"""Respaldos automáticos de la base (snapshot JSON completo, con rotación y envío por email)."""
import os, json, glob, datetime, logging
from .database import SessionLocal
from . import models

log = logging.getLogger("kullki.backup")
BACKUP_DIR  = os.getenv("BACKUP_DIR", "backups")
BACKUP_KEEP = int(os.getenv("BACKUP_KEEP", "14"))

TABLAS = [models.Caja, models.Usuario, models.Membresia, models.Socio, models.Aporte,
          models.Retiro, models.Credito, models.Cuota, models.Auditoria,
          models.SolicitudCambio, models.Acceso, models.Cierre]


def crear_respaldo() -> str:
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
        _enviar_por_email(fn, data)
        return fn
    finally:
        db.close()


def _enviar_por_email(ruta_archivo: str, data: dict):
    """Envía el backup como adjunto al email del administrador."""
    import smtplib, os as _os
    from email.mime.text import MIMEText
    from email.mime.multipart import MIMEMultipart
    from email.mime.application import MIMEApplication

    SMTP_HOST  = _os.getenv("SMTP_HOST", "")
    SMTP_PORT  = int(_os.getenv("SMTP_PORT", "587"))
    SMTP_USER  = _os.getenv("SMTP_USER", "")
    SMTP_PASS  = _os.getenv("SMTP_PASS", "")
    EMAIL_FROM = _os.getenv("EMAIL_FROM", SMTP_USER)
    ADMIN_EMAIL = _os.getenv("ADMIN_EMAIL", SMTP_USER)  # destino del backup

    if not SMTP_HOST or not SMTP_USER or not ADMIN_EMAIL:
        log.warning("Email de backup no configurado (SMTP_HOST/SMTP_USER/ADMIN_EMAIL ausentes).")
        return

    try:
        nombre_archivo = os.path.basename(ruta_archivo)
        n_registros    = sum(len(v) for v in data["tablas"].values())
        n_tablas       = len(data["tablas"])

        msg            = MIMEMultipart()
        msg["Subject"] = f"🔒 Backup Kullki · {datetime.datetime.utcnow():%d/%m/%Y %H:%M} UTC"
        msg["From"]    = EMAIL_FROM
        msg["To"]      = ADMIN_EMAIL

        cuerpo = MIMEText(f"""
<html><body style="font-family:sans-serif;color:#1a1a1a;padding:20px">
  <h2 style="color:#2E7D6B">Backup automático Kullki</h2>
  <p>Se generó un respaldo de la base de datos.</p>
  <table style="border-collapse:collapse;margin:16px 0">
    <tr><td style="padding:4px 12px 4px 0;color:#666">Fecha</td>
        <td><strong>{datetime.datetime.utcnow():%d/%m/%Y %H:%M} UTC</strong></td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#666">Archivo</td>
        <td><strong>{nombre_archivo}</strong></td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#666">Tablas</td>
        <td><strong>{n_tablas}</strong></td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#666">Registros</td>
        <td><strong>{n_registros:,}</strong></td></tr>
  </table>
  <p style="color:#666;font-size:13px">El archivo JSON adjunto contiene todos los datos de Kullki.
  Guárdalo en un lugar seguro.</p>
  <hr style="border:none;border-top:1px solid #eee;margin:20px 0"/>
  <p style="font-size:12px;color:#aaa">Kullki · Yachay Deep Labs · backup automático</p>
</body></html>""", "html")
        msg.attach(cuerpo)

        # Adjuntar JSON comprimido (gzip inline)
        import gzip, io
        buf = io.BytesIO()
        with gzip.GzipFile(fileobj=buf, mode="wb") as gz:
            gz.write(json.dumps(data, ensure_ascii=False).encode())
        adjunto = MIMEApplication(buf.getvalue(), Name=nombre_archivo + ".gz")
        adjunto["Content-Disposition"] = f'attachment; filename="{nombre_archivo}.gz"'
        msg.attach(adjunto)

        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15) as smtp:
            smtp.ehlo()
            smtp.starttls()
            smtp.login(SMTP_USER, SMTP_PASS)
            smtp.sendmail(EMAIL_FROM, ADMIN_EMAIL, msg.as_string())

        log.info("Backup enviado por email a %s", ADMIN_EMAIL)
    except Exception:
        log.exception("No se pudo enviar el backup por email (se guardó localmente igual).")


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
    log.warning("Scheduler de respaldos activo cada %sh en '%s'. Email a: %s",
                horas, BACKUP_DIR, os.getenv("ADMIN_EMAIL", "—"))
