from datetime import date, datetime
from pydantic import BaseModel, Field


# ---------- Auth ----------
class LoginIn(BaseModel):
    cedula: str
    password: str
    totp: str | None = None


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    rol: str
    nombre: str
    caja_id: int | None
    socio_id: int | None
    caja_nombre: str | None = None


class CajaMembresia(BaseModel):
    caja_id: int
    caja_nombre: str
    caja_slug: str = ""
    comunidad: str = ""
    rol: str
    socio_id: int | None = None
    color_primario: str | None = None
    color_acento: str | None = None
    logo: str | None = None


class LoginOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    nombre: str
    rol: str | None = None              # None cuando requiere_seleccion
    caja_id: int | None = None
    caja_nombre: str | None = None
    caja_slug: str | None = None        # para enrutar a /{slug}
    socio_id: int | None = None
    # Branding de la caja activa: el front acopla colores y logo
    color_primario: str | None = None
    color_acento: str | None = None
    logo: str | None = None
    es_impersonacion: bool = False      # True si un superadmin entró como tesorero/socio
    debe_cambiar_password: bool = False # True => el front obliga a cambiar la clave inicial
    requiere_seleccion: bool = False    # True => el front muestra el selector de caja
    cajas: list[CajaMembresia] = []


class SeleccionCaja(BaseModel):
    caja_id: int


class VerificarIn(BaseModel):
    password: str


class CedulaIn(BaseModel):
    cedula: str


class TotpCodigo(BaseModel):
    codigo: str


class CierreIn(BaseModel):
    modo: str = "repartir"   # repartir | capitalizar


class SolicitudCreditoIn(BaseModel):
    monto: float = Field(gt=0)
    plazo_meses: int = Field(gt=0, le=60)
    tipo: str = "ordinario"
    destino: str = ""
    garante: str = ""
    garante2: str = ""
    garante_id: int | None = None
    garante2_id: int | None = None
    documentos: str = ""
    documento_nombre: str = ""
    documento_b64: str = ""


class SolicitudCreditoOut(BaseModel):
    id: int
    socio_id: int
    socio_nombre: str
    monto: float
    plazo_meses: int
    destino: str = ""
    garante: str = ""
    garante2: str = ""
    garante_estado: str = "pendiente"
    garante2_estado: str = ""
    tipo: str = "ordinario"
    documentos: str = ""
    documento_nombre: str = ""
    estado: str
    motivo: str = ""
    creado_en: datetime
    creditos_activos: int = 0
    ahorro: float = 0

    class Config:
        from_attributes = True


class AsumirCaja(BaseModel):
    """El superadmin entra a una caja como tesorero o (opcionalmente) un socio."""
    caja_id: int
    rol: str = "tesorero"           # tesorero | socio
    socio_id: int | None = None     # requerido si rol == "socio"


class CambioPassword(BaseModel):
    actual: str
    nueva: str = Field(min_length=8)


# ---------- Cajas ----------
class CajaIn(BaseModel):
    nombre: str
    slug: str
    comunidad: str = ""
    tasa_interes_mensual: float = 1.5
    aporte_ordinario: float = 10.0
    multa_mora: float = 0.0
    color_primario: str = "#1B3A6B"
    color_acento: str = "#E8A838"
    logo: str = ""
    transparencia_total: bool = False
    credito_max: float = 0.0
    encaje_factor: float = 0.0
    permite_retiros: bool = True
    dia_corte: int = 0
    multa_atraso: float = 0.0
    permite_eco_ahorro: bool = False
    permite_mascotas: bool = False
    permite_inversiones: bool = False
    permite_credito_educativo: bool = False
    tesorero_nombre: str
    tesorero_cedula: str
    tesorero_password: str = Field(min_length=8)


class DirectivaIn(BaseModel):
    nombre: str
    cedula: str
    password: str = Field(min_length=8)


class CajaUpdate(BaseModel):
    """Edición de una caja ya creada. Todos los campos son opcionales."""
    nombre: str | None = None
    comunidad: str | None = None
    tasa_interes_mensual: float | None = None
    aporte_ordinario: float | None = None
    multa_mora: float | None = None
    color_primario: str | None = None
    color_acento: str | None = None
    logo: str | None = None
    transparencia_total: bool | None = None
    credito_max: float | None = None
    encaje_factor: float | None = None
    permite_retiros: bool | None = None
    dia_corte: int | None = None
    multa_atraso: float | None = None
    activa: bool | None = None
    permite_eco_ahorro: bool | None = None
    permite_mascotas: bool | None = None
    permite_inversiones: bool | None = None
    permite_credito_educativo: bool | None = None


