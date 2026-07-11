---
description: "Task list — 002b Order FSM + auditoría append-only (write-side, dominio puro)"
---

# Tasks: Order — máquina de estados + auditoría append-only (Fundación B-2)

**Input**: `specs/003-order-fsm-audit/` (spec FR-001..009 / SC-001..006, plan, research D1-D8, data-model)

**Tests**: OBLIGATORIOS (Constitution VII — TDD fase Red verificable; Postgres real, sin mockear ORM).
**Arquitectura**: hexagonal — `domain/order` sin infra. **Dominio puro**: SIN endpoint HTTP (contract-first N/A).
**Reutiliza 001/002a**: Order/version/assignedTo, error-mapper, logger (redacción), config, Prisma/Postgres, container.

## Format: `[ID] [P?] [Story] Descripción (FRs) — ruta`

---

## Phase 1: Setup

- [ ] T001 Añadir modelo Prisma `OrderAudit` (id UUID v7, order_id FK→Order `onDelete: Restrict`, actor_id
  FK→User, from_status, to_status OrderStatus, reason text?, at) + índice `@@index([orderId])` + migración que
  crea función + **TRIGGER `BEFORE UPDATE OR DELETE ON order_audit`** que lanza excepción (append-only,
  **independiente del propietario** — NO `REVOKE`, el rol `fieldops` es owner, G2:S-002), con **`down`
  reversible** (`DROP TRIGGER`/`DROP FUNCTION` antes del `DROP TABLE`) — `backend/prisma/schema.prisma`,
  `backend/prisma/migrations/` (FR-005, data-model, D5)

---

## Phase 2: Foundational

- [ ] T002 [P] **[Red]** Unit FSM `isLegalTransition(from,to)` exhaustivo — legales (assigned→in_progress,
  in_progress→pending_review, pending_review→closed, pending_review→in_progress) true; todas las demás (mismo
  estado, desde closed, `draft→*`) false — `backend/tests/unit/transition-table.spec.ts` (FR-001/002)
- [ ] T003 FSM: tabla de transiciones + `isLegalTransition` (sin `draft→assigned`) —
  `backend/src/domain/order/transition-table.ts` (FR-001, D1)
- [ ] T004 [P] Errores de dominio en el catálogo `ErrorCode` + error-mapper de 001:
  `INVALID_TRANSITION`(422), `VERSION_CONFLICT`(409), `ORDER_NOT_FOUND`(404), **`GUARD_UNMET`** (sin status HTTP
  fijo; mapeo por el llamador vía FR-009) y **`ACTOR_INVALID`** (fallo de FK de actor_id; error interno, sin
  filtrar BD) — `backend/src/domain/result.ts`, `backend/src/handlers/error-mapper.ts` (FR-002/003/004, D7)
- [ ] T005 [P] Puerto `OrderTransitionPort.applyTransition({orderId,toStatus,actorId,reason?,expectedVersion,guard?})`
  con `guard` tipado `{ assignedTo?: string }` — `backend/src/domain/order/transition-ports.ts` (Const. III, FR-007)

---

## Phase 3: User Story 1 — Transición segura y auditada (P1) 🎯

**Goal**: `applyTransition` valida FSM + concurrencia optimista + guarda de pertenencia + auditoría atómica.
**Independent Test**: dominio+repositorio contra Postgres real.

### Tests Red ⚠️

- [ ] T006 [P] [US1] **[Red]** Unit `applyTransition` (use case) con puerto fake: transición legal delega en el
  repo con el par correcto; ilegal (`isLegalTransition` false) → `INVALID_TRANSITION` sin tocar repo —
  `backend/tests/unit/apply-transition.spec.ts` (FR-002/007)
- [ ] T007 [P] [US1] **[Red]** Integration (Postgres real) transición legal **parametrizada sobre las 4
  transiciones legales**: en cada una `status`→destino, `version`+1, **1 fila** de OrderAudit
  con {from,to,actor,reason,at}, todo en la misma transacción —
  `backend/tests/integration/order-transition.spec.ts` (FR-001/004, SC-001)
- [ ] T008 [P] [US1] **[Red]** Integration efectos negativos SIN efecto, en **orden determinista**: `orderId`
  inexistente→`ORDER_NOT_FOUND`(404); `expectedVersion` obsoleta→`VERSION_CONFLICT`(409);
  ilegal→`INVALID_TRANSITION`(422) (status/version/auditoría inalterados) —
  `backend/tests/integration/order-transition-errors.spec.ts` (FR-002/003, SC-001)
- [ ] T009 [P] [US1] **[Red]** Integration **atomicidad** (SC-004): `actor_id` inexistente → FK falla dentro de
  `$transaction` → rollback (status/version intactos, 0 auditoría) **+ aserta `ACTOR_INVALID`** y que el
  **mensaje crudo de Postgres NO se propaga** — `backend/tests/integration/order-transition-atomicity.spec.ts`
  (FR-004, SC-004, G1:H-009)
- [ ] T010 [P] [US1] **[Red]** Integration **append-only** (SC-003): un `UPDATE`/`DELETE` directo sobre
  `order_audit` **con el rol de runtime de la app** → **error de BD por el TRIGGER** —
  `backend/tests/integration/order-audit-append-only.spec.ts` (FR-005, SC-003)
