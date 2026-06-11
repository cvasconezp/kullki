from datetime import date, datetime
from pydantic import BaseModel, Field


# ---------- Auth ----------
class LoginIn(BaseModel):
    cedula: str
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    rol: str
    nombre: str
    caja_id: int | None
    socio_id: int | None
    caja_nombre: str | None = None


class CambioPassword(BaseModel):
    actual: str
    nueva: str = Field(min_length=6)


# ---------- Cajas ----------
class CajaIn(BaseModel):
    nombre: str
    slug: str
    comunidad: str = ""
    tasa_interes_mensual: float = 1.5
    aporte_ordinario: float = 10.0
    multa_mora: float = 0.0
    tesorero_nombre: str
    tesorero_cedula: str
    tesorero_password: str = Field(min_length=6)


class CajaOut(BaseModel):
    id: int
    nombre: str
    slug: str
    comunidad: str
    tasa_interes_mensual: float
    aporte_ordinario: float
    multa_mora: float
    activa: bool

    class Config:
        from_attributes = True


# ---------- Socios ----------
class SocioIn(BaseModel):
    nombres: str
    cedula: str
    telefono: str = ""
    fecha_ingreso: date | None = None
    caja_id: int | None = None  # solo superadmin


class SocioOut(BaseModel):
    id: int
    caja_id: int
    nombres: str
    cedula: str
    telefono: str
    fecha_ingreso: date
    activo: bool
    total_aportes: float = 0      # ahorro neto: aportes (sin multas) - retiros
    total_multas: float = 0
    saldo_credito: float = 0

    class Config:
        from_attributes = True


# ---------- Aportes ----------
class AporteIn(BaseModel):
    socio_id: int
    monto: float = Field(gt=0)
    fecha: date | None = None
    tipo: str = "ordinario"
    nota: str = ""


class AporteOut(BaseModel):
    id: int
    socio_id: int
    socio_nombres: str | None = None
    monto: float
    fecha: date
    tipo: str
    nota: str

    class Config:
        from_attributes = True


# ---------- Créditos ----------
class CreditoIn(BaseModel):
    socio_id: int
    monto: float = Field(gt=0)
    tasa_mensual: float | None = None  # si no, usa la de la caja
    plazo_meses: int = Field(gt=0, le=60)
    fecha_desembolso: date | None = None
    destino: str = ""


class CuotaOut(BaseModel):
    id: int
    numero: int
    fecha_vencimiento: date
    capital: float
    interes: float
    total: float
    abonado: float
    pagada: bool
    fecha_pago: date | None

    class Config:
        from_attributes = True


class CreditoOut(BaseModel):
    id: int
    socio_id: int
    socio_nombres: str | None = None
    monto: float
    tasa_mensual: float
    plazo_meses: int
    fecha_desembolso: date
    destino: str
    estado: str
    saldo_capital: float = 0
    cuotas_pagadas: int = 0
    en_mora: bool = False

    class Config:
        from_attributes = True


class CreditoDetalle(CreditoOut):
    cuotas: list[CuotaOut] = []


class PagoCuotaIn(BaseModel):
    fecha_pago: date | None = None


# ---------- Reportes ----------
class DashboardOut(BaseModel):
    caja: CajaOut
    socios_activos: int
    fondo_disponible: float
    total_aportes: float
    capital_prestado: float
    capital_recuperado: float
    intereses_cobrados: float
    total_retiros: float = 0
    abonos_en_transito: float = 0
    creditos_activos: int
    cuotas_en_mora: int
    monto_en_mora: float


class LibretaOut(BaseModel):
    socio: SocioOut
    caja_nombre: str
    aportes: list[AporteOut]
    retiros: list["RetiroOut"] = []
    creditos: list[CreditoDetalle]


class AuditoriaOut(BaseModel):
    id: int
    usuario_nombre: str
    accion: str
    entidad: str
    entidad_id: int
    detalle: str
    fecha: datetime

    class Config:
        from_attributes = True


# ---------- Retiros ----------
class RetiroIn(BaseModel):
    socio_id: int
    monto: float = Field(gt=0)
    fecha: date | None = None
    nota: str = ""


class RetiroOut(BaseModel):
    id: int
    socio_id: int
    socio_nombres: str | None = None
    monto: float
    fecha: date
    nota: str

    class Config:
        from_attributes = True


class AbonoIn(BaseModel):
    monto: float = Field(gt=0)
    fecha_pago: date | None = None


# ---------- Informe de asamblea ----------
class FilaInforme(BaseModel):
    socio: str
    cedula: str
    ahorro_neto: float
    multas: float
    saldo_credito: float
    en_mora: bool


class InformeAsamblea(BaseModel):
    caja: CajaOut
    fecha: date
    dashboard: DashboardOut
    filas: list[FilaInforme]


class FilaCierre(BaseModel):
    socio: str
    ahorro_neto: float
    porcentaje: float
    utilidad: float


class CierreSimulacion(BaseModel):
    intereses_a_repartir: float
    total_ahorro: float
    filas: list[FilaCierre]