class CajaOut(BaseModel):
    id: int
    nombre: str
    slug: str
    comunidad: str
    tasa_interes_mensual: float
    aporte_ordinario: float
    multa_mora: float
    color_primario: str = "#1B3A6B"
    color_acento: str = "#E8A838"
    logo: str = ""
    transparencia_total: bool = False
    credito_max: float = 0.0
    encaje_factor: float = 0.0
    permite_retiros: bool = True
    dia_corte: int = 0
    multa_atraso: float = 0.0
    permite_eco_ahorro: bool = False
    permite_mascotas: bool = False
    permite_inversiones: bool = False
    permite_credito_educativo: bool = False
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
    # Ficha ampliada (todo opcional)
    fecha_nacimiento: date | None = None
    genero: str = ""
    correo: str = ""
    whatsapp: str = ""
    direccion: str = ""
    ocupacion: str = ""
    estado_civil: str = ""
    nivel_instruccion: str = ""
    num_cargas: int = 0
    contacto_emergencia: str = ""
    consentimiento_datos: bool = False


class SocioUpdate(BaseModel):
    """Edición de la ficha del socio (tesorero/superadmin)."""
    nombres: str | None = None
    telefono: str | None = None
    fecha_ingreso: date | None = None
    fecha_nacimiento: date | None = None
    genero: str | None = None
    correo: str | None = None
    whatsapp: str | None = None
    direccion: str | None = None
    ocupacion: str | None = None
    estado_civil: str | None = None
    nivel_instruccion: str | None = None
    num_cargas: int | None = None
    contacto_emergencia: str | None = None


class SocioOut(BaseModel):
    id: int
    caja_id: int
    nombres: str
    cedula: str
    telefono: str
    fecha_ingreso: date
    activo: bool
    fecha_nacimiento: date | None = None
    genero: str = ""
    correo: str = ""
    whatsapp: str = ""
    direccion: str = ""
    ocupacion: str = ""
    estado_civil: str = ""
    nivel_instruccion: str = ""
    num_cargas: int = 0
    contacto_emergencia: str = ""
    consentimiento_datos: bool = False
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
    socio_cedula: str | None = None
    monto: float
    fecha: date
    tipo: str
    nota: str
    creado_en: datetime | None = None
    anulado: bool = False

    class Config:
        from_attributes = True


class AporteUpdate(BaseModel):
    monto: float | None = Field(default=None, gt=0)
    fecha: date | None = None
    tipo: str | None = None
    nota: str | None = None


# ---------- Créditos ----------
class CreditoIn(BaseModel):
    socio_id: int
    monto: float = Field(gt=0)
    tasa_mensual: float | None = None  # si no, usa la de la caja
    plazo_meses: int = Field(gt=0, le=60)
    fecha_desembolso: date | None = None
    destino: str = ""
    garante: str = ""
    tipo: str = "ordinario"


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
    garante: str = ""
    tipo: str = "ordinario"
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
    utilidades_capitalizadas: float = 0
    creditos_activos: int
    cuotas_en_mora: int
    monto_en_mora: float


class LibretaOut(BaseModel):
    socio: SocioOut
    caja_nombre: str
    caja_tasa: float = 0
    permite_retiros: bool = True
    caja_credito_max: float = 0
    caja_encaje_factor: float = 0
    credito_techo: float = 0
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
    socio_cedula: str | None = None
    monto: float
    fecha: date
    nota: str
    creado_en: datetime | None = None
    anulado: bool = False

    class Config:
        from_attributes = True


class RetiroUpdate(BaseModel):
    monto: float | None = Field(default=None, gt=0)
    fecha: date | None = None
    nota: str | None = None


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


# ---------- Balances (dashboard interactivo del tesorero) ----------
class PuntoSerie(BaseModel):
    periodo: str            # "2025-01"
    etiqueta: str           # "ene 25"
    aportes: float = 0
    retiros: float = 0
    desembolsos: float = 0
    recuperado: float = 0   # capital + interes cobrados ese mes
    intereses: float = 0
    fondo_acumulado: float = 0


class TopSocio(BaseModel):
    socio: str
    ahorro_neto: float


class BalancesOut(BaseModel):
    dashboard: DashboardOut
    serie: list[PuntoSerie]
    composicion_fondo: dict[str, float]   # ahorros / capital_en_calle / intereses
    top_socios: list[TopSocio]


# ---------- Solicitudes de actualización de datos del socio ----------
class SolicitudOut(BaseModel):
    id: int
    socio_id: int
    socio_nombre: str
    campos: dict = {}
    estado: str
    creado_en: datetime
    resuelto_por: str = ""

    class Config:
        from_attributes = True