- [ ] T011 [P] [US1] **[Red]** Integration **concurrencia** (SC-002): dos `applyTransition` con la **misma
  `expectedVersion`** vía `Promise.all` → **exactamente una** gana (`version`+1, 1 auditoría), la otra
  `VERSION_CONFLICT`; **+** caso secuencial determinista de version obsoleta (NO afirmar "falla si se
  serializa") — `backend/tests/integration/order-transition-concurrency.spec.ts` (FR-003, SC-002)
- [ ] T012 [P] [US1] **[Red]** Integration **guarda de pertenencia** (SC-005): `guard.assignedTo` que no
  coincide → 0 filas → **`GUARD_UNMET`** (assert explícito), sin auditoría; **+ TOCTOU determinista
  secuencial**: mutar `assigned_to` en una transacción confirmada y luego aplicar con la guarda obsoleta →
  `GUARD_UNMET` — `backend/tests/integration/order-transition-guard.spec.ts` (FR-003/007, SC-005)
- [ ] T013 [P] [US1] **[Red]** Integration **no-fuga de `reason`** (SC-006): forzar un error con un `reason`
  centinela → `reason` **NO** aparece en logs **ni** en `details`/`agent_action` del error serializado —
  `backend/tests/integration/order-audit-redaction.spec.ts` (FR-008, SC-006, G1:S-002)
- [ ] T014 [P] [US1] **[Red]** Arquitectura (FR-006): `domain/order` no importa infra + **`status`/`version`
  sólo se escriben en el repo de transición**, verificado por **búsqueda estática** (grep/AST) de cualquier
  `.update(...)`/`$executeRaw` sobre `order.status`/`version` fuera de `order-transition-repository.ts`
  (incluye confirmar que el repo de 002a **no** los escribe) —
  `backend/tests/unit/order-transition-architecture.spec.ts` (FR-006, Const. III)

### Implementación

- [ ] T015 [US1] Use case `applyTransition` (dominio): valida `isLegalTransition`; delega en el puerto; devuelve
  `Result` — `backend/src/domain/order/apply-transition.ts` (FR-002/006/007)
- [ ] T016 [US1] Repo `PrismaOrderTransitionRepository` con `$transaction`: **UPDATE condicional**
  `WHERE id=? AND version=expectedVersion AND status=<origen>[+ guard parametrizado]`; si count=1 insert
  OrderAudit; si 0 → re-lectura best-effort → clasificación determinista (404→409→422→`GUARD_UNMET`); fallo FK
  actor→rollback→`ACTOR_INVALID` — `backend/src/infra/repositories/order-transition-repository.ts` (FR-003/004)
- [ ] T017 [US1] Extender redacción de logs a `reason` **y a errores de BD** (nunca `reason` ni el error crudo
  de Postgres en logs/`details`/`agent_action`) — `backend/src/infra/logger.ts`,
  `backend/src/handlers/error-mapper.ts` (FR-008, SC-006)
- [ ] T018 [US1] Wiring: `OrderTransitionPort` en container (no se monta ruta — dominio puro) —
  `backend/src/infra/container.ts` (FR-007)

**Checkpoint**: maquinaria de transición+auditoría verificada contra Postgres real; lista para 003/004/005.

---

## Phase 4: Polish

- [ ] T019 [P] Actualizar `docs/traceability.md` con matriz RF→tarea→test de 002b; **FR-009** (no-enumeración) y
  el **contrato `actor_id` = server-side** (nunca de input del cliente, G1:S-002 re-run) marcados como
  **precondición verificada en 003/004/005** (reasignación/ejecución/revisión — carpetas físicas 004/005/006),
  no en 002b (dominio puro) — `docs/traceability.md` (Const. VI)
- [ ] T020 Validación `quickstart.md` (migrate+seed+test verde contra Postgres real) **+ verificar que el `down`
  de la migración del trigger corre limpio** (DROP TRIGGER/FUNCTION sin huérfanos; cínico-G2:H-006) — (quickstart)

---

## Dependencies & Execution Order

- **Setup (T001)** → **Foundational (T002-T005)** → **US1 (T006-T018)** → **Polish (T019-T020)**.
- Tests Red (T002, T006-T014) **antes** de su impl (commit en rojo). Dominio (T003/T004/T005/T015) antes que
  infra (T016).
- **[P]** = ficheros distintos, sin dependencia mutua (T002/T004/T005 en Foundational; T006-T014 en US1).

## Notas

- Sin endpoint HTTP (dominio puro); los endpoints con RBAC/pertenencia y el mapeo FR-009 llegan en 003/004/005
  usando `applyTransition`.
- **FR-009** no genera tarea de implementación en 002b; se enuncia como contrato y se verifica en los gates de
  003/004/005 (T019 lo deja trazado).
- Concurrencia = correctness (no lost-update, SC-002); If-Match→409 al cliente = stretch (003/004, BL-050).
- Diferidos: cifrado de `reason` en reposo (BL-051), accesos denegados (BL-052), hardening bypass status
  (BL-053), cancelación/límite (BL-054), PII correctiva/mantenimiento trigger + health-check (BL-055), defensa
  en profundidad del contrato: actor tipado, guard obligatorio, timing, control del `down` (BL-056).

## Conventional Commits sugeridos (no ejecutar automáticamente)

- `feat(002b): OrderAudit + trigger append-only (migración reversible)` (T001)
- `test(002b): FSM + applyTransition red suite (Postgres real)` (T002, T006-T014)
- `feat(002b): applyTransition dominio + repo transaccional + clasificación determinista` (T015-T018)
- `docs(002b): trazabilidad + quickstart` (T019-T020)
