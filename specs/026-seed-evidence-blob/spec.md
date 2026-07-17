# Feature Specification: Seed de desarrollo con blob de evidencia real

**Feature Branch**: `026-seed-evidence-blob`

**Created**: 2026-07-17

**Status**: Draft

**Input**: User description: "Seed de desarrollo con blob de evidencia real (habilitador dev, backend/tooling). Hoy el seed crea la fila OrderEvidence de la orden ancla con un object_ref de relleno pero NO escribe ningún blob → getOrderEvidence devuelve 410 y la evidencia sembrada no se ve en el visor (025). Que el seed almacene un blob real vía el mismo StoragePort cifrado que la subida, de modo que getOrderEvidence responda 200; que siembre contra la MISMA BD y el MISMO almacén que sirve el backend navegado en dev (hoy `make seed` apunta a db-test/fieldops_test, no a db/fieldops); clave de cifrado del entorno como el backend; guard NODE_ENV=production; bytes de imagen mínimos embebidos; invariante 024 object_ref↔fila. No cambia contrato/dominio/autz/prod. Corregir el bug de make seed que puebla la BD equivocada."

## Contexto

La feature **025** (visor lightbox+carrusel) puede abrir la evidencia, pero la evidencia **sembrada** no se ve: `backend/prisma/seed.ts` crea la fila `OrderEvidence` de la orden ancla (`approvableReview`) con un `object_ref` de relleno y **no escribe ningún blob**, así que `getOrderEvidence` responde **410** («Esta imagen ya no está disponible») para técnico y supervisor. Además, el análisis de 025 destapó un problema **preexistente** de tooling: `make seed` (vía `scripts/dcnode.sh`) siembra en la BD de **test** (`db-test`/`fieldops_test`), mientras que el backend que se **navega** en dev (`make dev`, docker-compose[.override]) usa `db`/`fieldops` y lee el almacén de evidencia en `EVIDENCE_STORAGE_DIR` (`./data/evidence`, montado desde `./backend` en el host). Esta feature es un **habilitador de desarrollo (backend + tooling)**: hace que el seed escriba un **blob de imagen real** —por el mismo puerto de almacenamiento cifrado que la subida real (024)— en la **BD y el almacén que ve el navegador**, para que la evidencia sembrada se sirva con **200**. **No cambia el contrato OpenAPI, ni la lógica de negocio, ni la autorización, ni el comportamiento en producción**: solo datos y tooling de desarrollo.

## Clarifications

### Session 2026-07-17

- Q: ¿Cómo alinear la tooling de siembra, dado que hoy `make seed`/`make up` siembran la BD de test (fieldops_test) y no la navegada (fieldops)? → A: **Re-apuntar `make seed`/`make up` a la BD/almacén de desarrollo navegados (`db`/`fieldops`)**. La suite de tests sigue usando su BD de test independiente por su propia ruta (no depende de `make seed`); el plan verificará que nada dependa de `make seed`→test antes de re-apuntar.

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

