# Feature Specification: Detalle de orden (read-side)

**Feature Branch**: `008-order-detalle-read`

**Created**: 2026-07-13

**Status**: Draft

**Input**: Roadmap #010 (BL-070, origen: BLOQUEANTE del gate G1 de 006 diferido). **Prerequisito de la fase
Front** (FE-1/FE-2/FE-4): un endpoint de **lectura** del detalle de una orden. Las specs 004–006 son
*write-side* y no exponen la lectura del detalle (notas de ejecución + metadatos de evidencia + motivo del
rechazo). El brief (`docs/00-brief-original.md`) dice *"el usuario puede ver sus órdenes"* y define
aprobar/rechazar; el ciclo de 006 rechaza devolviendo la **misma** orden a `in_progress` (no crea una nueva),
así que el técnico necesita ver **por qué** para corregir y reenviar.

> **Alcance MVP (Constitution XV)**: **LECTURA pura** del detalle de una orden visible según el rol. El motivo
> del último rechazo se **lee de `OrderAudit.reason`** acotado a la propia orden del técnico, habilitado por la
> **excepción de mínimo privilegio de Constitution XI (≥ v1.9.0)** — **sin** columna denormalizada, **sin** tocar
> 004/005/006, **sin** migración ni backfill (opción B; se descartó denormalizar por más invasiva y por riesgo de
> PII en el backfill). **No** incluye: mutaciones; subida/descarga del binario de evidencia (#007-subida);
> listado (002a); resto del registro de auditoría (restringido, XI); detalle de órdenes `closed` (futuro).

## Clarifications

### Session 2026-07-13

- Q: ¿Cómo se sirve el motivo del último rechazo? → A: ~~columna denormalizada en `Order`~~ **[SUPERADA en la
  ronda 2 de G1 → opción B: leer `OrderAudit.reason` acotado, XI v1.9.0]** (la denormalización resultó más
  invasiva: tocaba 004/005/006 + migración + backfill con fuga de PII).
- Q: ¿Qué roles ven el motivo? → A: **solo el técnico dueño** (confirmado en ronda 2; ver abajo).

### Session 2026-07-13 — remediación gate G1 (ronda 1)

- Q: **(mecanismo, revisado)** ¿Columna atada al ciclo (limpiada en 005/006)? → A: ~~mantener la columna atada al
  ciclo~~ **[SUPERADA en la ronda 2 → opción B]** (el toque a 004/005/006 + backfill-PII pesaba más que enmendar
  XI de forma acotada).
- Q: **(quién ve el motivo, revisado)** El motivo vive en órdenes rechazadas (`in_progress`), fuera del alcance
  del supervisor (`pending_review`). → A: **solo el technician dueño**. Supervisor y dispatcher **no** ven el
  motivo en el detalle (el supervisor ya lo conoce al escribirlo). Sin ampliar alcances.
- Q: **(403 vs 404)** ¿Qué código para orden no visible? → A: **404 genérico uniforme** (no-enumeración). El
  endpoint es de lectura abierto a los 3 roles autenticados; la visibilidad filtra a 404. **No se usa 403** (se
  retira del contrato de este endpoint).
- Q: **(campos de fecha)** → A: `created_at` y `updated_at` (ISO-8601 UTC), como `OrderDto` de 002a.
- Q: **(ausencia de valor)** → A: **omitir la clave** del JSON cuando no aplica (notes/evidence/motivo);
  convención uniforme (no `null`).
- Q: **(metadatos de evidencia)** → A: `content_types` **lista** (un `content_type` por evidencia del ciclo,
  duplicados posibles) + `count`, igual que la `EvidenceMeta` de 007.
- Q: **(órdenes `closed`)** → A: **fuera de alcance** de #010 (ningún rol tiene `closed` en su alcance de
  trabajo; el detalle de cerradas es una necesidad futura, no del brief). Documentado.
- Q: **(ciclo vigente tras rechazo, antes de reenviar)** → A: el "ciclo vigente" son las notas/evidencia del
  **último `submitOrderExecution`** (el que fue rechazado) — es justo lo que el técnico debe ver para corregir.

### Session 2026-07-13 — remediación gate G1 (ronda 2): mecanismo del motivo = opción B

- Q: **(mecanismo, re-revisado con costes de G1)** La columna denormalizada (A) tocaba 004/005/006 + migración +
  backfill con **fuga de PII** (motivos históricos no saneados) + problema de reasignación. → A: **opción B** —
  leer `OrderAudit.reason` acotado a la propia orden, habilitado por **Constitution XI v1.9.0** (excepción de
  mínimo privilegio). **Sin columna, sin tocar 004/005/006, sin migración, sin backfill.** #010 vuelve a ser
  **read-side puro**.
