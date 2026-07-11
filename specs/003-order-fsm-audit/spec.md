# Feature Specification: Order — máquina de estados + auditoría append-only (Fundación B-2)

**Feature Branch**: `003-order-fsm-audit`

**Created**: 2026-07-11

**Status**: Draft

**Input**: Feature 002b (roadmap) — write-side de la Fundación B: FSM explícita de Order + auditoría
append-only de transiciones, como **maquinaria** de dominio que consumirán 003/004/005. Slice pequeño (XV):
NO añade endpoints de negocio; reutiliza `Order`/`version` de 002a y errores/observabilidad de 001.

## Clarifications

### Session 2026-07-11

- Q: ¿002b expone endpoint o es dominio puro? → A: **Dominio puro, sin endpoint HTTP nuevo**; la maquinaria
  (`applyTransition`/FSM/auditoría) la consumen 003/004/005 (que añaden endpoints + RBAC + pertenencia).
  Contract-first **N/A** (no hay interfaz HTTP nueva); verificación por tests dominio+repositorio contra Postgres real.
- Q: ¿Tabla de transiciones legales? → A: **exactamente** `draft→assigned`, `assigned→in_progress`,
  `in_progress→pending_review`, `pending_review→closed`, `pending_review→in_progress` (rechazo). Cualquier otra
  (mismo estado, desde `closed`) → ilegal (`INVALID_TRANSITION`/422).
- Q: ¿`reason` obligatorio? → A: **opcional (nullable)** en 002b; la obligatoriedad por caso (p. ej. rechazo en
  005) la imponen 003/004/005, no 002b.
- Q: ¿`actor_id` en la auditoría? → A: **siempre requerido** (toda transición tiene un actor que provee el llamador).

**Cierres del gate G1 (mismo día):**

- Q: ¿Sanea PII de `reason` 002b o el llamador? → A: **el llamador** (003/004/005) — precondición testada por
  cada uno; 002b lo persiste y jamás lo saca en logs/errores (H-001, Const. XI).
- Q: ¿Concurrencia obligatoria pese a ser stretch? → A: 002b exige **consistencia (no lost-update)** como
  *correctness* mandatory; la **exposición If-Match→409** al cliente sigue siendo *stretch* (003/004). Se
  reconcilia el texto de la constitution en gobernanza (H-002, BL).
- Q: ¿Append-only cómo? → A: **a nivel de BD** (REVOKE UPDATE/DELETE o trigger), no solo por API (H-005).
- Q: ¿Bypass de `status`? → A: **prohibido**; único punto de escritura `applyTransition` (test arquitectura, H-004).
- Q: ¿`draft→assigned`? → A: **fuera** de la tabla (creación fuera del proyecto; sin llamador, H-007).
- Q: ¿`OrderAudit` cubre BL-002 (accesos denegados)? → A: **no**; esa auditoría es una entidad separada (H-003).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Transicionar una orden de forma segura y auditada (Priority: P1)

Un caso de uso de negocio (reasignación 003, ejecución 004, revisión 005) necesita cambiar el estado de una
orden. La maquinaria valida que la transición es **legal** según la FSM, la aplica con **concurrencia
optimista** y deja **rastro de auditoría inmutable**, todo de forma **atómica**.

**Why this priority**: es la base transaccional y de trazabilidad sobre la que se construyen todas las
acciones de negocio de FieldOps; sin ella, 003/004/005 no pueden mutar estado de forma consistente.

**Independent Test**: a nivel de dominio+repositorio contra Postgres real: una transición legal cambia
`status`, incrementa `version` y crea un registro de auditoría (todo o nada); una ilegal o con versión
obsoleta no deja ningún efecto.

**Acceptance Scenarios**:

1. **Given** una orden en `assigned` (version=0), **When** se aplica la transición a `in_progress` con
   `expectedVersion=0`, **Then** la orden queda en `in_progress` con `version=1` **y** existe un registro de
   auditoría `{from:assigned, to:in_progress, actor, reason, at}`.
2. **Given** una orden en `assigned`, **When** se intenta la transición a `closed` (no legal desde `assigned`),
   **Then** falla con `INVALID_TRANSITION` (→422) y **no** cambia la orden ni crea auditoría.
3. **Given** una orden en `assigned` (version=1), **When** se aplica una transición con `expectedVersion=0`
   (obsoleta), **Then** falla con `VERSION_CONFLICT` (→409) y **no** cambia la orden ni crea auditoría.
