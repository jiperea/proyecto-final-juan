# Feature Specification: Seed de desarrollo con blob de evidencia real

**Feature Branch**: `026-seed-evidence-blob`

**Created**: 2026-07-17

**Status**: Draft

**Input**: User description: "Seed de desarrollo con blob de evidencia real (habilitador dev, backend/tooling). Hoy el seed crea la fila OrderEvidence de la orden ancla con un object_ref de relleno pero NO escribe ningún blob → getOrderEvidence devuelve 410 y la evidencia sembrada no se ve en el visor (025). Que el seed almacene un blob real vía el mismo StoragePort cifrado que la subida, de modo que getOrderEvidence responda 200; que siembre contra la MISMA BD y el MISMO almacén que sirve el backend navegado en dev (hoy `make seed` apunta a db-test/fieldops_test, no a db/fieldops); clave de cifrado del entorno como el backend; guard NODE_ENV=production; bytes de imagen mínimos embebidos; invariante 024 object_ref↔fila. No cambia contrato/dominio/autz/prod. Corregir el bug de make seed que puebla la BD equivocada."

## Contexto

La feature **025** (visor lightbox+carrusel) puede abrir la evidencia, pero la evidencia **sembrada** no se ve: `backend/prisma/seed.ts` crea la fila `OrderEvidence` de la orden ancla (`approvableReview`) con un `object_ref` de relleno y **no escribe ningún blob**, así que `getOrderEvidence` responde **410** («Esta imagen ya no está disponible») para técnico y supervisor. Además, el análisis de 025 destapó un problema **preexistente** de tooling: `make seed` (vía `scripts/dcnode.sh`) siembra en la BD de **test** (`db-test`/`fieldops_test`), mientras que el backend que se **navega** en dev (`make dev`, docker-compose[.override]) usa `db`/`fieldops` y lee el almacén de evidencia en `EVIDENCE_STORAGE_DIR` (`./data/evidence`, montado desde `./backend` en el host). Esta feature es un **habilitador de desarrollo (backend + tooling)**: hace que el seed escriba un **blob de imagen real** —por el mismo puerto de almacenamiento cifrado que la subida real (024)— en la **BD y el almacén que ve el navegador**, para que la evidencia sembrada se sirva con **200**. **No cambia el contrato OpenAPI, ni la lógica de negocio, ni la autorización, ni el comportamiento en producción**: solo datos y tooling de desarrollo.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ver la evidencia sembrada en el visor tras sembrar en dev (Priority: P1)

Como desarrollador (o revisor de una demo) que ha sembrado la BD de desarrollo, al abrir el detalle de la orden ancla y pulsar su evidencia quiero **ver la imagen** (no un «ya no está disponible»), para comprobar el visor de 025 sin tener que subir una foto a mano en cada entorno.

**Why this priority**: Es el valor central: desbloquea ver el visor funcionando con datos sembrados, para técnico (dueño) y supervisor. MVP.

**Independent Test**: Tras re-sembrar la BD de desarrollo **navegada** y solicitar el binario de la evidencia ancla (por el mismo camino autorizado que usa el visor), se obtiene **200** con la imagen (no 410).

**Acceptance Scenarios**:

1. **Given** una BD de desarrollo recién sembrada, **When** el seed crea la fila `OrderEvidence` de la orden ancla, **Then** también almacena, a través del **mismo `StoragePort`/adaptador cifrado** (fs+crypto AES-256-GCM) que usa la subida real, un blob de imagen cuyo `object_ref` coincide **exactamente** con el de la fila.
2. **Given** esa evidencia sembrada, **When** el usuario autorizado (técnico dueño o supervisor) la solicita por el flujo normal, **Then** `getOrderEvidence` responde **200** con el binario (no 410), descifrándolo con la misma clave que el backend.
3. **Given** el seed, **When** se ejecuta, **Then** no cambia el contrato, la lógica de negocio ni la autorización: solo añade el blob correspondiente a datos de desarrollo.

---

### User Story 2 - `make seed` puebla la base de datos y el almacén que se navegan (Priority: P1)

Como desarrollador que ejecuta `make seed`/`make up`, quiero que la siembra vaya a la **misma base de datos y almacén de evidencia** que sirve el backend que abro en el navegador, para que los datos sembrados (incluida la evidencia con blob) aparezcan realmente en la app.

**Why this priority**: Sin esto, US1 no llega al navegador: el blob se escribiría en un entorno que nadie mira. Corrige la fricción histórica «requiere login del seed» (los datos sembrados no estaban en la BD navegada). Co-P1 con US1.

**Independent Test**: Ejecutar el comando de siembra de desarrollo documentado y comprobar que los usuarios/órdenes/evidencia sembrados son visibles en el backend navegado (`make dev`), no solo en la BD de test.

**Acceptance Scenarios**:

1. **Given** el entorno de desarrollo navegado (backend contra `db`/`fieldops`, almacén `EVIDENCE_STORAGE_DIR` montado en el host), **When** el desarrollador ejecuta el comando de siembra de desarrollo, **Then** la BD y el almacén poblados son los que ese backend lee (no `db-test`/`fieldops_test`).
2. **Given** la corrección de tooling, **When** un desarrollador sigue el flujo documentado (`make …`), **Then** puede iniciar sesión y ver órdenes **y** evidencia sembrada sin pasos manuales adicionales (sin exportar variables a mano).
3. **Given** el pipeline de tests, **When** corre la suite, **Then** sigue usando su BD de test independiente (`fieldops_test`) sin verse afectado por el cambio de destino de la siembra de desarrollo.

---

### User Story 3 - Salvaguardas del seed (clave y entorno) (Priority: P2)

Como responsable de la seguridad operativa, quiero que el seed obtenga la clave de cifrado del entorno de forma validada y **se niegue a ejecutarse en producción**, para que un blob cifrado con la clave real y usuarios de contraseña conocida no acaben en un entorno real.

**Why this priority**: Seguridad; el seed ahora escribe un blob cifrado con la clave real, elevando el coste de una ejecución accidental fuera de dev.

**Independent Test**: Ejecutar el seed con `NODE_ENV=production` o sin `EVIDENCE_ENC_KEY` válida y comprobar que aborta **sin escribir nada** y con mensaje accionable.

**Acceptance Scenarios**:

1. **Given** el seed, **When** obtiene la clave de cifrado, **Then** la lee de la variable de entorno `EVIDENCE_ENC_KEY` validando **solo ese campo** con la misma regla que la app (presente y ≥32 caracteres), **sin** clave embebida en el código y **sin** cargar la configuración completa de la app.
2. **Given** `EVIDENCE_ENC_KEY` ausente o inválida, **When** se ejecuta el seed, **Then** aborta con salida ≠0 y un mensaje accionable (no un stack trace de fs/Prisma), sin escribir fila ni blob.
3. **Given** `NODE_ENV=production`, **When** se ejecuta el seed, **Then** aborta **antes de escribir nada** (ni fila ni blob) con un mensaje accionable, protegiendo una BD `pre`/`prod` recién provisionada (vacía) que el invariante «rechaza BD poblada» no cubre.

---

### Edge Cases

- **Re-siembra**: el seed rechaza una BD ya poblada (`ensureSeedableOrThrow`, tablas append-only), así que la re-siembra parte de un reset; el blob se escribe una vez por `object_ref` (invariante 024 «un `object_ref` ↔ una fila»), sin blobs huérfanos.
- **Almacén ausente/no escribible**: si el directorio de almacenamiento no existe o no es escribible, el seed falla con un mensaje accionable (no deja la fila sin blob silenciosamente).
- **Blob ya presente**: sobre una BD reseteada no debería existir; si existiera el fichero, el seed no debe duplicar `object_ref` ni corromper el almacén.
- **Entornos sin la clave** (CI que solo migra, no siembra dev): no aplica; el guard de clave solo actúa en la ruta de siembra.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: WHEN el seed de desarrollo crea la fila `OrderEvidence` de la orden ancla THE seed SHALL almacenar un blob de imagen a través del **mismo `StoragePort`/adaptador cifrado** (fs+crypto AES-256-GCM) que usa `uploadOrderEvidence`, con `object_ref` idéntico al de la fila, de modo que `getOrderEvidence` responda **200** (no 410) para esa evidencia.
- **FR-002**: THE seed SHALL usar como contenido **bytes de imagen mínimos embebidos como constante** en el propio seed (sin añadir ficheros de asset al repo); no es PII real.
- **FR-003**: THE seed SHALL leer `EVIDENCE_ENC_KEY` del entorno y validar **solo ese campo** con la misma regla que la app (presente, ≥32 caracteres), **sin** clave embebida y **sin** invocar la carga de configuración completa de la app; WHEN falte o sea inválida THE seed SHALL abortar (salida ≠0) con mensaje accionable, sin escribir fila ni blob.
- **FR-004**: WHEN el seed se ejecuta con `NODE_ENV=production` THE seed SHALL abortar **antes de escribir nada** (fila o blob) con salida ≠0 y mensaje accionable.
- **FR-005**: THE seed SHALL escribir el blob en el **mismo directorio de almacenamiento** (`EVIDENCE_STORAGE_DIR`, con su valor por defecto de la app) que lee el backend navegado, de modo que el proceso que sirve la evidencia encuentre el fichero.
- **FR-006**: THE tooling de siembra de desarrollo (`scripts/dcnode.sh` en su ruta de seed y/o los targets `seed`/`up` del `Makefile`) SHALL poblar la **base de datos que usa el backend navegado en dev** (`db`/`fieldops`), no la de test (`db-test`/`fieldops_test`), e inyectar `EVIDENCE_ENC_KEY` con el mismo valor que ese backend (sin filtrarla en logs). La suite de tests SHALL seguir usando su BD de test independiente.
- **FR-007**: THE seed SHALL mantener el invariante de 024 «un `object_ref` ↔ una fila» y no introducir blobs huérfanos; la re-siembra parte de un reset (rechaza BD poblada).
- **FR-008**: THE feature SHALL NOT modificar el contrato OpenAPI, la lógica de negocio de dominio, la autorización/RBAC ni el comportamiento en producción; su alcance es datos y tooling de desarrollo. `getOrderEvidence`/`uploadOrderEvidence` no cambian su código.
- **FR-009**: WHEN el directorio de almacenamiento no existe o no es escribible THE seed SHALL fallar con un mensaje accionable en vez de dejar la fila sin blob de forma silenciosa.