- Q: **(403 vs 404, propagación)** → A: **404 uniforme, sin 403** en TODO el spec (FR-004, FR-008, SC-003,
  contrato, trazabilidad) — corregida la propagación incompleta.
- Q: **(forma de `evidence`)** → A: `evidence` **siempre presente** con `{count, content_types}` (count=0,
  content_types=[] si no hay ciclo); solo `notes` y `last_rejection_reason` son opcionales/omitibles.
- Q: **(aislamiento supervisor/dispatcher)** → A: es el **modelo de organización única** de la constitution
  (multi-tenant fuera, YAGNI); cualquier supervisor/dispatcher ve datos de su alcance de estado en toda la org.
  Residual **aceptado y trazado (BL-074)** — no un defecto de #010; la segmentación por equipo/tenant es backlog.

### Session 2026-07-13 — remediación gate G1 (ronda 3): resolver el motivo en #010 (B endurecida)

- Q: **(atado al ciclo con B)** motivo (última transición de rechazo) vs notas (último submit) divergen tras
  reenviar. → A: mostrar el motivo **solo si hay rechazo SIN atender** = última transición de rechazo **posterior**
  al último `submitOrderExecution`; tras reenviar (`pending_review`) se omite → motivo y notas del **mismo ciclo**.
- Q: **(PII histórica con B)** leer `OrderAudit.reason` directo lee filas históricas no saneadas. → A: **sanear al
  leer** con el `pii-redactor` compartido de 007 (defensa en profundidad); eso **define "PII cruda"** de SC-004.
  No hace falta feature #011 aparte.
- Q: **(dispatcher)** → A: **mínimo privilegio** — sin notas ni metadatos de evidencia (solo campos de la orden).
- Q: **(reasignación)** → A: el motivo lo ve el **dueño actual** (debe corregir la orden; el motivo va saneado).
- Q: **(alcance técnico / `draft`)** → A: "activas" del técnico = assigned/in_progress/pending_review de SUS
  órdenes; **`draft`** fuera de alcance de todo rol → `404` (pre-asignación, no es fuga).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - El técnico ve el detalle de su orden y por qué se la rechazaron (Priority: P1)

Un technician abre una orden suya que volvió a `in_progress` tras un rechazo. Ve el detalle (estado, sus notas
de ejecución del ciclo vigente, metadatos de la evidencia) y **el motivo del último rechazo**, para poder
corregir y reenviar (bucle de 006).

**Why this priority**: sin ver el motivo, el rechazo es inútil y el bucle corregir→reenviar del brief no
funciona. Es el valor central de la lectura para el técnico.

**Independent Test**: con una orden propia rechazada (motivo registrado en 006), el technician pide el detalle
y recibe `200` con el estado, sus notas/metadatos de evidencia del ciclo vigente y el **motivo del rechazo**;
sobre una orden ajena recibe `404`.

**Acceptance Scenarios**:

1. **Given** una orden propia en `in_progress` tras rechazo (con motivo), **When** el technician pide el
   detalle, **Then** `200` con estado, notas del ciclo vigente, metadatos de evidencia (sin `object_ref`) y el
   **motivo del último rechazo**.
2. **Given** una orden **ajena** (de otro técnico) en cualquier estado, **When** el technician pide el detalle,
   **Then** `404` genérico (no-enumeración), sin filtrar existencia.
3. **Given** una orden propia que **nunca** fue rechazada (o ya reenviada), **When** pide el detalle, **Then**
   `200` con el detalle y la clave del motivo **omitida** del JSON (`last_rejection_reason` = NULL).

### User Story 2 - Supervisor y dispatcher ven el detalle según su alcance (Priority: P2)

El supervisor ve el detalle de órdenes en `pending_review` (su alcance de 006) para decidir; el dispatcher ve
el detalle de órdenes `assigned`/`in_progress` (su alcance de 004). Cada rol solo ve lo visible para él.

**Why this priority**: completa el detalle para los otros roles reutilizando la visibilidad ya definida; base
de FE-3/FE-4. P2 porque el desbloqueo crítico de la Front es el detalle del técnico (P1) + supervisor.

**Independent Test**: supervisor pide el detalle de una orden en `pending_review` → `200`; de una fuera de su
alcance → `404`. Igual para dispatcher con su alcance.

**Acceptance Scenarios**:

1. **Given** el supervisor y una orden en `pending_review`, **When** pide el detalle, **Then** `200` con estado
   + notas + metadatos de evidencia del ciclo vigente (lo que necesita para revisar).