- **Re-siembra**: el seed rechaza una BD ya poblada (`ensureSeedableOrThrow`); la re-siembra parte de un reset que limpia BD **y** `EVIDENCE_STORAGE_DIR` (FR-011); el blob se escribe una vez por `object_ref`, sin huérfanos (FR-007/FR-010).
- **Almacén ausente/no escribible**: si el directorio no existe o no es escribible, el seed falla con mensaje accionable (FR-009), no deja la fila sin blob.
- **Interrupción a mitad**: como el blob se escribe **antes** que la fila (FR-010), una interrupción deja como mucho un blob sin fila (limpiado por el reset de FR-011), nunca una fila apuntando a un blob ausente (que recrearía el 410).
- **Orden ancla cerrada tras demo de 019**: la evidencia sembrada vive en la orden ancla `approvableReview`, que el flujo de **019** aprueba → `closed`. Por diseño de 024 («closed no se sirve nunca»), a partir de ahí `getOrderEvidence` responde **404** (no 200 ni 410). Es comportamiento **correcto**, no un bug de 025/026; se restaura re-sembrando. SC-001 aplica **inmediatamente tras sembrar**, antes de aprobar la orden.
- **Segundo `make up` / BD ya sembrada / almacén borrado por fuera**: el seed hace fail-fast con `RESEED_HINT` (comportamiento existente, FR-011); la recuperación es **`make reset`** (limpia BD + almacén y re-siembra), no un skip silencioso.
- **`docker compose down -v`**: vacía el volumen de Postgres pero **no** el bind-mount de `EVIDENCE_STORAGE_DIR`; NO es un reset completo. Tras `down -v` + `make up`, `putStaged` escribe un blob **nuevo** (ref no determinista, FR-007) y la fila lo referencia — la evidencia se ve, pero el blob viejo queda **huérfano** hasta el siguiente `make reset` (que limpia el almacén). Para un almacén limpio se usa **`make reset`**, no `down -v`.
- **GC de staging (FR-014)**: la evidencia sembrada debe quedar como **ciclo vigente** (audit `reason:'execution_registered'`); si no, `gc-job.ts` (que corre al arrancar el backend) la trataría como superada y **purgaría el blob** → 410 al reiniciar. FR-014 lo asegura.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: WHEN el seed de desarrollo crea la fila `OrderEvidence` de la orden ancla THE seed SHALL almacenar un blob de imagen a través del **mismo `StoragePort`/adaptador cifrado** (fs+crypto AES-256-GCM) que usa `uploadOrderEvidence`, con `object_ref` idéntico al de la fila, de modo que `getOrderEvidence` responda **200** (no 410) para esa evidencia.
- **FR-002**: THE seed SHALL usar como contenido una **imagen JPEG válida mínima** (magic bytes JPEG coherentes con el `content_type` `image/jpeg` de la fila, que 024 detecta por magic-byte; **≤ 2048 bytes**) embebida como **constante** en el propio seed (sin añadir ficheros de asset al repo); no es PII real.
- **FR-003**: THE seed SHALL leer `EVIDENCE_ENC_KEY` del entorno y validarla con la **misma función de validación compartida** que la app (ver FR-013), **sin** clave embebida y **sin** invocar la carga de configuración completa (13 campos); WHEN falte o sea inválida THE seed SHALL abortar con **salida ≠0** y un mensaje que **nombra `EVIDENCE_ENC_KEY` e indica la acción correctiva** (definirla con ≥32 caracteres en `backend/.env`), sin escribir fila ni blob.
- **FR-004** (guard dev-local, **positivo**): WHEN el seed se ejecuta THE seed SHALL abortar **antes de escribir nada** (fila o blob), con salida ≠0 y mensaje accionable, **salvo** que confirme un destino de **desarrollo local**: (a) `NODE_ENV` **distinto de `production`** (`pre` y `prod` usan `NODE_ENV=production`, `docs/16-devops-setup-manual.md:45`) **Y** (b) el **hostname de `DATABASE_URL`** —parseado con `new URL(...).hostname` y comparado por **igualdad exacta** (no subcadena)— sea uno de `{db, localhost, 127.0.0.1}`, **rechazando** cualquier otro (p. ej. `mydb.neon.tech`). Deben cumplirse **ambas**. El mensaje de abort SHALL **nombrar la causa** (`NODE_ENV=production` o el hostname rechazado) e imprimir **solo el hostname**, **nunca la `DATABASE_URL` completa** (que lleva credenciales) ni el password.
- **FR-005**: THE seed SHALL escribir el blob bajo `EVIDENCE_STORAGE_DIR`; al correr en el **contexto del servicio backend** (FR-006) hereda el **mismo valor y el mismo volumen físico** que el backend navegado, de modo que el proceso que sirve la evidencia encuentra el fichero.
- **FR-006** (seed en el contexto del backend): THE tooling de siembra de desarrollo (`seed`/`up` del `Makefile`) SHALL ejecutar el seed **en el contexto del servicio `backend` de docker-compose** con la config de dev (`docker compose run --rm backend …`, override fusionado), de modo que herede por construcción su `env_file` (la **misma `EVIDENCE_ENC_KEY`**), su `DATABASE_URL` (`db`/`fieldops`, la **BD navegada**) y su **volumen** de `EVIDENCE_STORAGE_DIR` — **no** el contenedor `node` efímero de `scripts/dcnode.sh` (que apunta a `db-test`/`fieldops_test`). `make seed` ejecuta **ese mismo script de seed** (guard de FR-004 + escritura de fila **y blob**); `make up` hace levantar servicios + `prisma migrate deploy` + **ese mismo seed** (sin el reset destructivo). Los tres flujos (`make up`, `make seed`, `make reset`) invocan el **mismo seed atómico con blob** de FR-001/FR-010, de modo que SC-001/SC-003 se cumplen también por `make up`. Sobre BD ya poblada, el fail-fast de `ensureSeedableOrThrow` (RESEED_HINT → `make reset`) aplica igual. La clave **nunca** se pasa por argv ni se imprime; se hereda vía `env_file`. La suite de tests y CI mantienen su ruta propia (`npm run seed` con su BD de test), **no afectadas**.
- **FR-007**: THE seed SHALL usar en la fila `OrderEvidence` **el `object_ref` que devuelve `StoragePort.putStaged(...)`** (en lugar del placeholder literal actual). **Nota verificada**: `putStaged` **no** es content-addressed —`ObjectRef` codifica `(ownerId, orderId, createdAt, nonce-aleatorio)` (`fs-storage-adapter.ts`)— por lo que el ref **no es determinista** entre ejecuciones; NO se depende de re-generar el mismo ref (ni se modifica el adaptador de 024). La no-acumulación de huérfanos se garantiza porque la re-siembra pasa por **`make reset`, que limpia el almacén Y la BD juntos** (FR-011): tras un reset no quedan blobs previos. (Pueden dejar un blob huérfano dos vías, ambas limpiadas por el siguiente `make reset`: (i) un **fallo/crash a mitad del seed** —el blob se escribe antes que la fila, FR-010—, y (ii) `docker compose down -v` + `make up` —vacía la BD pero no el bind-mount—. Ninguna es un estado inconsistente servido: nunca hay una fila apuntando a un blob ausente.) Mantiene el invariante de 024 «un `object_ref` ↔ una fila».
- **FR-014** (evidencia sembrada = ciclo vigente, para que el GC no la purgue): THE `OrderAudit` que el seed crea para la evidencia ancla SHALL usar `reason: 'execution_registered'` (no `null`), de modo que el filtro de ciclo vigente del GC de staging (`gc-job.ts::latestSubmitAuditId`, `toStatus:'pending_review' AND reason:'execution_registered'`) lo reconozca como **vigente** y **NO purgue** el blob sembrado (que hoy, con `reason:null`, sería tratado como superado y purgado al arrancar el backend). El cambio es de **datos del seed** (no toca `gc-job.ts` ni dominio) y SHALL no regresionar los flujos de 019/006 que usan esa orden ancla (a verificar en tests).
- **FR-008**: THE feature SHALL NOT modificar el contrato OpenAPI, la lógica de negocio de dominio, la autorización/RBAC ni el comportamiento en producción; su alcance es datos y tooling de desarrollo. `getOrderEvidence`/`uploadOrderEvidence` no cambian su código.
- **FR-009**: WHEN el directorio de almacenamiento no existe o no es escribible THE seed SHALL fallar con un mensaje accionable que **nombra la ruta** (`EVIDENCE_STORAGE_DIR`) en vez de dejar la fila sin blob de forma silenciosa.
- **FR-010** (atomicidad): THE seed SHALL escribir el **blob antes** de insertar la fila `OrderEvidence`, y realizar sus escrituras de BD dentro de **una transacción** que solo confirma si todo tiene éxito; ante una interrupción/fallo, la transacción **revierte** dejando la BD **vacía** (no un estado parcial poblado); un blob que llegara a escribirse antes del fallo queda **huérfano hasta el siguiente `make reset`** (que limpia el almacén, FR-007/FR-011), **nunca** una fila apuntando a un blob ausente. Así **«BD poblada ⟺ seed completo»**: nunca queda una fila sin blob ni un estado parcial que un `make up` posterior confunda con completo.
- **FR-011** (modelo **reset-y-siembra**, sin ruta incremental): THE siembra de desarrollo SHALL ser siempre **desde cero** mediante un target **`make reset`** que ejecuta toda su secuencia **dentro de UNA única invocación del contenedor del servicio backend con la configuración de DEV** (`docker compose run --rm backend <script>` desde la raíz del repo, dejando que Compose **fusione `docker-compose.override.yml`** — que fija `NODE_ENV=development` y el `DATABASE_URL`/volumen navegados; **sin** `-f docker-compose.yml` solo, que daría el `NODE_ENV=production` del base y el guard bloquearía). El guard del paso (0) lee ese `NODE_ENV`/`DATABASE_URL` **efectivos del contenedor** (misma fuente que el reset). Así el guard, el reset, el borrado y la siembra comparten **por construcción** el mismo `env_file`, el mismo **volumen** de `EVIDENCE_STORAGE_DIR` y el mismo **UID** (el que escribe los blobs es el que los borra). `make reset` **no orquesta el ciclo de vida de servicios** (no para/arranca contenedores ni necesita acceso al Docker socket). Si el backend de dev está en caliente durante `prisma migrate reset`, se **espera** que el pool de Prisma reconecte al siguiente query (a **verificar en `quickstart.md`**, no asumido como hecho); si no reconectara, el fallback documentado es reiniciar el contenedor backend (`docker compose restart backend`) — aceptable para tooling de dev. Una petición del navegador en vuelo durante el reset puede recibir un error transitorio; recargar resuelve. Dentro de la invocación, **en este orden**: (0) **guard dev-local de FR-004 como preflight** (NODE_ENV≠`production` **Y** hostname del `DATABASE_URL` **efectivo del contenedor** ∈ `{db,localhost,127.0.0.1}`) que **aborta antes de invocar nada destructivo** (salida ≠0, mensaje accionable) — el `prisma migrate reset` **nunca** se invoca si el guard falla; (a) `prisma migrate reset --force --skip-seed`; (b) **vacía el CONTENIDO** de `EVIDENCE_STORAGE_DIR` y **garantiza que el directorio existe y es escribible al terminar** (`mkdir -p` + borrar contenido, **no** borrar el directorio), **idempotente** (si no existe, lo crea; no falla por ausencia; falla solo ante error real de IO/permisos, con mensaje accionable que **nombra la ruta**, como FR-009); (c) re-siembra. Como todo corre en el contenedor backend, el borrado (b) usa el **mismo UID** que escribió los blobs, por lo que el mismatch de permisos host↔contenedor **no puede ocurrir** (no se necesita lógica para distinguirlo). WHEN el seed se ejecuta sobre una BD **no vacía** THE seed SHALL fail-fast con el mecanismo **existente `ensureSeedableOrThrow`** (salida ≠0 + `RESEED_HINT`), **sin cambiar su comportamiento** (sigue lanzando; el test 019 comprueba el `throw` contra la **constante** `RESEED_HINT`, no un literal) — su **texto** SHALL actualizarse para apuntar a `make reset` (limpia BD **y** almacén), lo cual no rompe el test. **Sin** ruta de «skip idempotente». Así toda re-siembra parte de un slate limpio (BD + almacén); no hay estado parcial ni desincronía persistente que deje un 410 silencioso.
- *(FR-012 retirado en el corte de alcance de G1: se eliminó la ruta «skip idempotente» de `make up`; ver modelo reset-y-siembra en FR-011. Se conserva la numeración para trazabilidad.)*
- **FR-013** (validador compartido): THE regla de validación de `EVIDENCE_ENC_KEY` (presente, ≥32) SHALL residir en **una función compartida** reutilizada por la config de la app y por el seed (una sola fuente de verdad), no duplicada, para que no diverjan.