### Key Entities *(include if feature involves data)*

- **Blob de evidencia sembrado (dev)**: contenido binario de imagen asociado 1:1 a la fila `OrderEvidence` de la orden ancla por su `object_ref`; producido por el seed usando el adaptador de almacenamiento existente y la clave de cifrado del entorno. No introduce entidades ni columnas nuevas; reutiliza `OrderEvidence` y el almacén de 024.

## Contrato (OpenAPI)

**No hay endpoints nuevos ni cambios de contrato.** La feature reutiliza `getOrderEvidence`/`uploadOrderEvidence` y el `StoragePort` de 024 **sin modificar su código**; solo escribe datos de desarrollo (una fila ya existente + su blob) y ajusta la tooling de siembra. No toca `contracts/`.

## Trazabilidad (RF → endpoint → tarea → test)

| FR | Endpoint(s) | Tarea(s) | Test(s) |
|----|-------------|----------|---------|
| FR-001 | (reutiliza) getOrderEvidence | (pend. tasks) | `should servir 200 el blob sembrado de la orden ancla (descifrable)` |
| FR-002 | — | (pend. tasks) | `should usar bytes embebidos (sin ficheros de asset nuevos)` |
| FR-003 | — | (pend. tasks) | `should abortar (exit!=0, mensaje accionable) si falta/!inválida EVIDENCE_ENC_KEY` |
| FR-004 | — | (pend. tasks) | `should abortar con NODE_ENV=production sin escribir nada` |
| FR-005 | getOrderEvidence | (pend. tasks) | `should escribir el blob en EVIDENCE_STORAGE_DIR del backend navegado` |
| FR-006 | — | (pend. tasks) | `make seed puebla fieldops (no fieldops_test); tests usan su BD de test` |
| FR-007 | — | (pend. tasks) | `should no duplicar object_ref ni dejar blobs huérfanos (reset)` |
| FR-008 | — | (pend. tasks) | `arch: 0 cambios en contracts/dominio/RBAC/handlers de evidencia` |
| FR-009 | — | (pend. tasks) | `should fallar accionable si el almacén no es escribible` |

> Se mantiene en `docs/traceability.md` al implementar.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Tras re-sembrar la BD de desarrollo navegada, la evidencia de la orden ancla se sirve con **200** (no 410) al solicitarla, en el **100 %** de las ejecuciones del seed, para técnico dueño y supervisor.
- **SC-002**: El seed aborta con **salida ≠0** y mensaje accionable, **sin escribir fila ni blob**, en el 100 % de los casos con `NODE_ENV=production` o `EVIDENCE_ENC_KEY` ausente/inválida.
- **SC-003**: Un desarrollador que sigue el flujo documentado (`make …`) ve la evidencia sembrada en el navegador **sin pasos manuales** (0 exportaciones de variables a mano, 0 subidas de foto).
- **SC-004**: **0 cambios** en `contracts/`, en la lógica de dominio, en RBAC y en el código de los handlers `getOrderEvidence`/`uploadOrderEvidence` (verificado por diff/arch-test).
- **SC-005**: La suite de tests sigue **verde** con su BD de test independiente, sin regresiones por el cambio de destino de la siembra de desarrollo.

> SC medibles (Constitution XIV): SC-002/SC-004/SC-005 con herramientas deterministas (exit code, diff/arch-test, suite); SC-001/SC-003 por verificación del flujo real (idealmente Playwright autenticado con el seed corregido).

## Assumptions

- El almacén de dev es el adaptador fs+crypto existente (024); no se introduce un almacén nuevo ni un S3 real.
- El backend navegado en dev usa `db`/`fieldops` y `EVIDENCE_STORAGE_DIR` montado desde el host (`docker-compose.override.yml`); la tooling de siembra debe apuntar ahí. La BD de test (`fieldops_test`) sigue siendo independiente para la suite (Constitution VII).
- La clave `EVIDENCE_ENC_KEY` de dev vive en `backend/.env` (gitignored); la tooling la inyecta sin registrarla en logs.
- Solo se siembra evidencia con blob para la **orden ancla** (una evidencia), coherente con el seed actual; no se siembran múltiples evidencias.
- Ámbito acotado (Principio XV): no se añade una UI de gestión de seed, ni almacenamiento S3, ni fixtures de imagen variados; una sola imagen mínima embebida.
