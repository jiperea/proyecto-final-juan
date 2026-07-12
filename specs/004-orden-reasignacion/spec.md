# Feature Specification: Reasignación de una orden por el dispatcher

**Feature Branch**: `004-orden-reasignacion`

**Created**: 2026-07-11 · **Reformulada (magra, needs-first)**: 2026-07-12

**Status**: Draft

**Input**: Brief Func #1 — "Reasignación de orden por parte del dispatcher" ("reasignarla si hace falta"). Un
**dispatcher** reasigna una orden **reasignable** a otro técnico, conservando el estado, con auditoría
append-only atómica y RBAC dispatcher-only. Reutiliza el auth/RBAC de **001** y el patrón atómico +
`OrderAudit` de **002b** (inamovibles).

> **Alcance MVP (Constitution XV — specs pequeñas)**: esta feature es **sólo** la reasignación. El cluster de
> robustez/endurecimiento (concurrencia optimista explícita `If-Match`, paridad de latencia/cabeceras del 404,
> mapeo fino de errores de BD) queda **fuera** (stretch / deuda diferida), no embebido aquí. La reasignación
> equivale a la entrada **"003 (reasignación)"** del roadmap; la rama física es `004-orden-reasignacion`.

## Clarifications

### Session 2026-07-12 (reformulación magra)

- Q: ¿Semántica respecto a la FSM de 002b? → A: **Conserva el estado** (caso de uso propio `reassignOrder`
  que reutiliza el patrón atómico de 002b; **no** es transición de la FSM, no la extiende). Reasignar una orden
  `in_progress` la deja `in_progress`. `status`/`version` sólo se mutan desde el módulo write-side del dominio.
- Q: ¿Qué devuelve una orden NO reasignable (o inexistente / no visible) pedida por un dispatcher? → A: **404
  genérico** indistinguible (no-enumeración, hereda FR-009 de 002b). La visibilidad del dispatcher **es** el
  predicado `status ∈ {assigned, in_progress}`. Un `orderId` sintácticamente inválido se trata como el **mismo
  404** (no nombra ninguna orden). No hay 409 en el MVP (ver Scope: concurrencia = stretch).
- Q: ¿Cómo se audita la reasignación en `OrderAudit` (que tiene `from_status`/`to_status`)? → A: extensión
  **aditiva**: añadir `from_assignee`/`to_assignee` (FK→User, nullable) y `event_type`
  (`transition`|`reassignment`); **relajar `from_status`/`to_status` a NULLABLE** y dejarlos **NULL** en eventos
  `reassignment` (la reasignación no toca estado; el `event_type` los distingue). Migración aditiva; el trigger
  append-only y el comportamiento de 002b se conservan.
- Q: ¿Validación del técnico destino? → A: **Existe + rol `technician` + activo (`disabledAt IS NULL`) +
  distinto del asignatario actual**; cualquier fallo → **422** `INVALID_ASSIGNEE`.
- Q: ¿Concurrencia? → A: la corrección **no lost-update** no se sobre-diseña. UPDATE condicional atómico por
  (`id` ∧ `status` reasignable); `version`+1 (readiness). Dos reasignaciones concurrentes: **last-write-wins**
  (ambas legítimas, ambas auditadas). `If-Match`→409 explícito = **stretch** (BL-001), fuera del MVP.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Reasignar una orden a otro técnico (Priority: P1) 🎯 MVP

Un **dispatcher** ve una orden que necesita cambiar de técnico (el asignado no está disponible, sobrecarga,
cambio de zona). La reasigna a otro técnico, con un motivo. El sistema comprueba que quien pide es dispatcher,
que la orden es **reasignable** y que el técnico destino es válido; aplica el cambio de asignatario de forma
**atómica** y deja **rastro de auditoría inmutable** (quién, cuándo, de qué técnico a qué técnico, por qué).