2. **Given** el dispatcher y una orden `assigned`/`in_progress`, **When** pide el detalle, **Then** `200` con el
   detalle de su alcance.
3. **Given** cualquier rol y una orden fuera de su alcance de visibilidad, **When** pide el detalle, **Then**
   `404` genérico e indistinguible.

### Edge Cases

- **`orderId` malformado / inexistente / fuera de alcance**: `404` genérico idéntico (no-enumeración, coherente
  con 002a/004/005/006). Sin llamar a nada tras el guard de visibilidad.
- **Orden sin ciclo de ejecución** (p. ej. `assigned` sin ejecución aún): `200` con el detalle disponible; notas
  `notes` omitido y `evidence` presente con `{count:0, content_types:[]}` (no es error).
- **Orden con varios ciclos** (rechazada y reenviada varias veces, bucle de 006): se muestran las notas/evidencia
  del **ciclo vigente** (el `auditId` del último `submitOrderExecution`) y el **motivo del último rechazo**; no se
  mezclan ciclos anteriores (coherente con la decisión H-001 de 007).
- **Motivo con datos sensibles**: el motivo ya se guarda **saneado / sin PII cruda** (Constitution XI); se sirve
  tal cual (saneado). Nunca se expone `object_ref` ni PII cruda.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001** (detalle por visibilidad): WHEN un usuario autenticado pide el detalle de una orden **visible para
  su rol** (mismo criterio de alcance que 002a: technician = sus órdenes activas; supervisor = `pending_review`;
  dispatcher = `assigned`/`in_progress`) THE sistema SHALL devolver `200` con el detalle: `id`, `title`,
  `description`, `status`, `assigned_to`, `version`, `created_at`, `updated_at` (ISO-8601 UTC). **`evidence`
  SIEMPRE está presente** (`{count:0, content_types:[]}` si no hay ciclo); **`notes` y `last_rejection_reason`
  son opcionales y se OMITEN** del JSON cuando no aplican (convención uniforme, no `null`).
- **FR-002** (notas + metadatos de evidencia del ciclo vigente — mínimo privilegio): THE detalle SHALL incluir
  las **notas de ejecución** y los **metadatos de evidencia** `{ count, content_types }` (donde `content_types`
  es la **lista** de `content_type` por evidencia del ciclo, duplicados posibles) del **ciclo vigente** (el
  `auditId` del último `submitOrderExecution`) **solo para el technician dueño y el supervisor** (quienes
  ejecutan/revisan el trabajo). El **dispatcher NO** recibe notas ni metadatos de evidencia (su función es
  asignar/reasignar, no necesita el trabajo del técnico ni datos de cliente — mínimo privilegio): su detalle se
  limita a los campos de la orden. **Nunca** el `object_ref` crudo ni el binario.
- **FR-003** (motivo del último rechazo — lectura acotada, opción B): WHEN el **technician dueño** pide el detalle
  de SU orden y ésta tiene un **rechazo SIN atender** THE sistema SHALL incluir el **motivo del último rechazo**
  leído de **`OrderAudit.reason` de la última transición de rechazo de esa orden**, habilitado por la **excepción
  de mínimo privilegio de Constitution XI (≥ v1.9.0)** (solo el `motivo`, solo la última transición de rechazo,
  solo de una orden asignada al propio actor; no abre el resto del registro).
  - **Regla de "rechazo sin atender" (atado al ciclo, resuelve la mezcla de ciclos):** el motivo se incluye **si y
    solo si** la última transición de rechazo es **posterior** al último `submitOrderExecution` de la orden (i.e.
    la orden está en `in_progress` tras un rechazo y **aún no** se ha reenviado). Tras el reenvío (→
    `pending_review`) el motivo se **omite**. Así las notas/evidencia (del último submit) y el motivo pertenecen
    **siempre al mismo ciclo**; nunca se mezcla el motivo del ciclo N-1 con notas del ciclo N.
  - **Saneo al leer (defensa en profundidad, resuelve la PII histórica):** el motivo se pasa por el **detector/
    redactor de PII estructurada compartido** (`domain/ai/pii-redactor`, de 007) **antes** de servirlo — así, aun
    si un motivo histórico se guardó sin sanear, no se filtra PII estructurada al técnico. Esto **define** el
    criterio de "PII cruda" verificable de SC-004.
  - Sin columna denormalizada, sin tocar 004/005/006, sin migración.