### Key Entities *(include if feature involves data)*

- **Blob de evidencia sembrado (dev)**: contenido binario de imagen asociado 1:1 a la fila `OrderEvidence` de la orden ancla por su `object_ref`; producido por el seed usando el adaptador de almacenamiento existente y la clave de cifrado del entorno. No introduce entidades ni columnas nuevas; reutiliza `OrderEvidence` y el almacén de 024.

## Contrato (OpenAPI)

**No hay endpoints nuevos ni cambios de contrato.** La feature reutiliza `getOrderEvidence`/`uploadOrderEvidence` y el `StoragePort` de 024 **sin modificar su código**; solo escribe datos de desarrollo (una fila ya existente + su blob) y ajusta la tooling de siembra. No toca `contracts/`.

## Trazabilidad (RF → endpoint → tarea → test)

| FR | Endpoint(s) | Tarea(s) | Test(s) |
|----|-------------|----------|---------|
| FR-001 | (reutiliza) getOrderEvidence | T005,T006,T007 | `should servir 200 el blob sembrado de la orden ancla (descifrable)` |
| FR-002 | — | T002,T012 | `should usar bytes embebidos (sin ficheros de asset nuevos)` |
| FR-003 | — | T001,T003,T004 | `should abortar (exit!=0, mensaje nombra EVIDENCE_ENC_KEY+acción) si falta/inválida la clave` |
| FR-004 | — | T003,T004 | `should abortar con NODE_ENV=production o host externo (match exacto; rechaza evil-db.example.com) sin filtrar DATABASE_URL/credenciales` |
| FR-005 | getOrderEvidence | T007,T010 | `should escribir el blob en EVIDENCE_STORAGE_DIR del backend navegado` |
| FR-006 | — | T010,T011 | `make seed puebla fieldops (no fieldops_test); tests usan su BD de test` |
| FR-007 | — | T005,T007,T010 | `la fila usa el object_ref devuelto por putStaged; make reset (almacén+BD) no deja huérfanos` |
| FR-008 | — | T012 | `arch: 0 cambios en contracts/dominio/RBAC/handlers de evidencia` |
| FR-009 | — | T009 | `should fallar accionable (nombra EVIDENCE_STORAGE_DIR) si el almacén no existe/no es escribible al escribir el blob` |
| FR-014 | getOrderEvidence | T008 | `audit reason=execution_registered ⇒ gc-job NO purga el blob sembrado (200 tras arrancar/GC); sin regresión 019/006` |
| FR-010 | — | T005,T007,T009 | `should ser atómico: interrupción revierte la BD (vacía), blob antes que fila; poblada⟺completa` |
| FR-011 | — | T010,T011 | `make reset (todo en contexto backend) limpia BD+EVIDENCE_STORAGE_DIR y re-siembra` · `guard falla ⇒ prisma migrate reset NUNCA se invoca (orden, no solo exit≠0)` · `dir ausente ⇒ paso (b) no falla (idempotente)` · `seed sobre BD no vacía fail-fast con RESEED_HINT (throw sin cambios; test 019 usa la constante)` |
| FR-013 | — | T001 | `config de la app y el seed usan la misma función de validación de la clave` |

