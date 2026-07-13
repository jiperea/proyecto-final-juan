# Feature Specification: Registro de ejecución por el técnico

**Feature Branch**: `005-registro-ejecucion`

**Created**: 2026-07-13

**Status**: Draft

**Input**: Brief Func #2 — "Registro de ejecución por parte del técnico, con al menos una foto de evidencia".
Roadmap #004. Un **technician** inicia el trabajo de **su** orden (`assigned→in_progress`) y **registra la
ejecución** (`in_progress→pending_review`) adjuntando **≥1 evidencia fotográfica válida** y notas. Reutiliza el
auth/RBAC de **001** y el patrón atómico + `OrderAudit` de **002b** (inamovibles).

> **Alcance MVP (Constitution XV — specs pequeñas)**: sólo las dos acciones del técnico y la **validación de
> evidencia por referencia**. El **transporte binario** de la foto (subida/almacenamiento/URLs firmadas) es una
> feature aparte del roadmap (**#007 / BL-068**), no se embebe aquí. Equivale a la entrada **"004 (ejecución)"**
> del roadmap; rama física `005-registro-ejecucion`.

## Clarifications

### Session 2026-07-13

- Q: ¿Quién puede iniciar/registrar y sobre qué órdenes? → A: **technician** sobre **su propia** orden
  (`assigned_to == actor`). Otro rol → 403; orden **ajena/inexistente/no visible → 404** genérico
  (no-enumeración; hereda `GUARD_UNMET→404` fail-safe de 002b, FR-009); orden **propia en estado no legal → 422**
  (ver precedencia determinista en la clarificación de remediación). Reutiliza `applyTransition` (las
  transiciones `assigned→in_progress` e `in_progress→pending_review` ya son legales en la FSM de 002b).
- Q: ¿Cómo se modela la evidencia en el MVP? → A: **por referencia validada** (no transporte binario). El
  técnico envía ≥1 evidencia como **referencia/metadato** `{object_ref, content_type, size_bytes}`; el sistema
  valida **≥1 presente**, `content_type` en allowlist de imágenes y `size_bytes ≤` máximo. La evidencia se
  registra **append-only** asociada a la orden, en la **misma transacción** que la transición y la auditoría.
  Sin ≥1 evidencia válida **no** se puede pasar a `pending_review` (bloqueante, Brief "al menos una foto"). La
  subida binaria real se difiere a la feature #007 (BL-068).
- Q: ¿Notas del técnico? → A: **obligatorias** al registrar ejecución (rastro operativo + insumo del resumen
  IA de #006); texto pre-saneado, longitud acotada, **nunca** en logs ni en cuerpos de error.
- Q: ¿Cota superior de evidencias por registro? → A: **máximo acotado** (valor concreto en plan, p.ej. ≤10);
  exceder el máximo → **422 `INVALID_EVIDENCE`** sin efecto. Junto al mínimo (≥1) delimita el array `evidence`.
- Q: ¿Qué es `object_ref` en el MVP? → A: **string opaco** validado por **formato** (no vacío, patrón/longitud
  acotada); **sin** comprobación de existencia del objeto (eso acoplaría con el almacenamiento de **#007**, que
  XV separa). Formato inválido → **422 `INVALID_EVIDENCE`**.
- Q: ¿Trato de `object_ref` en logs/errores? → A: como dato potencialmente PII: **nunca** en cuerpos de error;
  en logs sólo `id`/conteo de evidencia, **no** el `object_ref` crudo (mismo criterio que las notas, grep negativo).

### Session 2026-07-13 — remediación gate G1

- Q: **(B1)** ¿Qué código HTTP y en qué orden para orden ajena vs orden propia en estado no legal? → A:
  **precedencia determinista y única**, evaluada en un **guard compartido** (no duplicada por handler):
  `401` (no autenticado) → `403` (rol ≠ technician, `FORBIDDEN_ROLE`) → `404` genérico (orden
  inexistente/ajena/no visible; no-enumeración, `GUARD_UNMET→404`) → `422` (orden **propia** pero **estado de
  origen no legal** para la transición, `INVALID_TRANSITION`) → `422` (payload de evidencia/notas inválido). La
  **pertenencia se evalúa antes que el estado**: una orden ajena en estado no operable devuelve **404**, nunca
  422, para no filtrar su estado (Constitution IV, L119-129).
- Q: **(B2)** ¿Dónde se guardan las notas del técnico sin meter PII cruda en la auditoría inmutable? → A: en una
  entidad **`OrderExecutionNotes`** aparte (aditiva, cifrable/purgable — payload PII de Constitution IX).
  `OrderAudit.reason` recibe **sólo un marcador opaco constante saneado** (p.ej. `"execution_registered"`, **sin
  id embebido**), **nunca** el texto libre (Constitution XI L198-200, no excepcionable). El enlace auditoría↔notas
  es **unidireccional**: `OrderExecutionNotes.audit_id → OrderAudit` (se inserta la auditoría **primero**, luego
  las notas), evitando cualquier referencia circular de FKs en la transacción. Esta feature valida **forma** de
  las notas; no redacta PII de contenido (cifrado/purga automatizada trazada en backlog, fuera).
- Q: **(A1)** ¿Cómo anticipar el versionado de evidencia por intento (#005) sin migración no-aditiva? → A:
  columna **`attempt`** *nullable base-ready* en `OrderEvidence`, siempre `NULL` y sin lógica en este MVP
  (Constitution XI L196).
- Q: **(M1)** ¿`object_ref` duplicados en el array? → A: rechazo → **422 `INVALID_EVIDENCE`** (evita inflar el
  conteo repitiendo la misma referencia). La igualdad es **exacta** (byte a byte, case-sensitive, sin trim), por
  ser `object_ref` un identificador opaco.
- Q: **(H-003)** ¿`orderId` con formato inválido en la ruta? → A: cae en el **mismo bucket 404** genérico que
  "orden inexistente" (no un 400 distinto), para preservar la no-enumeración y la precedencia única.
- Q: **(M7/concurrencia)** ¿doble-clic o reasignación (004) concurrente? → A: `applyTransition` (002b) aplica un
  **UPDATE condicional atómico** con `version` (concurrencia optimista) y guard de pertenencia en el `WHERE`
  (cierra TOCTOU): un técnico reasignado a mitad → 0 filas afectadas → fail-safe (sin doble auditoría/evidencia).
  El If-Match→409 de cara al cliente es **#008**.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Iniciar el trabajo (Priority: P1) 🎯 MVP

Un **technician** con una orden **asignada** a él empieza a trabajarla. La marca como "en progreso".

**Independent Test**: un technician autenticado inicia una orden `assigned` **suya** → **200**, la orden queda
`in_progress`, `version`+1 y hay **1** auditoría de la transición. Sobre orden ajena / no `assigned` / otro rol
→ rechazado sin efecto.

**Acceptance Scenarios**:

1. **Given** una orden `assigned` al technician T, **When** T la inicia, **Then** **200**, `status=in_progress`,
   `version`+1, 1 auditoría `transition` (`from_status=assigned`, `to_status=in_progress`, `actor=T`).
2. **Given** una orden `assigned` a **otro** técnico (en cualquier estado), **When** T intenta iniciarla,
   **Then** **404** genérico (no-enumeración), sin efecto — la pertenencia se evalúa **antes** que el estado.
3. **Given** una orden **propia** de T ya `in_progress`/`pending_review`/`closed`, **When** T intenta iniciarla,
   **Then** transición no legal → **422** (`INVALID_TRANSITION`), sin efecto (es de T; propia + estado inválido → 422).
4. **Given** un usuario **no technician** (dispatcher/supervisor), **When** intenta iniciar, **Then** **403**
   (`FORBIDDEN_ROLE`) sin efecto. Sin credenciales → **401**.

### User Story 2 - Registrar la ejecución con evidencia (Priority: P1) 🎯 MVP

Un **technician** termina el trabajo de su orden `in_progress` y **registra la ejecución**: adjunta **≥1 foto
de evidencia** (por referencia) y notas; la orden pasa a **revisión** (`pending_review`).

**Independent Test**: un technician registra la ejecución de su orden `in_progress` con 1 evidencia válida y
notas → **200**, `status=pending_review`, `version`+1, **1** auditoría de la transición y la(s) evidencia(s)
registradas. Sin evidencia válida, con evidencia inválida, o sobre orden ajena/estado incorrecto → rechazado
**sin efecto** (ni transición, ni evidencia huérfana).

**Acceptance Scenarios**:

1. **Given** una orden `in_progress` del technician T, **When** T registra la ejecución con ≥1 evidencia válida
   y notas, **Then** **200**, `status=pending_review`, `version`+1, 1 auditoría `transition`
   (`in_progress→pending_review`, con las notas como motivo) y **≥1** fila de evidencia asociada.
2. **Given** una orden `in_progress` de T, **When** registra **sin** evidencia (0 elementos), **Then** **422**
   (`EVIDENCE_REQUIRED`) sin efecto (no transiciona).
3. **Given** una orden `in_progress` de T, **When** una evidencia tiene `content_type` no permitido,
   `size_bytes` > máximo, `object_ref` con formato inválido, hay `object_ref` **duplicados** en el array, o el
   array supera el **máximo de elementos**, **Then** **422** (`INVALID_EVIDENCE`) sin efecto.
4. **Given** una orden `in_progress` de T, **When** faltan/las notas son inválidas (vacías/whitespace/>máx),
   **Then** **422** (`VALIDATION_ERROR`) sin efecto.
5. **Given** una orden de **otro** técnico (en cualquier estado), **When** T registra ejecución, **Then** **404**
   genérico sin efecto (pertenencia antes que estado).
6. **Given** una orden **propia** de T en estado `assigned` (aún no iniciada), `pending_review` o `closed`,
   **When** T registra ejecución, **Then** transición no legal → **422** (`INVALID_TRANSITION`) sin efecto.

### Edge Cases

- **Fallo a mitad** (p.ej. la inserción de evidencia, auditoría **o notas** falla): la transición **revierte**
  por completo — la orden **no** queda en `pending_review` sin su evidencia/auditoría/notas (atomicidad todo-o-nada).
- **Orden ajena + estado no operable simultáneamente**: → **404** (la pertenencia se evalúa **antes** que el
  estado; nunca 422, para no filtrar el estado de un recurso al que el actor no tiene acceso).
- **Notas con PII**: se persisten cifradas en `OrderExecutionNotes` (**nunca** en `OrderAudit.reason`, ni en
  logs, ni en cuerpos de error); sujeta a la retención de PII (IX). Ver Assumptions.
- **Error de base de datos**: → **500 genérico** sin filtrar detalle de Postgres.

## Requirements *(mandatory)*

### Functional Requirements (EARS)

- **FR-001** *(iniciar trabajo)*: WHEN un technician autenticado inicia **su** orden en estado `assigned`, THE
  sistema SHALL transicionar a `in_progress`, incrementar `version` en 1 e insertar auditoría de la transición,
  respondiendo **200** con la orden actualizada. Reutiliza `applyTransition` (patrón atómico de 002b).
- **FR-002** *(registrar ejecución)*: WHEN un technician autenticado registra la ejecución de **su** orden en
  estado `in_progress` con **≥1 evidencia válida** y **notas válidas**, THE sistema SHALL, en **una sola
  transacción**: transicionar a `pending_review`, incrementar `version`, registrar la(s) evidencia(s)
  (append-only), insertar auditoría con `reason` = **marcador opaco constante saneado** (p.ej.
  `"execution_registered"`, **sin** texto libre — Constitution XI) y, **después** de la auditoría, **persistir
  las notas en `OrderExecutionNotes`** con `audit_id → OrderAudit` (payload PII, cifrable en reposo — IX;
  enlace unidireccional, sin ciclo de FKs), respondiendo **200**.
- **FR-003** *(RBAC + pertenencia + estado — precedencia única)*: THE evaluación de acceso SHALL seguir **siempre**
  el orden `401 → 403 → 404 (pertenencia) → 422 (estado) → 422 (payload)` en un **guard compartido** (no duplicado
  por handler): WHEN **no** autenticado → **401**; WHEN rol **no es technician** → **403** (`FORBIDDEN_ROLE`);
  WHEN la orden **no existe**, **no es suya** (`assigned_to ≠ actor`) o el `orderId` tiene **formato inválido** →
  **404** genérico indistinguible (no-enumeración, `GUARD_UNMET→404` de 002b/FR-009), **incluso si esa orden
  ajena está en estado no operable** (en el MVP, sin multi-tenant ni soft-delete, "no visible" ≡ inexistente∨ajena);
  WHEN la orden **sí es del actor** pero el **estado de origen no es legal** para la transición →
  **422** (`INVALID_TRANSITION`). La pertenencia se resuelve en backend y se comprueba **antes** que el estado
  (para no filtrar el estado de un recurso ajeno); nunca desde el cliente. Dentro del payload, la evidencia
  (`EVIDENCE_REQUIRED`/`INVALID_EVIDENCE`, FR-004) se valida **antes** que las notas (`VALIDATION_ERROR`,
  FR-005): si ambas fallan, se devuelve el error de **evidencia** (orden estable y testeable).
- **FR-004** *(evidencia validada, bloqueante)*: WHEN al registrar ejecución **no** hay al menos una evidencia
  → **422** (`EVIDENCE_REQUIRED`); WHEN alguna evidencia tiene `content_type` fuera de la allowlist de imágenes,
  `size_bytes` mayor que el máximo, `object_ref` con **formato inválido** (vacío o fuera del patrón/longitud
  acotada), hay `object_ref` **duplicados** en el array (igualdad **exacta**, byte a byte, sin normalización), o
  el array **supera el máximo de elementos** (cota
  superior; valor concreto en plan) → **422** (`INVALID_EVIDENCE`). Sin ≥1 evidencia válida (y ≤ máximo) la
  transición a `pending_review` **no** ocurre. La evidencia se valida **por referencia/metadato**: `object_ref`
  es un **string opaco** validado sólo por formato, **sin** comprobar la existencia del objeto (el transporte
  binario y su almacenamiento son la feature #007).
- **FR-005** *(notas válidas y saneadas)*: WHEN las notas faltan, están vacías/whitespace o superan la longitud
  máxima → **422** (`VALIDATION_ERROR`). Esta feature valida la **forma** de las notas (no vacías/whitespace/
  longitud) y las persiste en `OrderExecutionNotes`; **no** redacta PII de contenido (el cifrado/purga
  automatizada es BL-051/055, fuera del MVP). Las notas **nunca** aparecen en `OrderAudit.reason`, ni en logs, ni
  en cuerpos de error. Igualmente, `object_ref` (dato potencialmente PII) **nunca** aparece en cuerpos de error;
  en logs sólo se registran `id`/conteo de evidencia, **no** el `object_ref` crudo.
- **FR-006** *(atomicidad + append-only)*: THE transición, el registro de evidencia, la auditoría **y la
  persistencia de las notas en `OrderExecutionNotes`** SHALL aplicarse en **una sola transacción** (todo o nada);
  si **cualquiera** de los pasos falla —incluida la inserción de notas—, **revierte** por completo (sin
  evidencia, auditoría ni notas huérfanas, y sin dejar la orden en `pending_review` sin sus notas). La auditoría
  y la evidencia son **append-only inmutables** (trigger de BD); `OrderExecutionNotes` es mutable/purgable (IX).
  `status`/`version` sólo se mutan desde el **módulo write-side del dominio** (verificable por test de
  arquitectura).
- **FR-007** *(actor infalsificable)*: THE `actor_id` (auditoría) y el `uploaded_by` (evidencia) SHALL
  derivarse **exclusivamente** del token verificado server-side, **nunca** de un parámetro de la request.
- **FR-008** *(saneo de errores)*: WHEN se produce un error de base de datos, THE sistema SHALL responder
  **500** con cuerpo **genérico** `{code, message, agent_action}` **sin** filtrar detalle de Postgres.

*Contrato de errores uniforme: `{code, message, details?, agent_action}` con el HTTP correcto; notas y detalle
de BD nunca aparecen en el cuerpo de error.*

### Key Entities *(include if feature involves data)*

- **Order** (existente): se muta `status` (`assigned→in_progress`, `in_progress→pending_review`) y `version`.
- **OrderAudit** (existente, 002b — append-only): 1 fila `transition` por cada transición; en la ejecución,
  `reason` recibe **sólo un marcador opaco constante saneado** (p.ej. `"execution_registered"`, **sin id
  embebido**), **nunca** el texto libre de las notas (Constitution XI L198-200, no excepcionable).
- **OrderExecutionNotes** (nueva, aditiva): notas de ejecución del técnico, **separadas** de la auditoría.
  Campos: `{id, order_id (FK), audit_id (FK→OrderAudit — enlace unidireccional; la auditoría se inserta primero),
  notes (text, cifrable en reposo — IX), attempt (int, nullable — base-ready para el versionado por intento de
  #005; siempre NULL en este MVP). Invariante para #005: en un mismo registro de ejecución, el `attempt` de las
  notas y el de la(s) evidencia(s) comparten el **mismo valor** (se escriben en la misma transacción), created_by
  (FK→User), at}`. Es **payload PII**:
  sujeta a la política de retención/purga de IX (a diferencia de `OrderAudit`, que es forense inmutable) y a
  **lectura restringida por RBAC** (rol **supervisor** en función de auditoría; nunca un technician de otra
  orden, XI).
- **OrderEvidence** (nueva, append-only inmutable): referencia de evidencia asociada a la orden/ejecución.
  Campos: `{id, order_id (FK), object_ref, content_type, size_bytes, uploaded_by (FK→User), attempt (int,
  nullable — base-ready para el versionado por intento de #005, siempre NULL y sin lógica en este MVP), at}`.
  Trigger append-only (como `OrderAudit`). El **binario** no se almacena aquí (feature #007); sólo la
  referencia+metadato.
- **User** (existente, 001): el actor debe ser **technician** y **dueño** de la orden.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001** *(iniciar trabajo)*: el 100% de los inicios válidos responden **200**, dejan la orden
  `in_progress`, `version`+1 y crean **1** auditoría de la transición.
- **SC-002** *(registrar ejecución)*: el 100% de los registros válidos responden **200**, dejan la orden
  `pending_review`, `version`+1, crean **1** auditoría (con `reason` = referencia opaca, **sin** texto libre),
  **1** fila en `OrderExecutionNotes` con las notas, y **≥1** fila de evidencia asociada.
- **SC-003** *(precedencia RBAC + pertenencia + estado)*: el 100% de los casos responden el código correcto
  siguiendo el orden único `401 → 403 → 404 (pertenencia) → 422 (estado) → 422 (payload)`: sin auth → **401**;
  rol ≠ technician → **403**; orden **ajena/inexistente/no visible → 404** genérico indistinguible (incluso si
  esa orden ajena está en estado no operable); orden **propia en estado de origen no legal → 422**
  (`INVALID_TRANSITION`); en todos los casos sin efecto.
- **SC-004** *(evidencia bloqueante)*: el 100% de los registros **sin** ≥1 evidencia válida — o que excedan el
  **máximo de elementos**, o con `object_ref` de formato inválido — responden **422**
  (`EVIDENCE_REQUIRED`/`INVALID_EVIDENCE`) y la orden **no** transiciona.
- **SC-005** *(notas inválidas)*: el 100% de los registros con notas ausentes/vacías/>máx responden **422**
  (`VALIDATION_ERROR`), sin efecto.
- **SC-006** *(atomicidad)*: WHEN se fuerza el fallo del registro de evidencia, de la auditoría **o de las
  notas**, THE orden **no** transiciona (status/version intactos; 0 evidencias, 0 auditorías y 0 filas de
  `OrderExecutionNotes` nuevas de ese intento).
- **SC-007** *(no-fuga de notas/ref)*: WHEN se registra con notas y `object_ref` centinela, THE valor **no
  aparece** en ningún log ni en el cuerpo de la respuesta de error (grep negativo); en logs sólo consta `id`/conteo.
- **SC-008** *(saneo de errores de BD)*: WHEN se fuerza un error de BD, THE respuesta es **500** genérica sin
  SQLSTATE/constraint/columna/query.
- **SC-009** *(latencia)*: el p95 (happy path, BD de test local caliente, 50 peticiones secuenciales,
  nearest-rank) responde en **< 300 ms**; correlation-ID presente en respuesta y logs.

> Cada SC es **medible** (Vitest + Supertest contra Postgres real). Sin componente IA → sin eval de promptfoo.

## Contrato (OpenAPI) *(obligatorio — Constitution II)*

Contract-first: se **extiende** `contracts/orders.openapi.yaml`. Endpoints (operationId → método ruta → rol):

- `startOrderWork` — `POST /v1/orders/{orderId}/start` — rol `technician` — respuestas 200/401/403/404/422/500.
- `submitOrderExecution` — `POST /v1/orders/{orderId}/execution` — rol `technician` —
  cuerpo `{ notes (string 1..N), evidence: [{ object_ref (string, formato acotado), content_type (string), size_bytes (int) }] (1..MAX) }`
  — respuestas 200/401/403/404/422/500.
- Errores `{ code, message, details?, agent_action }`; notas/detalle de BD nunca en el cuerpo de error.
- *(Método/ruta definitivos confirmables en plan. Sin `409`/`If-Match` en el MVP.)*

## Trazabilidad (RF → endpoint → tarea → test) *(obligatorio — Constitution VI)*

Se sincroniza en `docs/traceability.md` (Polish). FR-001 → `startOrderWork`; FR-002/004/005/006 →
`submitOrderExecution`; FR-003 (precedencia RBAC/pertenencia/estado)/FR-007/008 → ambos. SC-001..009 → tests de
contrato/integración/unidad (incluye test de que orden ajena en estado no operable → 404, y de que
`OrderAudit.reason` no contiene el texto de las notas).

## Assumptions

- **Reutiliza**: RBAC/401-403/contrato de errores de **001**; `applyTransition`/`OrderAudit`/trigger
  append-only/patrón atómico y no-enumeración (`GUARD_UNMET→404`) de **002b**; `Order`/`version` de 002a.
  001/002 **inamovibles**; `OrderEvidence` y `OrderExecutionNotes` son **aditivas**.
- **Módulo write-side**: las nuevas transiciones se aplican vía el módulo write-side (`applyTransition`); el
  registro de evidencia es append-only en la misma transacción. Test de arquitectura: `status`/`version` sólo
  se mutan ahí. **(M5 — verificado)** `src/domain/order/transition-table.ts` ya declara legales
  `['assigned','in_progress']` e `['in_progress','pending_review']`; el guard de pertenencia vive en el `WHERE`
  atómico de `applyTransition`. No hay que tocar 002b (sigue inamovible).
- **Evidencia = referencia validada** en el MVP (`object_ref` + `content_type` + `size_bytes`). **(A2)** "evidencia
  válida" = `object_ref` **bien formado**; **no** garantiza la existencia física de la foto (eso es **#007**);
  límite comunicado a #005 (aprobar/rechazar) y #006 (resumen IA). El **transporte binario** es la feature **#007**
  (BL-068), no este MVP.
- **Notas** *(B2)*: esta feature valida **forma** (no vacías/whitespace/longitud) y persiste el texto en
  `OrderExecutionNotes` (payload PII sujeto a IX); **no** redacta PII de contenido. La **separación estructural**
  `OrderAudit.reason` opaco / notas en tabla aparte se fija **ya** en este MVP (Constitution XI, no excepcionable).
  **(S-001)** El cifrado en reposo y la purga automatizada de `OrderExecutionNotes.notes` requieren un **ítem de
  backlog propio** (los existentes BL-051/055 están scoped a `OrderAudit.reason`, no a esta tabla nueva); crear
  ese ítem antes del merge o aceptar explícitamente el riesgo residual con plazo. **(M4)** resuelto por diseño:
  `reason` deja de recibir texto libre, así que la longitud de notas se dimensiona contra
  `OrderExecutionNotes.notes`, sin relación con la columna `reason` de 002b.
- **(M6) Valores concretos a fijar en plan.md** (no en esta spec): MAX de elementos en `evidence`, longitud
  máxima de notas, patrón/longitud de `object_ref`, allowlist de `content_type`, `size_bytes` máximo. Todos son
  parámetros de validación (Zod derivado del contrato), no números mágicos en código.
- **(M7 — resuelto por diseño) Concurrencia**: `applyTransition` (002b) ya aplica un **UPDATE condicional
  atómico** con `version` (concurrencia optimista) + guard de pertenencia en el `WHERE` (cierra TOCTOU): dos
  requests concurrentes (doble-clic) o una reasignación de 004 a mitad → sólo una afecta 1 fila; el resto → 0
  filas → fail-safe (sin doble auditoría/evidencia). El `expectedVersion` que consume `applyTransition` se
  **deriva server-side** (el backend lee la versión vigente de la orden dentro del flujo); el **cliente no envía
  versión** → el cuerpo del contrato sigue siendo `{ notes, evidence }`, sin campo de versión. El `If-Match`→409
  **de cara al cliente** (semántica HTTP explícita) sigue siendo **#008**.
- **(M8) Lectura futura**: no hay endpoint de lectura en este MVP; cuando lo haya (#005/#007), la lectura de
  `OrderEvidence`/`OrderExecutionNotes`/`OrderAudit` respetará el mismo RBAC en doble capa (rol + pertenencia) y la
  retención de `object_ref`/notas seguirá la política de IX.
- **Sin API de pago**: verificación 100% determinista (Vitest + Supertest + Postgres docker-compose de test);
  sin IA → sin promptfoo.

## Scope

**Dentro (MVP)**: dos endpoints (`startOrderWork`, `submitOrderExecution`) bajo `/v1`; RBAC technician +
pertenencia con **precedencia determinista única** (`401→403→404 pertenencia→422 estado→422 payload`, guard
compartido); transiciones `assigned→in_progress` e `in_progress→pending_review` atómicas con auditoría (`reason`
opaco, sin PII); **validación de evidencia por referencia** (1..MAX elementos, sin duplicados, allowlist de tipo,
tamaño máx, `object_ref` por formato sin chequeo de existencia; bloqueante); notas obligatorias, validadas por
forma y persistidas en `OrderExecutionNotes`; entidades `OrderEvidence` (con `attempt` base-ready) y
`OrderExecutionNotes` aditivas; actor server-side; correlation-ID; latencia cuantificada.

**Fuera / Stretch (aislado por XV — planificado en el roadmap, no embebido)**:

- **Subida binaria de la evidencia** (multipart, almacenamiento de objetos, URLs firmadas ≤300 s, minimización
  de PII del binario) → **feature #007 del roadmap / BL-068**.
- **Endurecimiento write-side** (If-Match/409, paridad de latencia/cabeceras, mapeo fino de errores de BD) →
  **feature #008 / BL-001/061-066**.
- **Auditoría forense de accesos denegados** (XI) → **feature #009 / BL-002/067**. Evidencia versionada por
  intento → stretch.
- Aprobar/rechazar en revisión (roadmap #005), resumen IA (roadmap #006), reapertura, creación de órdenes,
  notificaciones, multi-tenant.
