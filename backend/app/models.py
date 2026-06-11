from datetime import datetime, date
from sqlalchemy import (
    String, Integer, Float, Date, DateTime, ForeignKey, Boolean, Text, UniqueConstraint
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .database import Base


class Caja(Base):
    __tablename__ = "cajas"
    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(120))
    slug: Mapped[str] = mapped_column(String(60), unique=True, index=True)
    comunidad: Mapped[str] = mapped_column(String(120), default="")
    tasa_interes_mensual: Mapped[float] = mapped_column(Float, default=1.5)  # % mensual por defecto
    aporte_ordinario: Mapped[float] = mapped_column(Float, default=10.0)
    activa: Mapped[bool] = mapped_column(Boolean, default=True)
    creada_en: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    socios: Mapped[list["Socio"]] = relationship(back_populates="caja")


class Usuario(Base):
    __tablename__ = "usuarios"
    __table_args__ = (UniqueConstraint("cedula", name="uq_usuario_cedula"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    caja_id: Mapped[int | None] = mapped_column(ForeignKey("cajas.id"), nullable=True)  # null = superadmin
    socio_id: Mapped[int | None] = mapped_column(ForeignKey("socios.id"), nullable=True)
    nombre: Mapped[str] = mapped_column(String(120))
    cedula: Mapped[str] = mapped_column(String(20), index=True)
    password_hash: Mapped[str] = mapped_column(String(256))
    rol: Mapped[str] = mapped_column(String(20))  # superadmin | tesorero | socio
    activo: Mapped[bool] = mapped_column(Boolean, default=True)


class Socio(Base):
    __tablename__ = "socios"
    __table_args__ = (UniqueConstraint("caja_id", "cedula", name="uq_socio_caja_cedula"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    caja_id: Mapped[int] = mapped_column(ForeignKey("cajas.id"), index=True)
    nombres: Mapped[str] = mapped_column(String(120))
    cedula: Mapped[str] = mapped_column(String(20))
    telefono: Mapped[str] = mapped_column(String(20), default="")
    fecha_ingreso: Mapped[date] = mapped_column(Date, default=date.today)
    activo: Mapped[bool] = mapped_column(Boolean, default=True)

    caja: Mapped["Caja"] = relationship(back_populates="socios")
    aportes: Mapped[list["Aporte"]] = relationship(back_populates="socio")
    creditos: Mapped[list["Credito"]] = relationship(back_populates="socio")


class Aporte(Base):
    __tablename__ = "aportes"
    id: Mapped[int] = mapped_column(primary_key=True)
    caja_id: Mapped[int] = mapped_column(ForeignKey("cajas.id"), index=True)
    socio_id: Mapped[int] = mapped_column(ForeignKey("socios.id"), index=True)
    monto: Mapped[float] = mapped_column(Float)
    fecha: Mapped[date] = mapped_column(Date, default=date.today)
    tipo: Mapped[str] = mapped_column(String(20), default="ordinario")  # ordinario | extraordinario | multa
    nota: Mapped[str] = mapped_column(String(200), default="")
    registrado_por: Mapped[int] = mapped_column(ForeignKey("usuarios.id"))
    creado_en: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    socio: Mapped["Socio"] = relationship(back_populates="aportes")


class Credito(Base):
    __tablename__ = "creditos"
    id: Mapped[int] = mapped_column(primary_key=True)
    caja_id: Mapped[int] = mapped_column(ForeignKey("cajas.id"), index=True)
    socio_id: Mapped[int] = mapped_column(ForeignKey("socios.id"), index=True)
    monto: Mapped[float] = mapped_column(Float)
    tasa_mensual: Mapped[float] = mapped_column(Float)  # % mensual
    plazo_meses: Mapped[int] = mapped_column(Integer)
    fecha_desembolso: Mapped[date] = mapped_column(Date, default=date.today)
    destino: Mapped[str] = mapped_column(String(200), default="")
    estado: Mapped[str] = mapped_column(String(20), default="activo")  # activo | pagado
    registrado_por: Mapped[int] = mapped_column(ForeignKey("usuarios.id"))
    creado_en: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    socio: Mapped["Socio"] = relationship(back_populates="creditos")
    cuotas: Mapped[list["Cuota"]] = relationship(
        back_populates="credito", order_by="Cuota.numero", cascade="all, delete-orphan"
    )


class Cuota(Base):
    __tablename__ = "cuotas"
    id: Mapped[int] = mapped_column(primary_key=True)
    credito_id: Mapped[int] = mapped_column(ForeignKey("creditos.id"), index=True)
    numero: Mapped[int] = mapped_column(Integer)
    fecha_vencimiento: Mapped[date] = mapped_column(Date)
    capital: Mapped[float] = mapped_column(Float)
    interes: Mapped[float] = mapped_column(Float)
    total: Mapped[float] = mapped_column(Float)
    pagada: Mapped[bool] = mapped_column(Boolean, default=False)
    fecha_pago: Mapped[date | None] = mapped_column(Date, nullable=True)
    registrado_por: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"), nullable=True)

    credito: Mapped["Credito"] = relationship(back_populates="cuotas")


class Auditoria(Base):
    __tablename__ = "auditoria"
    id: Mapped[int] = mapped_column(primary_key=True)
    caja_id: Mapped[int | None] = mapped_column(ForeignKey("cajas.id"), nullable=True, index=True)
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id"))
    usuario_nombre: Mapped[str] = mapped_column(String(120))
    accion: Mapped[str] = mapped_column(String(40))      # crear | pagar | editar | desactivar
    entidad: Mapped[str] = mapped_column(String(40))     # socio | aporte | credito | cuota | caja
    entidad_id: Mapped[int] = mapped_column(Integer)
    detalle: Mapped[str] = mapped_column(Text, default="")
    fecha: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