> Se mantiene en `docs/traceability.md` al implementar.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: **Inmediatamente tras** re-sembrar la BD de desarrollo navegada (antes de cambiar el estado de la orden ancla), la evidencia de esa orden se sirve con **200** (no 410) al solicitarla vía `getOrderEvidence`, en el **100 %** de las ejecuciones del seed, para técnico dueño y supervisor, **y sigue en 200 tras arrancar el backend** (el GC no la purga, FR-014).
- **SC-002**: El seed aborta con **salida ≠0** y mensaje accionable, **sin escribir fila ni blob**, en el 100 % de los casos con `NODE_ENV=production`, con un **host de `DATABASE_URL` no local** (externo), o con `EVIDENCE_ENC_KEY` ausente/inválida.
- **SC-003**: Un desarrollador que sigue el flujo documentado (`make up`/`make seed`) obtiene **200** para la evidencia sembrada **sin pasos manuales** (0 exportaciones de variables, 0 subidas de foto) — verificable de forma automatizada ejecutando la ruta `make` real contra el entorno navegado. *(La verificación **visual** del visor con Playwright autenticado es aparte y queda pendiente: requiere login del seed.)*
- **SC-004**: **0 cambios** en `contracts/`, en la lógica de dominio, en RBAC y en el código de los handlers `getOrderEvidence`/`uploadOrderEvidence` (verificado por diff/arch-test).
- **SC-005**: La suite de tests sigue **verde** con su BD de test independiente, sin regresiones por el cambio de destino de la siembra de desarrollo.

