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
- `reason` puede contener texto libre con posible PII → **no se loguea** (reutiliza redacción de 001).

## Requirements *(mandatory)*

### Functional Requirements (EARS)

- **FR-001**: THE sistema SHALL definir una **tabla de transiciones legales** determinista de Order:
  `draft→assigned`, `assigned→in_progress`, `in_progress→pending_review`, `pending_review→closed`,
  `pending_review→in_progress` (rechazo). Cualquier otra (incl. mismo estado y desde `closed`) es ilegal.
- **FR-002**: WHEN se solicita una transición cuyo par (origen→destino) **no** está en la tabla, THE sistema
  SHALL responder con `INVALID_TRANSITION` (mapea a **422**) y **no** producir ningún efecto.
- **FR-003**: WHEN `expectedVersion` no coincide con la `version` actual de la orden, THE sistema SHALL
  responder `VERSION_CONFLICT` (mapea a **409**) y **no** producir ningún efecto (concurrencia optimista).
- **FR-004**: WHEN la transición es legal y la versión coincide, THE sistema SHALL, **atómicamente** (todo o
  nada): (a) actualizar `status` al destino, (b) incrementar `version` en 1, (c) insertar un registro de
  auditoría de la transición. Si cualquier paso falla, no se aplica ninguno.
- **FR-005**: THE registro de auditoría (`OrderAudit`) SHALL ser **append-only**: solo inserción; nunca
  update ni delete. Registra `order_id`, `actor_id`, `from_status`, `to_status`, `reason`, `at`.
- **FR-006**: THE maquinaria (FSM + applyTransition + auditoría) SHALL residir en el dominio, reutilizable por
  003/004/005; **NO** decide qué rol puede cada transición ni la pertenencia (eso lo aplican esas features
  antes de invocarla).
- **FR-007**: THE errores SHALL usar el contrato accionable de 001 (`{code,message,details?,agent_action?}`);
  `reason`/notas NUNCA se serializan a logs (observabilidad sin PII).
- **FR-008**: THE concurrencia optimista SHALL implementarse de forma que dos transiciones concurrentes sobre
  la misma orden no puedan ambas tener éxito (a lo sumo una; la otra → `VERSION_CONFLICT`).

### Key Entities

- **OrderAudit** (append-only): `id` (UUID v7), `order_id` (FK→Order), `actor_id` (FK→User), `from_status`,
  `to_status` (OrderStatus), `reason` (texto, posible PII → no logueado), `at` (timestamptz). Inmutable.
- **Transición** (valor de dominio): `{ from, to }` sobre `OrderStatus`; la tabla de legales es la FSM.

## Success Criteria *(mandatory)*

- **SC-001**: El 100% de las transiciones legales de la tabla se aplican con status+version+auditoría
  consistentes; el 100% de las ilegales se rechazan (422) sin efecto.
- **SC-002**: Bajo dos transiciones concurrentes sobre la misma orden, **exactamente una** tiene éxito y hay
  **exactamente un** registro de auditoría nuevo (la otra → 409), verificado con un test de concurrencia real.
- **SC-003**: Ningún registro de auditoría puede modificarse/borrarse tras crearse (append-only comprobado).
- **SC-004**: Ante fallo simulado de la escritura de auditoría, la orden **no** queda transicionada (atomicidad).

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
- `OrderAudit` es base-ready para la auditoría forense de accesos denegados (BL-002) sin ALTER destructivo.
- `actor_id` y `reason` los provee el llamador (003/004/005); 002b no los valida semánticamente, solo los
  registra en auditoría.
