# Plan de cifrado de datos en reposo · Kullki

**Estado:** propuesta para revisión — *no ejecutar en producción sin respaldo y aprobación.*
**Autor:** preparado con asistencia de Claude · **Fecha:** julio 2026
**Cierra:** pendiente §5.3 / §6.2 del documento de producto ("Cifrado de datos en reposo — PRIORITARIO").

---

## 1. Por qué

El discurso de seguridad de Kullki (aislamiento multi-tenant, hashing de contraseñas, 2FA) se sostiene sobre una base de datos cuyos **datos personales y financieros están hoy en texto plano**. Frente al escenario que motivó el sprint de seguridad —una **copia de la base** (caso VimaSistem)— ninguna de las defensas de aplicación ayuda: quien obtiene el dump lee todo.

El objetivo es que, ante un volcado de la base, **los datos sensibles sean ilegibles sin una llave que vive fuera de la base** (en variables de entorno de Railway).

Lo que este plan **sí** cubre: cédulas, contactos y documentos adjuntos ilegibles en un dump.
Lo que **no** cubre (con honestidad): si el atacante compromete el *servidor de aplicación en caliente* (con las llaves en memoria), puede descifrar. El cifrado en reposo protege el dump de la base, no un servidor totalmente tomado. Aun así, es la brecha más grave y la de mayor retorno.

---

## 2. Qué se cifra (inventario)

### 2.1 Datos que se consultan por igualdad → cifrado + *blind index*

| Modelo | Campo | Uso que obliga a buscar |
|---|---|---|
| `Usuario` | `cedula` | Login (`WHERE cedula == …`), unicidad global |
| `Socio` | `cedula` | Unicidad `(caja_id, cedula)`, alta/búsqueda |

No pueden cifrarse con IV aleatorio a secas, porque se buscan por valor exacto y son únicos. Solución: **blind index** (ver §4).

### 2.2 Datos sensibles que NO se buscan por valor → cifrado simple (Fernet)

| Modelo | Campos |
|---|---|
| `Socio` | `telefono`, `correo`, `whatsapp`, `direccion`, `fecha_nacimiento`, `contacto_emergencia`, `ocupacion` |
| `Usuario` | `totp_secret` (semilla 2FA — hoy en texto plano) |
| `SolicitudCredito` | `documento_b64` (adjuntos del socio) |

### 2.3 No se cifran (por diseño)

- `nombres` / `nombre`: se muestran en casi toda la interfaz e informes; cifrarlos rompe orden y búsqueda por nombre con poco beneficio. *Decisión a confirmar.*
- Montos, fechas y tipos: base de cálculos y reportes. El dato sensible es *a quién pertenece* (la cédula), y eso sí se cifra.
- `password_hash`, `pin_hash`: ya son hashes irreversibles.

---

## 3. Modelo de amenaza y llaves

- **Amenaza principal:** volcado/copia de la base (backup filtrado, réplica de solo-lectura comprometida, snapshot de Railway).
- **Defensa:** valores sensibles cifrados con **AES-128-GCM (Fernet)**; llaves en variables de entorno, **nunca en la base ni en el repo**.

Dos llaves independientes, distintas del `SECRET_KEY` del JWT:

| Variable de entorno | Uso | Generación |
|---|---|---|
| `KULLKI_ENC_KEY` | Cifrado Fernet de los valores | `Fernet.generate_key()` |
| `KULLKI_INDEX_KEY` | Clave HMAC del blind index | `secrets.token_hex(32)` |

---

## 4. El reto de la cédula: *blind index*

Para seguir haciendo login por cédula y mantener la unicidad **sin** guardar la cédula en claro:

1. Normalizar la cédula (quitar guiones/espacios, `strip`).
2. `bidx = HMAC-SHA256(KULLKI_INDEX_KEY, cedula_normalizada)` → hex determinista.
3. Guardar `cedula_bidx` (indexado y único → búsquedas y unicidad) y `cedula_enc` (cédula real cifrada, IV aleatorio → se descifra para mostrar).
4. La columna `cedula` en texto plano se **vacía** al final (fase *contract*).

Login pasa de `WHERE cedula == data.cedula` a `WHERE cedula_bidx == blind_index(data.cedula)`.

> El HMAC es determinista (permite igualdad/unicidad) pero **no reversible** sin `KULLKI_INDEX_KEY`. En el dump se ven hashes, no cédulas.

---

## 5. Arquitectura de código

- **`backend/app/crypto.py`** — `encrypt()`, `decrypt()`, `blind_index()`, `normaliza_cedula()`, y `EncryptedStr` (SQLAlchemy `TypeDecorator`) para cifrar/descifrar transparente.
- **Columnas nuevas** en `models.py` (fase *expand*): `cedula_enc`, `cedula_bidx` y `_enc` para §2.2, **sin borrar** las de texto plano.
- **`backend/scripts/migrar_cifrado.py`** — migración idempotente, por lotes, con `--dry-run` y verificación.

