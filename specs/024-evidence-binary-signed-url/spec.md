# Feature Specification: Evidencia fotográfica — binario y visualización por URL firmada (024)

**Feature Branch**: `024-evidence-binary-signed-url`

**Created**: 2026-07-16

**Status**: Draft

**Input**: Implementa la deuda histórica «#007-subida» (subida binaria real de evidencia + servir la imagen), independiente del git `007-resumen-incidencia-ia` (resumen IA). Hoy la evidencia solo existe como metadatos (`EvidenceMeta`: `count`+`content_types`); el técnico/supervisor ve tiles «Imagen N» pero **no puede abrir la foto**. Esta feature cierra ese hueco de forma segura.

> **Full-stack, contract-first, sensible en seguridad** (Constitución IV/IX/XI). Toca contrato (OpenAPI),
> backend (hexagonal: dominio puro + adaptador de almacenamiento en infra) y front (abrir la imagen).
> **No** cambia el FSM de la orden, ni el reskin (FE-8/9), ni el resumen IA (018). Reutiliza la validación
> de evidencia ya existente (`EvidenceRef`: allowlist `image/{jpeg,png,webp,heic}`, tamaño 1..25 MiB).

## Clarifications

### Session 2026-07-16 (decisiones por defecto informado — el panel G1 las valida)