- **FR-004** (RBAC + no-enumeración): WHEN el usuario no está autenticado THE sistema SHALL responder `401`;
  WHEN un usuario autenticado pide una orden **no visible** para su rol (inexistente, ajena, `orderId`
  malformado, o fuera de su alcance de estado) THE sistema SHALL responder **`404` genérico e indistinguible**,
  **sin** revelar existencia (coherente con 002a/006). El endpoint es de **lectura abierto a los tres roles**
  autenticados; la **visibilidad filtra a `404`** — **no se usa `403`** en este endpoint (un `403` sobre un
  `orderId` concreto rompería la no-enumeración). `closed` no está en el alcance de ningún rol → `404` (detalle
  de cerradas fuera de #010).
- **FR-005** (quién ve el motivo — mínimo privilegio): **SOLO el technician dueño ACTUAL** (`assigned_to` = el
  actor) ve el motivo, para corregir su orden con rechazo sin atender. **Supervisor y dispatcher NO** lo reciben
  (el supervisor ya lo conoció al escribirlo; su alcance —`pending_review`— no contiene rechazos sin atender). El
  technician **nunca** ve el motivo de otra orden ni ningún otro registro de auditoría. **Reasignación:** si una
  orden con rechazo sin atender se reasigna a otro técnico, el **nuevo dueño** ve el motivo — es correcto: ahora
  es **su** responsabilidad corregirla, y el motivo (saneado, FR-003) describe el trabajo a rehacer, no datos
  personales del técnico anterior. El campo se **omite** para todo rol/actor que no sea el dueño actual.
- **FR-006** (no-fuga de PII): THE respuesta y los logs SHALL **no** contener `object_ref` crudo, uuids internos
  innecesarios ni **PII estructurada**; solo `id`/metadatos (conteo, `content_type`) + el motivo **saneado**.
  **Definición verificable de "PII cruda"** = lo que detecta el **detector estructural compartido**
  (`domain/ai/pii-redactor` de 007: email/teléfono/DNI-NIF/NIE/matrícula/IBAN/tarjeta); el motivo servido pasa
  por él y la respuesta no contiene ninguno de esos patrones (aserción de test, no juicio subjetivo).
- **FR-007** (read-only): THE endpoint SHALL ser de **lectura pura** (GET), sin mutar estado ni versión, sin
  efectos secundarios, y **sin** servir el binario de evidencia (eso es #007-subida).
- **FR-008** (contrato): THE respuesta `200` SHALL ajustarse a un `OrderDetailResponse` versionado en
  `contracts/*.openapi.yaml` (OpenAPI 3.1, ruta bajo `/v1`); los errores usan `{code, message, details,
  agent_action}` (**401/404/500/503**, sin 403; convención transversal 001/006).

### Key Entities *(include if data involved)*

- **Order** (002a): se **lee** (estado + campos + visibilidad). No se muta ni se le añaden campos.
- **OrderAudit** (003/006): se **lee acotadamente** — solo `reason` de la **última transición de rechazo** de la
  propia orden del técnico (excepción XI ≥ v1.9.0). No se expone el resto del registro.
- **OrderExecutionNotes / OrderEvidence** (005): **fuente** de notas + metadatos del ciclo vigente; se **leen**;
  nunca `object_ref` crudo.
- **Motivo del último rechazo**: `OrderAudit.reason` de la última transición de rechazo de la orden, **leído
  acotadamente** (excepción XI ≥ v1.9.0) y **saneado al leer** (pii-redactor de 007) antes de servirlo; se muestra
  solo si el rechazo está **sin atender** (FR-003) y solo al **técnico dueño** (FR-005).
- **OrderDetailResponse** (efímera): DTO de lectura `{ order, notes?, evidence:{count,content_types}, last_rejection_reason? }`
  (forma exacta en `/plan`). Sin PII cruda.

## Success Criteria *(mandatory)*

- **SC-001** (detalle visible): el 100% de las peticiones de una orden **visible para el rol** devuelven `200`
  con el detalle correcto (estado + notas/metadatos del ciclo vigente).
- **SC-002** (motivo al técnico): el 100% de las órdenes propias con **rechazo SIN atender** (última transición
  de rechazo posterior al último `submitOrderExecution`) muestran al technician dueño el **motivo saneado**; el
  100% de las órdenes **ya reenviadas** (en `pending_review`) o **no propias** **omiten** el motivo. (Criterio
  medible: el estado "rechazo sin atender" está definido por comparación de timestamps, FR-003.)
- **SC-003** (RBAC + no-enumeración): el 100% de las peticiones sin autenticar son `401` y el 100% de las
  peticiones fuera del alcance del rol son `404` genérico (**sin 403** en este endpoint); **0** fugas de
  existencia entre roles.
- **SC-004** (no-fuga de PII): **0** apariciones de `object_ref` crudo ni PII cruda en la respuesta o los logs.
- **SC-005** (excepción XI de mínimo privilegio respetada): el technician **solo** puede leer el motivo de la
  última transición de rechazo de **su propia** orden; **no** puede leer el de otra orden, ni otras transiciones,
  ni accesos denegados, ni el resto del registro de auditoría (verificado por test: 403/404 en esos casos).

## Contrato (OpenAPI) *(obligatorio — Constitution II)*

- **Fichero**: extiende `contracts/orders.openapi.yaml` (OpenAPI 3.1), reutilizando `bearerAuth`/`ErrorResponse`.
- **Endpoint** (propuesta; forma exacta en `/plan`): `getOrderDetail` — `GET /orders/{orderId}` — roles
  technician/supervisor/dispatcher (según visibilidad) — respuestas `200 / 401 / 404 / 500 / 503` (**sin 403**:
  la visibilidad filtra a 404, no-enumeración).
- **Esquema** `OrderDetailResponse` (order + notes? + evidence metadata + last_rejection_reason?).

## Trazabilidad (RF → endpoint → tarea → test) *(obligatorio — Constitution VI)*

| FR | Endpoint | Test(s) (nombres previstos) |
| ---- | -------- | --------------------------- |
| FR-001 | `getOrderDetail` | `should return order detail for a visible order per role` |
| FR-002 | `getOrderDetail` | `should include current-cycle notes + evidence metadata (no object_ref)` |
| FR-003 | `getOrderDetail` | `should include last rejection reason read from OrderAudit scoped to own order (XI v1.9.0 exception)` |
| FR-004 | `getOrderDetail` | `should 404 generic (no 403) for out-of-scope/nonexistent/malformed/closed; 401 unauth` |
| FR-005 | `getOrderDetail` | `only owning technician sees reason; supervisor/dispatcher never; no other order/audit` |
| FR-006 | `getOrderDetail` | `should never leak object_ref/PII in body or logs` |
| FR-007 | `getOrderDetail` | `should be read-only (no state/version mutation)` |
| FR-008 | `getOrderDetail` | contract test × 200/401/404/500/503 (sin 403) |

> Se mantiene en `docs/traceability.md`. Los `T0xx` los asigna `/speckit-tasks`.

## Assumptions

- **Visibilidad reutilizada** de 002a (mismo `orderScopeFor` por rol) y coherente con el 404 no-enumeración de
  004/005/006. No se redefine la política de alcance.
- **Ciclo vigente** = el `auditId` del último `submitOrderExecution` (misma decisión que 007 H-001), para no
  mezclar ciclos del bucle de 006.
- **Motivo por lectura acotada (opción B), XI v1.9.0**: el motivo se **lee de `OrderAudit.reason`** de la última
  transición de rechazo, **acotado a la propia orden del técnico**, por la **excepción de mínimo privilegio de
  Constitution XI ≥ v1.9.0**. **Sin columna, sin tocar 004/005/006, sin migración, sin backfill** (se descartó la
  denormalización por invasiva y por riesgo de PII no saneada en el backfill). BL-070 se cierra con la enmienda
  acotada de XI, justificada por el bucle de 006.
- **Solo el técnico dueño ve el motivo**: supervisor y dispatcher **no** lo reciben en el detalle (su alcance ni
  siquiera contiene órdenes rechazadas; el supervisor ya lo conoció al escribirlo).
- **Aislamiento (residual `BL-074`)**: supervisor/dispatcher ven datos de cliente (notas/metadatos) de **cualquier**
  orden de su alcance de estado en la organización, porque el modelo es de **organización única** (multi-tenant
  fuera por Constitution, YAGNI). No es un defecto de #010; la segmentación por equipo/tenant es backlog.
- **`closed` fuera de alcance**: el detalle de órdenes cerradas no se expone en #010 (necesidad futura, no del brief).
- **Read-only puro**: #010 no muta nada (ni añade campos); el binario de evidencia (descarga) es #007-subida,
  fuera de alcance.
- **Alcance del técnico** = sus órdenes en `assigned`/`in_progress`/`pending_review` (reutiliza `orderScopeFor`
  de 002a), de modo que ve su orden **tras reenviar** (pending_review) y **tras rechazo** (in_progress).
- **`draft` fuera de alcance**: ningún rol lee el detalle de una orden `draft` (pre-asignación, fuera del flujo
  del brief) → `404`. Igual que `closed`. Documentado (no es fuga; es alcance intencional).
- **Saneo del motivo al leer**: reúso del `pii-redactor` compartido de 007 (`domain/ai/pii-redactor`) sobre el
  motivo antes de servirlo → independiente de si 006 saneó históricamente; define "PII cruda" verificable (SC-004).
