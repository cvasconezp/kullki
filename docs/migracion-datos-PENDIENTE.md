# Migración de datos de clientes (Excel/CSV → Kullki) — PENDIENTE

> Tarea futura. Pensar y resolver con Carlos. Documento de diseño inicial.

## Objetivo
Cuando una caja llega con su historial en Excel (socios, aportes, créditos, pagos),
poder **subir el archivo y cargarlo a la base de Kullki** con la mínima fricción,
usando IA para entender, limpiar y mapear datos heterogéneos (cada caja tiene su
propio formato, columnas en español informal, fechas mixtas, montos con comas, etc.).

## Flujo propuesto (asistente de importación)
1. **Subida**: el superadmin/tesorero sube uno o varios archivos (.xlsx, .xls, .csv) por entidad.
2. **Lectura**: el backend parsea hojas y detecta tablas (encabezados, rangos, hojas múltiples).
3. **Comprensión con IA**: un modelo recibe los encabezados + una muestra de filas y propone:
   - tipo de entidad (socios / aportes / créditos / cuotas / retiros),
   - **mapeo de columnas** del archivo → campos de Kullki,
   - reglas de limpieza (formato de cédula, teléfono, fechas, montos, género).
4. **Vista previa y confirmación**: se muestra al usuario el mapeo propuesto y una
   tabla previa ya normalizada; el usuario corrige el mapeo si hace falta.
5. **Validación**: cédulas válidas, duplicados, montos > 0, fechas coherentes,
   socios referenciados existen, cuadre de saldos. Se marcan filas con error.
6. **Carga transaccional**: se insertan solo las filas válidas (dry-run primero),
   con un **lote de importación** identificable para poder revertir.
7. **Reporte**: resumen de cargados / omitidos / errores, descargable.

## Modelo de datos sugerido
- Tabla `importacion` (lote): id, caja_id, usuario, fecha, tipo, estado, resumen.
- Campo `import_lote_id` opcional en socios/aportes/creditos para trazabilidad y rollback.

## Arquitectura técnica
- **Parsing**: `openpyxl`/`pandas` en el backend (o SheetJS en el front para vista previa).
- **IA de mapeo**: llamada a un LLM con los encabezados + N filas de muestra y un
  *function schema* que devuelve `{entidad, mapeo, reglas, confianza}`. Sin enviar
  datos sensibles innecesarios; idealmente solo muestra/anonimizada para el mapeo,
  y la limpieza masiva se hace por reglas deterministas derivadas del mapeo.
- **Endpoints**: `POST /import/analizar` (archivo→propuesta), `POST /import/preview`
  (mapeo→filas normalizadas+errores), `POST /import/confirmar` (carga), `POST /import/{lote}/revertir`.
- **Seguridad**: solo superadmin/tesorero de la caja; límite de tamaño; antivirus/validación de tipo.

## Reglas de limpieza típicas (Ecuador)
- Cédula: 10 dígitos, quitar espacios/guiones; validar dígito verificador.
- Teléfono/WhatsApp: normalizar a 09######## o +593.
- Fechas: aceptar dd/mm/aaaa, aaaa-mm-dd, Excel serial; salida ISO.
- Montos: quitar separadores de miles, coma decimal → punto.
- Género/estado civil/instrucción: normalizar a los catálogos de Kullki.

## MVP para mañana (orden sugerido)
1. Importador de **socios** por CSV con mapeo manual + validación (sin IA todavía).
2. Añadir **detección/mapeo con IA** sobre ese flujo.
3. Extender a **aportes** y **créditos** (con saldos de apertura).
4. Lote + rollback + reporte.

## Riesgos / decisiones a tomar
- ¿La IA ve datos reales o solo muestra anonimizada? (privacidad).
- Manejo de **saldos de apertura** (no recalcular историю; cargar saldo inicial).
- Conciliación de cuotas ya pagadas vs. tabla de amortización regenerada.
- Qué hacer con socios duplicados entre cajas (ya soportado por cédula única).