- Q: ¿Mecanismo de **subida** (FR-012)? → A: **Endpoint nuevo `uploadOrderEvidence` multipart** (no se cambia el cuerpo de `submitOrderExecution`, que sigue JSON → evolución compatible). El backend valida allowlist/tamaño/**contenido real** en el borde y almacena cifrado. Sin pre-signed PUT ni store cloud en dev (validación y control server-side, coherente con hexagonal).
- Q: ¿Cómo se **sirve la lectura** (FR-013)? → A: **200 same-origin autenticado por sesión** (un solo modelo, sin token de cliente). El endpoint autoriza (orden+rol, como `getOrderDetail`) y **sirve el binario en la respuesta**; el front lo renderiza desde un **blob** (`Referrer-Policy: no-referrer`, `Cache-Control: no-store`). Internamente el backend lee el objeto del almacenamiento con una **URL firmada ≤300 s no expuesta al cliente** (satisface «URL firmada ≤300 s» de la constitución entre backend↔store). No hay URL/token detached del lado cliente → sin fuga por DOM/Referer/historial (S-006) ni bearer (S-001). SC-003 mide la **vigencia ≤300 s de esa firma interna** y la ausencia de URL cliente-visible.
- Q: ¿**Plazo de retención** del binario PII (FR-009)? → A: **90 días tras el cierre**, decidido y fijo; después se **purga** (410). Metadatos/auditoría permanecen (XI).

### Session 2026-07-16b (endurecimiento de seguridad tras G1 — anclado al modelo existente)

- **Sin token/URL de cliente (S-001/H-005/S-006)**: no hay capacidad portadora del lado cliente. La lectura es **same-origin autenticada por sesión** y cada petición se **re-autoriza**; la firma ≤300 s es **interna** (backend↔almacenamiento), no expuesta. El front consume por **fetch a un blob** (`Referrer-Policy: no-referrer`, `Cache-Control: no-store`).
- **404 uniforme (S-004/T-001)**: sin sesión → 401; cualquier no-autorizado/inexistente/ajeno → **404 uniforme**, **nunca 403** (idéntico a `getOrderDetail`).
- **Autorización = la de `getOrderDetail` (S-002/S-003/T-002/S-007)**: no hay regla nueva; el acceso a evidencia reutiliza exactamente la autorización del detalle (dueño **actual** + supervisor; org plana, sin partición por equipo). La reasignación transfiere el acceso al nuevo dueño; el saliente lo pierde. Órdenes `closed` en retención: igual regla, sin acceso especial.
- **evidenceId∈orderId (S-005)**: se verifica pertenencia; mismatch → 404.
- **Atomicidad realista (H-001)**: blob primero; la transacción de Postgres (metadatos+transición+auditoría) es la verdad; huérfano → GC.
- **Contenido real (H-009)**: se valida magic-bytes, no solo el tipo declarado.
- **Purga programada (H-004/H-018)**: job, no perezoso.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - El técnico sube fotos reales de evidencia (Priority: P1)

Como técnico, al registrar la ejecución adjunto **≥1 foto real** (no solo un metadato); el sistema la almacena de forma segura y la asocia al ciclo de ejecución de mi orden.

**Why this priority**: sin binario almacenado no hay nada que abrir; es la base de la feature.

**Independent Test**: como técnico dueño de una orden `in_progress`, subir 1..N imágenes válidas y enviar a revisión; el detalle refleja `count` = N y las imágenes quedan recuperables (US2).

**Acceptance Scenarios**:

1. **Given** el técnico dueño en `in_progress`, **When** envía la ejecución con ≥1 imagen válida (allowlist/tamaño), **Then** se almacenan cifradas en reposo y la orden pasa a `pending_review` con `count` = nº de imágenes.
2. **Given** una imagen fuera de allowlist o de tamaño, **When** se intenta subir, **Then** se rechaza con error de validación (4xx `{code,message,details,agent_action}`) sin almacenar nada.
3. **Given** un rol distinto del técnico dueño, **When** intenta subir evidencia a esa orden, **Then** se rechaza (401 sin sesión / **404 uniforme** por no-enumeración; nunca 403).

---

### User Story 2 - Ver/abrir la imagen de evidencia desde el detalle (Priority: P1)

Como técnico dueño o supervisor con permiso, en el detalle de la orden puedo **abrir cada foto** de evidencia; la imagen se sirve **same-origin autenticada por sesión** (sin enlace público ni token detached; la firma ≤300 s es interna backend↔almacenamiento).

**Why this priority**: es la petición directa del usuario (hoy no se puede abrir la imagen).

**Independent Test**: como supervisor sobre una orden `pending_review` con evidencia, abrir la foto N; se muestra la imagen (fetch de sesión → blob); la **firma interna** backend↔store caduca ≤300 s y no hay URL cliente-visible.

**Acceptance Scenarios**:

1. **Given** el técnico dueño o el supervisor autorizado, **When** solicita ver la evidencia N de su orden, **Then** el endpoint autenticado por sesión sirve la imagen (200); internamente la lee con una firma **TTL ≤ 300 s** no expuesta al cliente.
2. **Given** un dispatcher (mínimo privilegio) u otro rol no autorizado, **When** solicita la evidencia, **Then** se rechaza con **404 uniforme** (nunca 403), sin exponer si existe.
3. **Given** la firma interna backend↔store **caducada** (> TTL), **When** el backend intenta leer el objeto, **Then** la lectura falla; el cliente, sin sesión válida, tampoco accede.
4. **Given** una imagen almacenada, **When** se intenta acceder **directamente al almacenamiento** sin la firma interna o **al endpoint sin sesión/autorización**, **Then** el acceso se deniega.

---

### User Story 3 - Seguridad y privacidad de la evidencia (Priority: P1)

Como responsable de datos, la evidencia (PII) se protege: cifrada en reposo, autorizada por-orden antes de emitir cualquier URL, la URL y la referencia del objeto **nunca** aparecen en logs, y se respeta una política de retención.

**Why this priority**: la evidencia es PII de cliente; una fuga o acceso indebido es el mayor riesgo (Constitución IX).

**Independent Test**: revisar que (a) el acceso requiere autorización por-orden; (b) la URL expira ≤300 s; (c) los logs no contienen la URL/`object_ref`/binario; (d) el cifrado en reposo está activo.

**Acceptance Scenarios**:

1. **Given** cualquier acceso a evidencia, **When** se procesa, **Then** la autorización se resuelve **server-side por orden + pertenencia + rol** antes de emitir la URL (no confía en el cliente).
2. **Given** el registro de logs, **When** se sube o se sirve evidencia, **Then** ni la URL firmada, ni el `object_ref`, ni el binario aparecen en logs/errores.
3. **Given** el almacenamiento, **When** se guarda una imagen, **Then** queda **cifrada en reposo** y sujeta a la política de retención del payload PII (distinta de la auditoría, XI).

---

### Edge Cases

- **Sin evidencia (`count` 0)**: no hay nada que abrir; el detalle muestra «sin evidencia» (comportamiento de FE-9).
- **Evidencia de orden `closed`/histórica**: acceso según rol/pertenencia; la retención puede haber purgado el binario → estado «no disponible» sin filtrar detalles.
- **URL firmada reutilizada tras caducar / manipulada**: acceso denegado.
- **Fallo del almacenamiento** (subir/servir): error `{code,...}` con `agent_action`, sin dejar estado inconsistente (subida atómica con la transición/auditoría, XI).
- **IDOR**: pedir la evidencia `M` de una orden ajena vía id → 404 uniforme (no-enumeración), nunca servir el binario.
- **Minimización IA**: si la evidencia alimenta el resumen IA (018), el puerto de dominio minimiza/redacta antes del proveedor; esta feature no envía binario a terceros.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: WHEN el técnico dueño de una orden en `in_progress` envía la ejecución con ≥1 imagen THE sistema SHALL **almacenar el binario cifrado en reposo** y asociarlo al ciclo, reflejando `count` y `content_types` (evolución compatible de `EvidenceMeta`).
- **FR-002**: WHEN la imagen está fuera de la allowlist de tipo (`image/{jpeg,png,webp,heic}`) THE sistema SHALL responder **415**; WHEN excede el tamaño (>25 MiB) o es 0 bytes **413**; otras validaciones de forma **422** — siempre `{code,message,details,agent_action}` y **sin almacenar** (reutiliza la validación de `EvidenceRef`).
- **FR-019**: WHEN se sube un binario THE sistema SHALL validar el **contenido real** (magic bytes / decodificación). Mapeo determinista: `content_type` declarado **fuera de allowlist** → **415**; declarado en allowlist pero cuyo **contenido real NO es esa imagen válida** (tipo falseado, corrupto, ilegible) → **422**. En ambos casos, sin almacenar.
- **FR-003**: WHEN un actor solicita ver una evidencia de una orden THE sistema SHALL **autorizar server-side reutilizando exactamente la misma regla que `getOrderDetail`** (técnico **dueño actual** o supervisor); el **dispatcher NO** accede (mínimo privilegio, igual que hoy se le omite `evidence`). No hay regla de acceso nueva ni divergente de la del detalle.
- **FR-004**: WHEN la autorización es válida THE sistema SHALL servir el binario **same-origin en la misma respuesta autenticada por sesión** (200); **no** entrega al cliente ninguna URL firmada ni token detached. La **URL firmada con TTL ≤ 300 s** existe **solo internamente** (backend ↔ adaptador de almacenamiento) para leer el objeto; **nunca** se expone al cliente. Cada petición del cliente se **re-autoriza por sesión** (no hay capacidad portadora que viaje).
- **FR-005**: WHEN la URL firmada **interna** (backend↔almacenamiento) está caducada o manipulada THE almacenamiento SHALL denegar la lectura; y WHEN el cliente pide evidencia **sin sesión válida o sin autorización** THE endpoint SHALL denegar (FR-007). No existe token de cliente reutilizable/compartible (se elimina el vector bearer).
- **FR-006**: THE binario SHALL **no** ser accesible sin pasar por el endpoint autenticado (ni por URL directa al almacenamiento sin la firma interna): test explícito de acceso directo denegado.
- **FR-007**: THE comprobación SHALL seguir esta **precedencia**: (1) sin sesión → **401**; (2) autorización (orden+rol, como `getOrderDetail`) → si no autorizado / orden inexistente / ajena / `evidenceId` inexistente → **404 uniforme** (nunca 403), respuesta **constante** e indistinguible; (3) **solo si el actor está autorizado** se evalúan existencia del binario/purga (410, FR-009). Así **410 nunca es visible a un no-autorizado** (evita enumerar «existió y fue purgada» vs «no existe»).
- **FR-008**: THE sistema SHALL **no** emitir en **logs/errores** ni en **respuestas de lectura/detalle** el `object_ref`, la firma interna ni el binario (el `object_ref` solo circula en el flujo upload↔submit; `getOrderDetail`/`getOrderEvidence` exponen `evidenceId`, no `object_ref`). Redacción de PII en logs.
- **FR-009**: THE binario de evidencia SHALL retenerse mientras la orden no esté `closed` y **hasta 90 días tras el cierre**; superado ese plazo se **purga**. Para un actor **autorizado** (tras FR-007), pedir una evidencia **purgada** o **histórica/legacy sin binario almacenado** (evidencia previa a esta feature, solo metadatos) devuelve **410 «no disponible»** (indistinguible entre purgada y legacy); metadatos y auditoría permanecen (inmutables, XI). El **410 solo se expone a autorizados** (FR-007).
- **FR-010**: THE front (detalle de orden) SHALL permitir **abrir cada foto** de evidencia (sustituye el placeholder «Imagen N» de FE-9 por una miniatura/enlace real), con estados de **carga/error**.
- **FR-011**: THE persistencia SHALL ser consistente sin transacción distribuida, con **atomicidad por operación**: (a) `uploadOrderEvidence` escribe el **blob** (staging) y devuelve una ref opaca — **no** crea fila de metadatos; (b) `submitOrderExecution` crea las **filas `OrderEvidence`** (ligadas al `auditId`/`attempt` del envío) referenciando los blobs staged, en **su propia transacción** junto con la transición y la auditoría (la existente de 005). Una evidencia solo «cuenta»/es direccionable si su fila commiteó en el submit. Los **blobs sin fila `OrderEvidence` vigente** (staged abandonados, huérfanos por rollback, o de ciclo **superado**) los purga **un único GC** (ver FR-024). Invariante correcto: **no hay blob sin fila que lo reclame**; en cambio una **fila SÍ puede sobrevivir sin blob** (purgada por retención/superada, o legacy) → devuelve **410** (nunca fila-y-blob descoordinados para el lector: si hay blob, hay fila; si no hay blob, la fila responde 410).
- **FR-012**: WHEN el técnico dueño sube evidencia THE cliente SHALL usar un **endpoint nuevo `uploadOrderEvidence` (multipart)** que valida allowlist/tamaño/contenido y **almacena el blob cifrado** (staging), devolviendo el **`object_ref`** del blob. `submitOrderExecution` **conserva su cuerpo actual** (`evidence: EvidenceRef[]` con `object_ref`, verificado en el contrato): esos `object_ref` ahora son los **devueltos por `uploadOrderEvidence`** (antes eran placeholders). Al transicionar a `pending_review`, el submit **crea las filas `OrderEvidence`** (ligadas a `auditId`/`attempt`). **Shape del request sin cambios → evolución realmente compatible.** Sin pre-signed PUT ni store cloud en dev.
- **FR-020**: THE subida (`uploadOrderEvidence`) SHALL autorizarse **server-side** con **precedencia autz-primero** (como FR-007): (1) sin sesión → **401**; (2) si el actor no es el **técnico dueño actual** o la orden no está en `in_progress` → **404 uniforme** (nunca 403) **antes** de mirar el contenido; (3) **solo si autorizado** se valida forma/tipo/tamaño (**415/413/422**, FR-002/FR-019). Así un no-dueño **nunca** recibe 415/413/422 (no filtra). Doble capa: UI oculta + backend autoridad.
- **FR-021**: WHEN un actor autorizado **lee** una evidencia (`getOrderEvidence`) THE sistema SHALL registrar el hecho en la **auditoría append-only** (actor, `orderId`, `evidenceId`, timestamp), **sin** el binario/`object_ref`/URL (no-repudio, XI/STRIDE-repudio; complementa FR-008).
- **FR-023**: THE `object_ref` staged que devuelve `uploadOrderEvidence` SHALL estar **ligado a (técnico dueño que lo subió, `orderId`)**. WHEN `submitOrderExecution` incluye `object_ref`s en su `evidence[]` THE backend SHALL **re-verificar bajo la concurrencia optimista de la orden (`version`/If-Match, ya existente)** que cada `object_ref` fue staged por el **mismo técnico dueño actual y para esa orden**, en la **misma transacción** que la transición. **Códigos deterministas**: `object_ref` **ajeno/de otra orden/de otro actor** → **404 uniforme** (no-enumeración, como FR-007); `object_ref` **malformado** → **422**; `object_ref` **propio y válido pero ya purgado por el TTL de staging** (FR-024, p. ej. >24 h sin enviar) → **422 «evidencia expirada, vuelve a subir»**. Ningún caso crea fila. **TOCTOU con reasignación**: una reasignación concurrente sube `version`; el submit del dueño **saliente** (ya no es el dueño actual) → **404 uniforme** (coherente con FR-007/020; no 409, para no revelar el cambio de estado).
- **FR-024**: THE GC de blobs SHALL ser **un único proceso programado** que purga todo blob **sin fila `OrderEvidence` vigente** — es decir: (a) sin fila (staged abandonado >24 h TTL, o huérfano por rollback), y (b) con fila marcada **superada** por un reenvío (FR-017). Un blob cuya fila es **vigente y committeada** no lo toca este GC (lo rige la retención de 90 días, FR-018). Así se cubre también la purga física del ciclo superado (cierra el hueco de que «con fila» quedara sin GC).
- **FR-022**: THE ciclo subida↔envío SHALL definirse así: varias `uploadOrderEvidence` **acumulan blobs staged vivos** (no superados/purgados); el **11.º** `uploadOrderEvidence` del ciclo se **rechaza con 422** (tope de `EvidenceRef` = 10), y `submitOrderExecution` con `evidence[]` > 10 también → **422**. El tope cuenta solo blobs **staged vivos** del ciclo (no los ya superados/abandonados pendientes de GC). `submitOrderExecution` referencia los que incluya y exige ≥1. Los blobs staged **no tienen fila `OrderEvidence` → no son direccionables por `getOrderEvidence` ni aparecen en `getOrderDetail.items`** (nadie, ni dueño ni supervisor, lee evidencia no enviada por la API de lectura; el técnico ve lo que sube por la respuesta de `uploadOrderEvidence`). Blobs staged **abandonados** o del **dueño saliente tras una reasignación** nunca se referencian en un submit → **huérfanos, GC** (no hay ventana de lectura porque no existe fila). El nuevo dueño empieza sin blobs staged suyos.
- **FR-013**: WHEN el front necesita mostrar/abrir una imagen THE cliente SHALL obtenerla por **fetch autenticado same-origin** (con la sesión) que devuelve el binario, y renderizarla desde un **blob en memoria** (`blob:`), **sin** poner el token/URL firmada en el DOM (`<img src>` directo), el historial ni la cabecera `Referer`. El endpoint responde con `Referrer-Policy: no-referrer` y `Cache-Control: no-store`.
- **FR-014**: THE detalle de la orden (para roles autorizados) SHALL exponer, además de `count`/`content_types`, la **lista de identificadores opacos de evidencia** (`evidenceId` + `content_type` por ítem) para que el front construya el acceso a cada imagen; el `object_ref` interno **no** se expone. La evidencia **legacy** (previa a esta feature) ya tiene su fila `OrderEvidence` con `id` (verificado en `schema.prisma`) → sus `items` usan ese `id` existente (no se sintetiza); abrirla devuelve **410** (blob nunca almacenado), coherente con el mapeo `count`↔`items`.
- **FR-015**: WHEN se solicita `{evidenceId}` bajo `{orderId}` THE sistema SHALL **verificar que la evidencia pertenece a esa orden**; si no, **404 uniforme** (evita usar un `orderId` propio para leer evidencia de otra orden).
- **FR-016**: WHEN una orden se **reasigna** (cambia `assigned_to`) THE acceso a la evidencia SHALL seguir la autorización vigente de `getOrderDetail`: el **nuevo** técnico dueño accede; el **saliente pierde** el acceso; el supervisor mantiene el suyo. (No se define partición por equipo/tenant: organización única/plana.)
- **FR-017**: THE evidencia visible SHALL ser la del **ciclo vigente** = el del **`attempt`/`auditId` más reciente enviado**; `getOrderDetail.items`/`getOrderEvidence` exponen solo ese conjunto. WHEN una orden rechazada se reenvía, la **transacción PG del nuevo submit** crea las filas del nuevo `attempt` y **marca superado** el ciclo anterior (el reemplazo **lógico** —qué se expone— es inmediato al commit; los `evidenceId` superados → **410** a autorizados). La **purga física** de los binarios superados la hace el **GC de FR-024** (que cubre blobs de fila superada), fuera de la transacción PG (coherente con FR-011). Si el técnico abandona el reintento (sin nuevo submit), la evidencia del ciclo rechazado **sigue vigente**.
- **FR-018**: THE purga por retención (FR-009) SHALL ejecutarse por un **proceso programado** (no perezoso) que recorre órdenes `closed` con antigüedad > 90 días y purga su binario (un binario nunca accedido igualmente se purga). Es independiente de la purga inmediata de ciclos superados (FR-017).

### Key Entities

- **OrderEvidence** (modelo existente verificado, `prisma/schema.prisma`): fila por evidencia con `id` (uuid), `orderId`, **`objectRef`** (ref opaca al blob; es **client-visible solo en el flujo upload↔submit** —ya viaja en el body actual de `submitOrderExecution`— pero **nunca en logs ni en respuestas de lectura/detalle**, donde solo se expone `evidenceId`), `contentType` (allowlist), `sizeBytes`, `uploadedBy`, **`attempt`** y **`auditId`** (enlace a la `OrderAudit` del envío). El **ciclo de ejecución** se discrimina por `attempt`/`auditId` (ya en el modelo); el «ciclo vigente» es el del `attempt`/audit más reciente. Una fila `OrderEvidence` existe **solo tras el submit**; un **blob staged** (subido y aún sin submit) es solo un objeto en almacenamiento **sin fila** (no direccionable). El binario vive en el almacenamiento (infra), cifrado; el dominio maneja metadatos + puerto de almacenamiento.

## Contrato (OpenAPI) *(obligatorio — Constitution II)*

- **Fichero**: `contracts/orders.openapi.yaml` (OpenAPI 3.1), evolución **compatible** (no rompe `EvidenceMeta`; `count`/`content_types` se conservan; se **añade** la lista de ítems con `evidenceId`+`content_type`).
- **Endpoints** (decisiones de clarify ya cerradas):
  - **Subida**: **endpoint nuevo** `uploadOrderEvidence` — `POST /v1/orders/{orderId}/evidence` (**multipart**, imagen(es)) — rol `technician (dueño actual)`, orden `in_progress` — `201`/`401`/`404`/`413`/`415`/`422`. `submitOrderExecution` **no cambia** (sigue JSON; referencia la evidencia subida). Sin `createEvidenceUploadUrl`/pre-signed.
  - **Lectura**: `getOrderEvidence` — `GET /v1/orders/{orderId}/evidence/{evidenceId}` — roles `technician (dueño actual)`, `supervisor` — respuestas `200` (binario, **same-origin autenticado por sesión**, `Referrer-Policy: no-referrer`, `Cache-Control: no-store`) · `401` · **`404` uniforme** (no 403) · `410` (purgada/legacy). **Sin token/URL de cliente**; cada petición se re-autoriza por sesión; la firma ≤300 s que lee el objeto es **interna** backend↔almacenamiento. Solo son direccionables las evidencias **committeadas** (con fila creada en el submit); los blobs staged (subidos sin enviar) no tienen `evidenceId` y no se sirven.
  - **Detalle**: `getOrderDetail` amplía `EvidenceMeta` con `items: [{evidenceId, content_type}]` (compatible; solo roles autorizados).
- **Errores** `{code,message,details,agent_action}` con HTTP correcto (400/401/404/410/413/415/422/503); `413`/`415` para tamaño/tipo. **No se usa 403** (404 uniforme).

## Trazabilidad (RF → endpoint → tarea → test) *(obligatorio — Constitution VI)*

| FR | Endpoint(s) | Test(s) |
|----|-------------|---------|
| FR-001 | `uploadOrderEvidence`+`submitOrderExecution` | `integration/evidence-upload-store` (count=N, cifrado) |
| FR-002 | `uploadOrderEvidence` | `contract/evidence-validation` (415 tipo, 413 tamaño, 422) |
| FR-003 | `getOrderEvidence` | `integration/evidence-authz` (dueño/supervisor sí, dispatcher no) |
| FR-004 | `getOrderEvidence` | `integration/evidence-session-serve` (200 same-origin por sesión; 0 URL/token cliente-visible; firma interna ≤300s) |
| FR-005 | `getOrderEvidence` | `integration/evidence-internal-signature-ttl` (firma interna caduca; cliente sin sesión no accede) |
| FR-006 | (almacenamiento) | `integration/evidence-no-direct-access` |
| FR-007 | `getOrderEvidence` | `integration/evidence-404-uniforme` (401 sin sesión; 404 no autorizado/ajena/inexistente) |
| FR-008 | (logging) | `integration/evidence-nolog` (grep sin token/object_ref/binario) |
| FR-009 | (retención) | `integration/evidence-retention-410` |
| FR-010 | front detalle | `unit/evidence-open-image` (abrir, carga/error) |
| FR-011 | `uploadOrderEvidence` | `integration/evidence-atomic-gc` (commit BD = verdad; huérfano purgado) |
| FR-012 | `uploadOrderEvidence` | `contract/upload-multipart` (submit sigue JSON, sin romper) |
| FR-013 | front detalle | `unit/evidence-blob-no-leak` (blob:, sin URL en DOM/Referer) |
| FR-014 | `getOrderDetail` | `contract/detail-evidence-items` (evidenceId+content_type) |
| FR-015 | `getOrderEvidence` | `integration/evidence-belongs-to-order` (mismatch → 404) |
| FR-016 | `getOrderEvidence` | `integration/evidence-reassign-access` (nuevo sí, saliente no) |
| FR-017 | `submitOrderExecution` | `integration/evidence-cycle-replace` (reenvío reemplaza) |
| FR-018 | (job de purga) | `integration/evidence-purge-job` |
| FR-019 | `uploadOrderEvidence` | `integration/evidence-content-validation` (magic-bytes; tipo falseado → 415/422) |
| FR-020 | `uploadOrderEvidence` | `integration/evidence-upload-authz` (dueño+in_progress sí; otro rol/estado → 401/404) |
| FR-021 | `getOrderEvidence` | `integration/evidence-read-audit` (auditoría de lectura sin binario) |
| FR-022 | `uploadOrderEvidence`+`submitOrderExecution` | `integration/evidence-cycle-lifecycle` (acumula; abandonada/reasignada purgada) |
| FR-023 | `submitOrderExecution` | `integration/evidence-ref-ownership` (ref ajena/otra orden/otro actor → rechazo) |
| FR-024 | (GC staging) | `integration/evidence-staging-gc` (>24h sin fila purgado; en-vuelo conservado) |

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El técnico dueño puede **subir ≥1 imagen** válida y, tras enviar a revisión, `count` refleja el nº real de imágenes almacenadas (verificable end-to-end).
- **SC-002**: El técnico dueño y el supervisor autorizado pueden **abrir cada imagen**; el dispatcher y roles no autorizados **no** (**404 uniforme**). 100% de los pares (rol × autorización) cubiertos por test.
- **SC-003**: La firma **interna** de lectura (backend↔almacenamiento) tiene **TTL ≤ 300 s** (test de expiración) y **0 URLs/tokens de acceso son visibles para el cliente** (la lectura es same-origin por sesión; test de que la respuesta/DOM no contiene una URL firmada).
- **SC-004**: La evidencia **no** es accesible por URL directa sin autorización (test negativo) y está **cifrada en reposo** (test/estándar).
- **SC-005**: **0** apariciones de URL firmada / `object_ref` / binario en logs (grep de logs en test).
- **SC-006**: La **retención** del binario PII se aplica: tras el plazo definido, el binario se purga y el acceso devuelve «no disponible» sin filtrar (test de purga/expiración).
- **SC-007**: **100%** de contract tests (operationId × código) y **0 regresiones** en la suite (backend + front); cobertura dominio ≥80%, transiciones/contratos 100%.

## Assumptions

- **Almacenamiento**: adaptador en infra (el dominio no conoce el proveedor). El **puerto de almacenamiento** define una capacidad de **lectura firmada con TTL** que **todo adaptador implementa**, incluido el **local/mock** de dev/test (p. ej. token HMAC + expiración validado por el backend sobre el filesystem) — así la firma ≤300 s y su expiración **existen y son testeables en dev** (SC-003) sin store cloud. Cifrado en reposo AES-256. Sin dependencia cloud de pago; compatible con un store S3-like en prod.
- **Retención**: plazo **decidido y fijo = 90 días tras el cierre** (FR-009); no queda pendiente. Un cambio de plazo sería una enmienda de spec, no una variable abierta. La auditoría (metadatos/hash) es inmutable e independiente (XI).
- **Gestión de claves (AES-256)**: la clave de cifrado en reposo vive en **configuración/secreto validado al arrancar** (fail-fast, como `JWT_SECRET`/`CSRF_HMAC_SECRET`), **nunca hardcodeada**; en dev/test una clave real de entorno (no simbólica) para que SC-004 verifique cifrado efectivo. Rotación de claves fuera de alcance (deuda futura).
- **Acceso a órdenes `closed` durante la retención (≤90 d)**: el acceso a su evidencia **hereda la autorización de `getOrderDetail` en el momento de la petición** (FR-003) — no hay acceso especial por la ventana de retención; quien ya no esté autorizado por el detalle no accede.
- **Reutilización**: la validación de allowlist/tamaño ya existe en `EvidenceRef`; no se redefine.
- **Invariantes**: no cambia el FSM ni el reskin (FE-8/9) ni el resumen IA (018); el front solo añade abrir la imagen sobre los tiles de FE-9.
- **STRIDE**: el plan incluirá **threat modeling STRIDE** (spoofing de acceso, tampering de URL, repudio→auditoría, information disclosure→cifrado/redacción, DoS→tamaño/rate, elevation→RBAC por-orden).

## Eval de objetivos (promptfoo) *(N/A — sin IA)*

- Sin componente IA (el resumen IA es 018). Los SC se verifican con tests **deterministas** (integración con Postgres real + adaptador de almacenamiento, contract tests, grep de logs, expiración de URL, purga por retención), no con promptfoo.