4. **Given** una transición legal, **When** la escritura de auditoría falla, **Then** la transición entera se
   revierte (atomicidad: la orden no cambia de estado sin su registro de auditoría).
5. **Given** un registro de auditoría existente, **When** se intenta modificarlo o borrarlo, **Then** la
   operación no está permitida (append-only e inmutable).

### Edge Cases

- Transición al **mismo** estado (no-op, p. ej. `in_progress`→`in_progress`) → `INVALID_TRANSITION` (no legal).
- Transición desde un estado **terminal** (`closed`) → `INVALID_TRANSITION`.
- Rechazo de revisión: `pending_review`→`in_progress` **es** legal (la usa 005).
- Dos transiciones concurrentes sobre la misma orden: solo una gana (la otra → `VERSION_CONFLICT`), sin doble
  auditoría ni estado inconsistente.
- `reason` es texto **pre-saneado** por el llamador → no PII cruda; **no se loguea ni va en errores**.
- `order_id` inexistente → `ORDER_NOT_FOUND` (**404**), sin efecto.
- `actor_id` inexistente → la FK de la auditoría falla y la transacción **revierte** entera (no efecto) — es
  también la técnica de test de atomicidad (SC-004).
- Transición ilegal Y versión obsoleta a la vez → la clasificación es determinista (version primero → 409).
- **Sin cancelación ni límite de rechazo** (decisión de alcance deliberada): 002b no define `*→cancelled` ni
  tope al ciclo `pending_review↔in_progress`; una vía de cancelación es feature futura (backlog).

## Requirements *(mandatory)*

### Functional Requirements (EARS)

- **FR-001**: THE sistema SHALL definir una **tabla de transiciones legales** determinista de Order:
  `assigned→in_progress`, `in_progress→pending_review`, `pending_review→closed`,
  `pending_review→in_progress` (rechazo). Cualquier otra (incl. mismo estado y desde `closed`) es ilegal.
  *(No se incluye `draft→assigned`: la creación/alta de órdenes está fuera del proyecto; `draft` es solo un
  estado semilla sin transición en el roadmap — H-007.)*
- **FR-002**: WHEN se solicita una transición cuyo par (origen→destino) **no** está en la tabla, THE sistema
  SHALL responder con `INVALID_TRANSITION` (mapea a **422**) y **no** producir ningún efecto.
- **FR-003** *(consistencia bajo concurrencia — correctness, NO el stretch If-Match)*: THE cambio de estado
  SHALL aplicarse mediante **un único UPDATE condicional atómico** `WHERE id=? AND version=expectedVersion AND
  status=<origen legal>`; si afecta 0 filas, THE sistema re-lee la orden para clasificar la causa:
  version distinta → `VERSION_CONFLICT` (**409**); origen no legal → `INVALID_TRANSITION` (**422**); orden
  inexistente → `ORDER_NOT_FOUND` (**404**). **Precedencia**: la condición atómica decide; ante ambas causas
  la re-lectura clasifica de forma determinista (version primero) — H-011.
- **FR-004** *(atomicidad)*: WHEN la transición procede, THE sistema SHALL, en **una sola transacción**
  (todo o nada): (a) `status`→destino, (b) `version`+1, (c) insertar el registro de auditoría. Si CUALQUIER
  paso falla (incl. FK de `actor_id`/`order_id` inexistente), la transacción **revierte** por completo: la
  orden no queda transicionada sin su auditoría.
- **FR-005** *(append-only, enforcement real)*: `OrderAudit` SHALL ser **append-only a nivel de base de datos**
  (no solo por ausencia de métodos): el rol de la aplicación tiene **REVOKE UPDATE, DELETE** sobre la tabla (o
  un trigger que rechace UPDATE/DELETE). Verificable: un intento de UPDATE/DELETE **falla con error de BD**.
- **FR-006** *(único punto de escritura)*: `Order.status`/`version` SHALL mutarse **exclusivamente** vía
  `applyTransition` (repositorio con un único método de transición; ningún otro camino escribe `status`/
  `version`). Verificable por test de arquitectura (H-004).
- **FR-007** *(separación de responsabilidades)*: LA maquinaria (`applyTransition` + FSM + auditoría) reside en
  el dominio como **función exportada reutilizable** por 003/004/005; **NO** decide rol ni pertenencia (lo
  aplican esas features antes de invocarla, revalidando pertenencia atómicamente si procede — ver Assumptions).