**Why this priority**: es la primera acción de negocio que muta una orden vía HTTP (Func #1); habilita el
reparto del trabajo y ejercita el RBAC de 001 y la atomicidad/auditoría de 002b con un endpoint real.

**Independent Test**: contra Postgres real (dominio + integración HTTP con Supertest): un dispatcher
autenticado reasigna una orden reasignable a un técnico válido → **200**, `assigned_to` nuevo, `status` sin
cambio, `version`+1 y **exactamente una** fila de auditoría de reasignación. Un no-dispatcher, una orden no
reasignable o un técnico destino inválido son rechazados **sin efecto**.

**Acceptance Scenarios**:

1. **Given** una orden en `assigned` (técnico T1), **When** un dispatcher la reasigna a T2 con motivo, **Then**
   **200**, `assigned_to=T2`, `status=assigned` (sin cambio), `version`+1, y **1** fila de auditoría
   `{order_id, actor=dispatcher, event_type=reassignment, from_assignee=T1, to_assignee=T2, reason, at}`
   (con `from_status`/`to_status` = NULL).
2. **Given** una orden en `in_progress`, **When** un dispatcher la reasigna, **Then** **200**, `assigned_to`
   cambia, `status` permanece `in_progress`, `version`+1 y se audita.
3. **Given** una orden en `pending_review`/`closed`/`draft` (no reasignable), **When** un dispatcher intenta
   reasignarla, **Then** **404** genérico indistinguible de inexistente, sin efecto.
4. **Given** una petición **sin credenciales válidas**, **When** se intenta reasignar, **Then** **401** sin
   revelar si la orden existe.
5. **Given** un **technician** o **supervisor** autenticado (no dispatcher), **When** intenta reasignar,
   **Then** **403** (`FORBIDDEN_ROLE`) sin efecto.
6. **Given** un dispatcher y un `orderId` **inexistente**, **no visible**, o **sintácticamente inválido**,
   **When** intenta reasignar, **Then** **404** con cuerpo **genérico idéntico** (no-enumeración), sin efecto.
7. **Given** un dispatcher y una orden reasignable, **When** el técnico destino **no existe**, **no es
   technician**, está **deshabilitado**, o es **el mismo** que el asignatario actual, **Then** **422**
   (`INVALID_ASSIGNEE`, cuerpo genérico idéntico para las 4 causas) sin efecto.
8. **Given** un dispatcher y una orden reasignable, **When** el `reason` falta o está vacío/whitespace o supera
   500 caracteres, **Then** **422** (`VALIDATION_ERROR`) sin efecto.

### Edge Cases

- **Orden reasignable sin asignatario** (`assigned_to == NULL`, caso real por `onDelete:SetNull` de 001/002a al
  borrar el técnico): reasignar a T2 es válido; `from_assignee` de la auditoría es **NULL**, `to_assignee=T2`.
- **`reason` con PII**: nunca se serializa en logs ni en cuerpos de error (residual heredado; ver Assumptions).
- **Error de base de datos**: se traduce a **500 genérico** sin filtrar detalle de Postgres.
- **Reasignaciones concurrentes** a la misma orden: last-write-wins (cada una atómica y auditada); sin 409 en
  el MVP.

## Requirements *(mandatory)*

### Functional Requirements (EARS)

- **FR-001** *(acción de negocio)*: WHEN un dispatcher autenticado solicita reasignar una orden **reasignable**
  a un técnico destino válido con un motivo, THE sistema SHALL cambiar `assigned_to` al destino, **conservar**
  el `status`, incrementar `version` en 1 e insertar **una** fila de auditoría de reasignación, respondiendo
  **200** con la orden actualizada.
- **FR-002** *(estados reasignables)*: THE sistema SHALL considerar reasignables **exactamente** los estados
  `assigned` e `in_progress`. La **visibilidad del dispatcher es ese predicado**; una orden en cualquier otro
  estado no está en su ámbito.
- **FR-003** *(RBAC dispatcher-only)*: WHEN quien solicita **no está autenticado** → **401**. WHEN está
  autenticado pero su rol **no es dispatcher** → **403** (`FORBIDDEN_ROLE`) sin efecto. La autorización se
  resuelve en backend (rol del token de 001), nunca desde parámetros del cliente.
- **FR-004** *(no-enumeración)*: THE visibilidad se resuelve con **una única consulta** `WHERE id=:orderId AND
  status IN ('assigned','in_progress')`. WHEN devuelve **0 filas** —orden **inexistente** o en estado **no
  reasignable**— THE sistema SHALL responder **404** con cuerpo **genérico idéntico** (mismo `code`, sin
  `details`) para ambas causas. Un `orderId` sintácticamente inválido (no-uuid) se valida **antes** de la
  consulta y responde el **mismo 404 genérico**. **Orden de comprobación**: (1) 401 si no autenticado; (2) 403
  si rol ≠ dispatcher; (3) 404 si la orden no es visible (incluye id malformado); (4) sólo con la orden visible
  se valida destino y motivo (422). Así el **422 nunca es alcanzable para una orden no visible**.
- **FR-005** *(validez del técnico destino)*: WHEN el técnico destino **no existe**, **no tiene rol
  technician**, está **deshabilitado** (`disabledAt` no nulo), o **coincide** con el asignatario actual, THE
  sistema SHALL responder **422** (`INVALID_ASSIGNEE`) sin efecto. THE cuerpo del 422 SHALL ser **genérico e
  idéntico** para las cuatro causas (mismo `code`/`message`, sin `details` que revele cuál falló).
- **FR-006** *(motivo obligatorio y validado)*: WHEN la petición **no** incluye `reason` con contenido
  no-whitespace de **1 a 500 caracteres**, THE sistema SHALL responder **422** (`VALIDATION_ERROR`). El
  `reason` es obligatorio en reasignación (a diferencia del opcional de 002b a nivel de dominio).
- **FR-007** *(atomicidad + auditoría append-only)*: WHEN la reasignación procede, THE sistema SHALL aplicar en
  **una sola transacción** (todo o nada): (a) `assigned_to`→destino, (b) `version`+1, (c) inserción de la fila
  de auditoría de reasignación. Si cualquier paso falla, la transacción **revierte** por completo. La auditoría
  es **append-only inmutable** (trigger de BD de 002b, conservado). `status`/`version` sólo se mutan desde el
  **módulo write-side del dominio** (junto a `applyTransition`), nunca por un camino ad-hoc (verificable por
  test de arquitectura).
- **FR-008** *(actor infalsificable)*: THE `actor_id` de la auditoría SHALL derivarse **exclusivamente** del
  contexto de autenticación verificado server-side (el `userId` del token de 001), **nunca** de un parámetro de
  la request.
- **FR-009** *(no-fuga de `reason` y saneo de errores)*: THE sistema SHALL garantizar que el valor de `reason`
  **no aparece** en ningún log ni en el cuerpo de error. WHEN se produce un error de base de datos, THE sistema
  SHALL responder **500** con cuerpo **genérico** `{code, message, agent_action}` **sin** filtrar detalle de
  Postgres (SQLSTATE, constraint, columna, query).

*Contrato de errores uniforme (Constitution): todo error responde `{code, message, details?, agent_action}`
con el HTTP correcto; `reason` y detalle de Postgres nunca aparecen en el cuerpo de error.*

### Key Entities *(include if feature involves data)*

- **Order** (existente, 002a/002b): se muta `assigned_to` (FK→User) y `version`; `status` se **conserva**.
  Estados reasignables: `assigned`, `in_progress`.
- **OrderAudit** (existente, 002b — append-only inmutable): se **extiende** de forma aditiva para registrar la
  reasignación. Esquema actual `{id, order_id, actor_id, from_status, to_status, reason, at}`; se **añaden**
  `from_assignee`/`to_assignee` (FK→User, nullable) y `event_type` (`transition`|`reassignment`), y se
  **relajan** `from_status`/`to_status` a **nullable**. En una reasignación: `event_type='reassignment'`,
  `from_status`/`to_status` = **NULL** (no cambia estado), par origen→destino en `from_assignee`/`to_assignee`.
  Rastro inmutable de quién/cuándo/de-quién→a-quién/por qué.
- **User** (existente, 001): el técnico destino debe existir y tener rol **technician** activo; el actor debe
  ser **dispatcher**.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001** *(happy path + auditoría)*: el 100% de las reasignaciones válidas responden **200**, cambian
  `assigned_to`, conservan `status`, incrementan `version` en 1 y crean **exactamente 1** fila de auditoría
  `reassignment` con `from_assignee`/`to_assignee` correctos y `from_status`/`to_status` NULL.
- **SC-002** *(matriz RBAC)*: el 100% de los casos de autorización responden el código correcto: sin auth →
  **401**; rol ≠ dispatcher → **403**; sin efecto en los rechazos.
- **SC-003** *(estados no reasignables)*: el 100% de los intentos sobre `pending_review`/`closed`/`draft`
  responden **404 genérico** indistinguible, sin efecto.
- **SC-004** *(no-enumeración)*: las respuestas 404 "no existe", "no visible" y "orderId inválido" tienen el
  **mismo cuerpo genérico** (mismo `code`, sin `details`); verificado por igualdad del cuerpo en test.
- **SC-005** *(técnico destino inválido)*: el 100% de los destinos inválidos (inexistente / no-technician /
  deshabilitado / igual al actual) responden **422** `INVALID_ASSIGNEE` con cuerpo genérico idéntico, sin efecto.
- **SC-006** *(motivo inválido)*: el 100% de los `reason` ausentes/vacíos/whitespace/>500 responden **422**
  `VALIDATION_ERROR`, sin efecto.
- **SC-007** *(atomicidad)*: WHEN se fuerza el fallo de la inserción de auditoría dentro de la transacción, THE
  orden **no** queda reasignada (`assigned_to`/`status`/`version` intactos; 0 filas de auditoría).
- **SC-008** *(no-fuga de `reason`)*: WHEN se envía una reasignación con un `reason` centinela único, THE valor
  **no aparece** en ningún log ni en el cuerpo de la respuesta de error (grep negativo).
- **SC-009** *(saneo de errores de BD)*: WHEN se fuerza un error de BD, THE respuesta es **500** con cuerpo
  genérico y **no** contiene SQLSTATE, nombre de constraint/columna ni fragmento de query.
- **SC-010** *(latencia)*: el p95 de la reasignación (happy path, BD de test local caliente, 50 peticiones
  secuenciales) responde en **< 300 ms**; correlation-ID presente en la respuesta y en los logs.

> Cada SC es **medible** (Constitution XIV) y se verifica con **Vitest + Supertest** contra Postgres real
> (dominio puro + integración HTTP). Esta feature no tiene componente IA → sin eval de promptfoo.

## Contrato (OpenAPI) *(obligatorio — Constitution II)*

Contract-first: el contrato se escribe/actualiza **antes** del código; el esquema Zod se deriva de él.

- **Fichero**: se **extiende** `contracts/orders.openapi.yaml` (002a) con la operación de reasignación.
- **Endpoint**: `reassignOrder` — `POST /v1/orders/{orderId}/reassignments` — rol `dispatcher` —
  respuestas: `200` (orden actualizada), `401`, `403`, `404` (genérico: inexistente / no visible / id
  inválido), `422` (`INVALID_ASSIGNEE` | `VALIDATION_ERROR`), `500`. *(Sin `409`/`If-Match` en el MVP.)*
- **Cuerpo**: `{ assignee_id (uuid), reason (string, 1..500) }`. Boundary `snake_case` externo /
  `camelCase` interno.
- **Errores**: `{ code, message, details?, agent_action }` con el HTTP correcto; `reason`/detalle de BD nunca
  presentes en el cuerpo de error.

## Trazabilidad (RF → endpoint → tarea → test) *(obligatorio — Constitution VI)*

Se mantiene sincronizada en `docs/traceability.md` (se completa en `/speckit-tasks`/Polish). Un FR sin test no
está "hecho". FR-001..009 → `reassignOrder`; SC-001..010 → tests de contrato/integración/unidad.

## Assumptions

- **Reutiliza**: RBAC/401-403/contrato de errores de **001**; `Order`/`version` de **002a**; patrón atómico
  (UPDATE condicional + insert de auditoría en la misma transacción) / `OrderAudit` / trigger append-only de
  **002b**. 001/002a/002b son **inamovibles**; la extensión de `OrderAudit` es **aditiva** (no cambia su
  comportamiento).
- **Módulo write-side**: el "único punto de escritura de `status`/`version`" (FR-006 de 002b) se reconcilia
  como "el módulo write-side del dominio" (`applyTransition` + `reassignOrder`); verificable por test de
  arquitectura.
- **Concurrencia**: last-write-wins en el MVP (UPDATE condicional por `id` ∧ `status` reasignable; `version`+1
  como readiness). `If-Match`→409 explícito = **stretch** (BL-001).
- **`reason`**: pre-saneado por esta feature; PII cruda es residual heredado (cifrado en reposo **BL-051**,
  purga/anonimización **BL-055**, fuera de alcance).
- **Sin API de pago**: verificación 100% determinista (Vitest + Supertest + Postgres docker-compose de test);
  sin componente IA → sin eval de promptfoo.

## Scope

**Dentro (MVP)**: endpoint HTTP de reasignación (`reassignOrder`) bajo `/v1` con contrato OpenAPI 3.1 + Zod;
RBAC dispatcher-only (401/403/404/422/500); mutación atómica de `assigned_to` conservando estado + `version`+1
+ auditoría append-only atómica (OrderAudit extendido); validación de técnico destino; motivo obligatorio y
saneado; no-enumeración (cuerpo genérico); saneo de errores de BD; actor server-side; correlation-ID; latencia
cuantificada.

**Fuera / Stretch (aislado por XV — deuda diferida, no en este MVP)**:

- **Concurrencia optimista explícita** `If-Match`→409 `VERSION_CONFLICT` (BL-001, stretch).
- **Endurecimiento del 404** más allá del cuerpo genérico: paridad de **cabeceras/latencia** byte-idénticas,
  colapso post-UPDATE con precedencia status>version (BL-061/062).
- **Mapeo fino de errores de BD** (P2003 por FK a 422; 503 fail-closed específico) (BL-063/064/066).
- **Auditoría forense** de accesos denegados (BL-002); cifrado en reposo de `reason` (BL-051); purga PII
  (BL-055).
- Creación/alta de órdenes, ejecución (roadmap 004), revisión (roadmap 005), resumen IA (roadmap 006),
  notificaciones, multi-tenant.
