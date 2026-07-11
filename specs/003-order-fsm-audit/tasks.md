---
description: "Task list — 002b Order FSM + auditoría append-only (write-side)"
---

# Tasks: Order — máquina de estados + auditoría append-only (Fundación B-2)

**Input**: `specs/003-order-fsm-audit/` (spec FR-001..008, plan, research D1-D6, data-model)

**Tests**: OBLIGATORIOS (Constitution VII — TDD fase Red; verificación contra Postgres real, sin mockear ORM).
**Arquitectura**: hexagonal — `domain/order` sin infra. **Dominio puro**: SIN endpoint HTTP (contract-first N/A).
**Reutiliza 001/002a**: Order/version, error-mapper, logger (redacción), config, Prisma/Postgres, container.

## Format: `[ID] [P?] [Story] Descripción (FRs) — ruta`

---

## Phase 1: Setup

- [ ] T001 Añadir modelo Prisma `OrderAudit` (id, order_id FK→Order onDelete Restrict, actor_id FK→User,
  from_status, to_status OrderStatus, reason text?, at) + índice `@@index([orderId])` + migración que **además**
  aplica `REVOKE UPDATE, DELETE ON order_audit FROM <rol_app>` (append-only en BD) — `backend/prisma/schema.prisma`,
  `backend/prisma/migrations/` (FR-005, data-model, D4)

---

## Phase 2: Foundational

- [ ] T002 [P] **[Red]** Unit FSM: `isLegalTransition(from,to)` exhaustivo — legales (assigned→in_progress,
  in_progress→pending_review, pending_review→closed, pending_review→in_progress) true; todas las demás
  (mismo estado, desde closed, draft→*) false — `backend/tests/unit/transition-table.spec.ts` (FR-001/002)
- [ ] T003 FSM: tabla de transiciones + `isLegalTransition` — `backend/src/domain/order/transition-table.ts` (FR-001, D1)
- [ ] T004 [P] Errores de dominio `INVALID_TRANSITION`(422)/`VERSION_CONFLICT`(409)/`ORDER_NOT_FOUND`(404) en el
  catálogo `ErrorCode` + error-mapper de 001 — `backend/src/domain/result.ts`, `backend/src/handlers/error-mapper.ts` (FR-002/003)
- [ ] T005 [P] Puerto `OrderTransitionPort.applyTransition({orderId,toStatus,actorId,reason?,expectedVersion,guard?})`
  — `backend/src/domain/order/transition-ports.ts` (Const. III, FR-007)

---

## Phase 3: User Story 1 — Transición segura y auditada (P1) 🎯

**Goal**: `applyTransition` valida FSM + concurrencia optimista + auditoría atómica. **Independent Test**:
dominio+repo contra Postgres real.

### Tests Red ⚠️

- [ ] T006 [P] [US1] **[Red]** Unit `applyTransition` (use case) con puerto fake: transición legal delega en el
  repo con el par correcto; ilegal (isLegalTransition false) → `INVALID_TRANSITION` sin tocar repo —
  `backend/tests/unit/apply-transition.spec.ts` (FR-002/007)
- [ ] T007 [P] [US1] **[Red]** Integration (Postgres real) transición legal: `status`→destino, `version`+1,
  **1 fila** de OrderAudit con {from,to,actor,reason,at}, todo en la misma transacción —
  `backend/tests/integration/order-transition.spec.ts` (FR-004, SC-001)
- [ ] T008 [P] [US1] **[Red]** Integration efectos negativos SIN efecto: ilegal→422; `expectedVersion`
  obsoleta→409; `orderId` inexistente→404 (status/version/auditoría inalterados) —
  `backend/tests/integration/order-transition-errors.spec.ts` (FR-002/003, SC-001)
- [ ] T009 [P] [US1] **[Red]** Integration **atomicidad** (SC-004): `actor_id` inexistente → FK falla dentro de
  `$transaction` → rollback (status/version intactos, 0 filas auditoría) —
  `backend/tests/integration/order-transition-atomicity.spec.ts` (FR-004, SC-004)
- [ ] T010 [P] [US1] **[Red]** Integration **append-only** (SC-003): un `UPDATE`/`DELETE` directo sobre
  `order_audit` → **error de BD** — `backend/tests/integration/order-audit-append-only.spec.ts` (FR-005, SC-003)
- [ ] T011 [P] [US1] **[Red]** Integration **concurrencia** (SC-002): dos `applyTransition` concurrentes sobre
  la misma orden → como máximo una gana, **1** fila de auditoría, la otra→409 —
  `backend/tests/integration/order-transition-concurrency.spec.ts` (FR-003/008, SC-002)
- [ ] T012 [P] [US1] **[Red]** Integration **guarda de pertenencia**: `guard.assignedTo` que no coincide → 0
  filas (no transiciona), sin auditoría — `backend/tests/integration/order-transition-guard.spec.ts` (FR-003/007, H-012)
- [ ] T013 [P] [US1] **[Red]** Arquitectura: `domain/order` no importa infra + **`status`/`version` solo se
  escriben en el repo de transición** (ningún otro `update` de `order.status`) —
  `backend/tests/unit/order-transition-architecture.spec.ts` (FR-006, Const. III)
- [ ] T014 [P] [US1] **[Red]** Redacción: `reason` no aparece en logs — `backend/tests/integration/order-audit-redaction.spec.ts` (FR-008)

### Implementación

- [ ] T015 [US1] Use case `applyTransition` (dominio): valida `isLegalTransition`; delega en el puerto; devuelve
  `Result` — `backend/src/domain/order/apply-transition.ts` (FR-002/006/007)
- [ ] T016 [US1] Repo `PrismaOrderTransitionRepository` con `$transaction`: **UPDATE condicional**
  `WHERE id=? AND version=? AND status=<origen>[+guard]`; si count=1 insert OrderAudit; si 0 → re-lectura
  best-effort → 404/409/422; fallo FK actor→rollback — `backend/src/infra/repositories/order-transition-repository.ts` (FR-003/004)
- [ ] T017 [US1] Extender redacción de logs a `reason` (nunca en logs ni details/agent_action) —
  `backend/src/infra/logger.ts` (FR-008)
- [ ] T018 [US1] Wiring: `OrderTransitionPort` en container (no se monta ruta — dominio puro) —
  `backend/src/infra/container.ts` (FR-007)

**Checkpoint**: maquinaria de transición+auditoría verificada contra Postgres real; lista para 003/004/005.

---

## Phase 4: Polish

- [ ] T019 [P] Actualizar `docs/traceability.md` con matriz RF→tarea→test de 002b — `docs/traceability.md` (Const. VI)
- [ ] T020 Validación `quickstart.md` (migrate+seed+test verde) — (quickstart)

---

## Dependencies & Execution Order

- **Setup (T001)** → **Foundational (T002-T005)** → **US1 (T006-T018)** → **Polish (T019-T020)**.
- Tests Red (T002, T006-T014) **antes** de su impl (commit en rojo). Dominio (T003/T004/T005/T015) antes que
  infra (T016).

## Notas

- Sin endpoint HTTP (dominio puro); los endpoints con RBAC/pertenencia llegan en 003/004/005 usando `applyTransition`.
- Concurrencia = correctness (no lost-update, SC-002); If-Match→409 al cliente = stretch (003/004, BL-050).
- Diferidos: cifrado de `reason` en reposo (BL-051), accesos denegados (BL-052), trigger anti-bypass (BL-053),
  cancelación/límite (BL-054).