- **FR-008** *(PII de `reason`)*: `reason` es **texto pre-saneado por el llamador** (003/004/005) — precondición:
  **NO** debe contener PII cruda (Const. XI: auditoría con texto saneado). 002b lo persiste verbatim y
  **NUNCA** lo serializa en **logs NI en `details`/`agent_action`** de los errores. Cada feature consumidora
  tiene la responsabilidad (y el test) de sanear `reason` antes de invocar. `reason` es opcional; `actor_id`
  requerido.

### Key Entities

- **OrderAudit** (append-only, inmutable): `id` (UUID v7), `order_id` (FK→Order), `actor_id` (FK→User),
  `from_status`, `to_status` (OrderStatus), `reason` (texto **pre-saneado por el llamador**, sin PII cruda;
  nunca en logs/errores), `at` (timestamptz). Es la auditoría de **transiciones**; la auditoría forense de
  **accesos denegados** (BL-002) es una **entidad SEPARADA** (no se fuerza sobre este esquema — H-003).
- **Transición** (valor de dominio): `{ from, to }` sobre `OrderStatus`; la tabla de legales es la FSM.

## Success Criteria *(mandatory)*

- **SC-001**: El 100% de las transiciones legales de la tabla se aplican con status+version+auditoría
  consistentes; el 100% de las ilegales se rechazan (422) sin efecto.
- **SC-002** *(consistencia — correctness, mandatory; distinta del stretch If-Match de 003/004)*: bajo dos
  transiciones concurrentes sobre la misma orden, **como máximo una** tiene éxito (sin lost-update ni doble
  auditoría; la perdedora → 409), verificado por test de concurrencia real. La **exposición** `If-Match`→409 a
  clientes es *stretch* y vive en 003/004 (H-002; reconciliación de la constitution → backlog).
- **SC-003**: Un intento de UPDATE/DELETE sobre `OrderAudit` **falla con error de BD** (append-only enforce a
  nivel de BD, no solo por API — comprobado).
- **SC-004** *(atomicidad, sin mockear ORM — Const. VII)*: se fuerza el fallo de la inserción de auditoría con
  un **`actor_id` inexistente** (viola la FK dentro de la transacción); resultado: la orden **no** queda
  transicionada (status/version intactos, 0 filas de auditoría) — atomicidad real contra Postgres.

## Scope

**Dentro**: FSM (tabla de transiciones legales), caso de uso `applyTransition` (validación + concurrencia
optimista + auditoría atómica), entidad `OrderAudit` append-only, catálogo de errores INVALID_TRANSITION(422)
/VERSION_CONFLICT(409), verificación por dominio+repositorio contra Postgres real.

**Fuera** (otras features): endpoints HTTP de transición y su RBAC/pertenencia (003 reasignación, 004
ejecución, 005 revisión), evidencia/fotos, resumen IA, creación/alta inicial de órdenes (fuera del proyecto),
auditoría forense de accesos denegados (base-ready, comportamiento en BL-002), multi-tenant.

## Assumptions

- **Congelado en `## Clarifications`**: 002b es **dominio puro** (sin endpoint; endpoints en 003/004/005),
  tabla de transiciones fija, `reason` opcional, `actor_id` requerido.
- Reutiliza `Order`/`version` de 002a y error-mapper/logger/config de 001.
- `OrderAudit` audita **transiciones**; la auditoría de **accesos denegados** (BL-002) es otra entidad
  (no se fuerza sobre este esquema) → se diseñará cuando se aborde BL-002.
- `actor_id`/`reason` los provee el llamador (003/004/005): `actor_id` requerido; `reason` **pre-saneado** (sin
  PII cruda). 002b no valida semánticamente, pero SÍ garantiza que `reason` nunca sale en logs/errores.
- **Pertenencia + concurrencia (para 003/004/005)**: la comprobación de pertenencia (p. ej. `assigned_to==user`)
  debe **revalidarse dentro** de la condición atómica de `applyTransition` (misma `expectedVersion`) para
  evitar TOCTOU frente a una reasignación concurrente (S-004); 002b expone el UPDATE condicional que lo permite.
- Cifrado en reposo / control de lectura de `reason` en `OrderAudit`: fuera de 002a/b (infra) → backlog.