> SC medibles (Constitution XIV): SC-002/SC-004/SC-005 con herramientas deterministas (exit code, diff/arch-test, suite); SC-001/SC-003 por verificación del flujo real (idealmente Playwright autenticado con el seed corregido).

## Assumptions

- El almacén de dev es el adaptador fs+crypto existente (024); no se introduce un almacén nuevo ni un S3 real.
- El backend navegado en dev usa `db`/`fieldops` y `EVIDENCE_STORAGE_DIR` montado desde el host (`docker-compose.override.yml`); por eso el seed corre en el **contexto de ese servicio** (FR-006). La BD de test (`fieldops_test`) sigue siendo independiente para la suite (Constitution VII), y **CI usa su propia ruta `npm run seed`** con su BD (verificado: `.github/workflows/*-back.yml`, `pr-gate.yml`), no afectada por re-apuntar la tooling de dev.
- **`pre` y `prod` usan `NODE_ENV=production`** (`docs/16-devops-setup-manual.md:45`), por lo que el guard de FR-004 los cubre; la segunda barrera (host de `DATABASE_URL` local) protege además una BD externa mal apuntada.
- La clave `EVIDENCE_ENC_KEY` se hereda vía `env_file` del servicio backend (no por argv), así que coincide **bit a bit** con la del backend y no se expone en `ps`/`docker inspect`/stdout de `make`. La gestión de claves **distintas por entorno** (dev vs pre/prod) es responsabilidad del pipeline (feature 010); el guard de FR-004 es la barrera aunque coincidieran.
- «Sin filtrarla en logs» (FR-006) cubre: stdout de `make seed`/`make up`, `docker compose config`, y no pasarla por argv (`ps`/`docker inspect`).
- Solo se siembra evidencia con blob para la **orden ancla** (una evidencia), coherente con el seed actual; no se siembran múltiples evidencias.
- **Modelo reset-y-siembra** (Principio XV, anti-espiral): no hay siembra incremental ni «idempotente»; el **comportamiento** de `ensureSeedableOrThrow` se mantiene sin cambios (fail-fast sobre BD no vacía; el test 019 usa la constante `RESEED_HINT`), y toda re-siembra pasa por **`make reset`** (BD + almacén). Esto elimina por diseño los estados parciales/desincronizados/de sobrescritura, en vez de cubrirlos con salvaguardas.
- **Estrategia de test del tooling** (detalle a fijar en plan/tasks): el **orden** guard→reset (guard falla ⇒ `prisma migrate reset` nunca se invoca) y la **idempotencia** del borrado se verifican con test **unitario sobre la lógica del script** (spawn mockeable); el flujo real de `docker compose run` (merge del override, 200 end-to-end) se cubre con la verificación de `quickstart.md` (idealmente automatizada; Playwright visual queda pendiente por login del seed). G2/G3 revisan esta cobertura.
- **Único escritor (uso secuencial)**: la siembra es una herramienta de un desarrollador; se asume ejecución **secuencial**, no concurrente. La exclusión mutua entre dos `make seed`/`make reset` simultáneos queda **fuera de alcance** (Principio XV): no se añade lock/flock; el riesgo (blob entrelazado) es de baja probabilidad y se resuelve con otro `make reset`.
- Ámbito acotado (Principio XV): no se añade una UI de gestión de seed, ni almacenamiento S3, ni fixtures de imagen variados; una sola imagen mínima embebida.