---

## 6. Migración en 3 fases (expand → migrate → contract)

**Fase 0 — Respaldo.** Backup completo y **prueba de restauración**. Sin esto no se avanza.

**Fase 1 — Expand.** Deploy que añade columnas nuevas (vacías) y empieza a **escribir en ambos** lados (plano + cifrado), pero sigue **leyendo de texto plano**. Reversible revirtiendo el deploy.

**Fase 2 — Migrate (backfill).** `migrar_cifrado.py` (primero `--dry-run`) rellena `*_enc` y `cedula_bidx` por lotes, verificando fila a fila (descifrar == original). Reejecutable.

**Fase 3 — Contract.** Con el 100 % verificado: cambiar lecturas a columnas cifradas / blind index, aplicar `UNIQUE` sobre `cedula_bidx`, y **vaciar** las columnas de texto plano.

Cada fase es un deploy independiente y reversible.

---

## 7. Rotación de llaves

- **Índice (`KULLKI_INDEX_KEY`):** rotarla recalcula todos los `*_bidx` (modo `--reindex`, en mantenimiento).
- **Cifrado (`KULLKI_ENC_KEY`):** usar *MultiFernet* (cifra con la nueva, descifra con cualquiera); re-cifrado en background sin downtime.

---

## 8. Pruebas (antes de producción)

- Unitarias de `crypto.py`: `decrypt(encrypt(x)) == x`; `blind_index` determinista; vacíos/nulos.
- Integración: login por blind index; alta de socio respeta unicidad vía bidx; informe muestra cédula descifrada.
- Migración sobre copia real: `--dry-run` + verificación 100 % + prueba de **rollback**.
- Sumar a la suite `pytest` (hoy 30/30) antes de desplegar.

---

## 9. Impacto y costos

- **Rendimiento:** cifrar/descifrar por fila es µs; login añade un HMAC (despreciable). El backfill corre una sola vez.
- **Tamaño:** campos cifrados ~1.5–2× (Base64). Marginal.
- **Operacional:** dependencia dura de `KULLKI_ENC_KEY`. **Si se pierde la llave, los datos cifrados son irrecuperables** → respaldar la llave en gestor de secretos y la base antes de la fase contract.

---

## 10. Checklist de ejecución

- [ ] Generar `KULLKI_ENC_KEY` y `KULLKI_INDEX_KEY`; guardarlas en Railway + gestor de secretos.
- [ ] Backup completo + prueba de restauración.
- [ ] Deploy Fase 1 (expand + doble escritura). Verificar altas nuevas.
- [ ] `migrar_cifrado.py --dry-run` → revisar conteos.
- [ ] `migrar_cifrado.py` (backfill) → verificación 100 %.
- [ ] Deploy Fase 3 (lecturas cifradas + unique en bidx). Probar login e informes.
- [ ] Vaciar columnas de texto plano. Backup posterior.
- [ ] Confirmar en un dump de prueba que las cédulas ya no aparecen en claro.

---

### Anexo · Decisiones a confirmar

1. ¿Ciframos también `nombres`? (rompe orden/búsqueda; recomendación: **no** por ahora).
2. ¿`documento_b64` entra en esta ola o en una posterior?
3. Ventana de baja actividad para el backfill.

---

## Anexo B · Ejecución realizada (big-bang, datos ficticios)

Como los datos actuales son de *seed* (desechables), se ejecutó la variante **big-bang** en lugar de las 3 fases:

- Modelos cableados con `EncryptedStr` + `cedula_bidx` (listeners que calculan el blind index).
- **Cifrados:** cédula (Usuario/Socio) + blind index, nombre/nombres, teléfono, correo, WhatsApp, dirección, contacto de emergencia, `totp_secret`, `documento_b64`, y las copias de nombre en auditoría/solicitudes/cierre.
- **NO cifrados a propósito** (para investigación/estadística seudonimizada): género, ocupación, nivel de instrucción, cargas, destino del crédito, montos y fechas.
- Búsquedas por cédula migradas a `cedula_bidx == blind_index(...)`; orden alfabético por nombre movido a Python (el nombre ahora es ciphertext).

### Pasos de despliegue en Railway
1. Definir en variables de entorno: `KULLKI_ENC_KEY` (`Fernet.generate_key()`) y `KULLKI_INDEX_KEY` (`secrets.token_hex(32)`). **Guardar copia en gestor de secretos** — sin `KULLKI_ENC_KEY` los datos cifrados son irrecuperables.
2. `RESET_SCHEMA=1` para este despliegue (recrea el esquema con las columnas nuevas y re-siembra datos ficticios ya cifrados). Volver a `RESET_SCHEMA=0` después.
3. Verificar: login por cédula, informe de asamblea y, en un dump, que cédula/nombre salen cifrados.
