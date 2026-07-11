---
description: "Task list — 002a Order + listado por rol (read-side)"
---

# Tasks: Order — entidad y listado por rol (Fundación B-1)

**Input**: `specs/002-order-entity-listado/` (spec FR-001..017, plan, research D1-D7, data-model, contracts/orders.openapi.yaml)

**Tests**: OBLIGATORIOS (Constitution VII — TDD fase Red: commit del test en rojo antes del de implementación).
**Arquitectura**: hexagonal — `domain` sin infra. **Contract-first**: contract test por operationId×código.
**Reutiliza 001**: authenticate (Bearer), error-mapper, logger (redacción), config, Prisma/Postgres, container/app.

## Format: `[ID] [P?] [Story] Descripción (FRs) — ruta`

---

## Phase 1: Setup

- [ ] T001 Añadir modelo `Order` + enum `OrderStatus` al esquema Prisma (`status` dato, `assigned_to` FK opcional,
  **`version` int default 0**, índices `(status, assigned_to)` y `created_at`) + migración reversible —
  `backend/prisma/schema.prisma`, `backend/prisma/migrations/` (FR-010, data-model, H-001)
- [ ] T002 Extender seed con **≥30 órdenes** por rol/estado reutilizando usuarios de 001: activas de varios
  technicians, `pending_review`, **≥1 `draft` con `assigned_to=null`**, **≥1 `closed` de technician1**; invariante
  no `assigned`/`in_progress` con null — `backend/prisma/seed.ts`, `backend/prisma/seed-data.ts` (SC-001/004, D7)

---

## Phase 2: Foundational

- [ ] T003 [P] Modelo de dominio `Order` (tipo `OrderRecord`, `OrderStatus`, `OrderPublic`) — `backend/src/domain/order/model.ts` (FR-007/010)
- [ ] T004 [P] **[Red]** Unit `orderScopeFor(role,userId)`: technician (self + activas), supervisor (pending_review),
  dispatcher (assigned/in_progress); closed/draft excluidos — `backend/tests/unit/order-scope.spec.ts` (FR-002/003/004/016)
- [ ] T005 `orderScopeFor(role,userId)` política de dominio (única fuente; devuelve `{assignedToSelf, statuses}`) —
  `backend/src/domain/order/scope-policy.ts` (FR-016, D1)
- [ ] T006 [P] Puerto `OrderRepositoryPort.listForScope(scope)` — `backend/src/domain/order/ports.ts` (Const. III)
- [ ] T007 [P] Tipos/DTO + (si aplica) Zod del contrato `listOrders` (`OrderListResponse`, campos snake_case) —
  `backend/src/handlers/contract/order-types.ts` (Const. II)

---

## Phase 3: User Story 1 — Ver mis órdenes según mi rol (P1) 🎯 MVP

**Goal**: `GET /v1/orders` devuelve solo el subconjunto del rol. **Independent Test**: login por rol → listado.

### Tests Red ⚠️

- [ ] T008 [P] [US1] **[Red]** Contract test `listOrders` 200/401/403 (shape `OrderListResponse`; `assigned_to`
  UUID/null; sin PII) — `backend/tests/contract/orders.contract.spec.ts` (FR-001/007/014, contrato)
- [ ] T009 [P] [US1] **[Red]** Integration por rol contra seed: technician solo sus activas (**excluye sus
  `closed`/`draft`** y ajenas); supervisor solo `pending_review`; dispatcher solo `assigned`/`in_progress`;
  **0 fugas** (SC-004); `?assigned_to=otro`/`?status=closed` NO amplían (FR-015); lista vacía→200 —
  `backend/tests/integration/orders-list.spec.ts` (FR-001/002/003/004/008/009/015, SC-001/004)
- [ ] T010 [P] [US1] **[Red]** Integration auth/authorize: sin token→401 uniforme; rol fuera del allowlist→403
  (default-deny); disabled/revocada→401 (reutiliza 001) — `backend/tests/integration/orders-authz.spec.ts` (FR-005/006/014, SC-003)
- [ ] T011 [P] [US1] **[Red]** Test de arquitectura: el handler `listOrders` obtiene su filtro de
  `orderScopeFor(...)` (no inline) — `backend/tests/unit/order-architecture.spec.ts` (FR-016)

### Implementación

- [ ] T012 [US1] Adaptador Prisma `OrderRepository.listForScope` (traduce scope a WHERE; orden **`created_at`
  DESC, `id` DESC**; sin paginación; devuelve campos públicos) — `backend/src/infra/repositories/order-repository.ts` (FR-012/013)
- [ ] T013 [US1] `authorize('orders:list')` allowlist `{dispatcher,technician,supervisor}` **default-deny**→403 —
  `backend/src/handlers/middleware/authorize.ts` (extiende el de 001) (FR-006, D3)
- [ ] T014 [US1] Handler `GET /v1/orders` (bearerAuth vía `authenticate` de 001; usa `orderScopeFor` + repo;
  ignora query params; mapea a `OrderListResponse`) — `backend/src/handlers/orders/list.ts` (FR-001/008/015)
- [ ] T015 [US1] Wiring: `OrderRepository` en container + ruta en app (`authenticate`→`authorize`→handler) —
  `backend/src/infra/container.ts`, `backend/src/handlers/app.ts` (FR-014)
- [ ] T016 [US1] Extender redacción de logs a `title`/`description` de Order (no serializar) — `backend/src/infra/logger.ts` (FR-017, S-003/004)

**Checkpoint**: US1 funcional (login→GET /v1/orders por rol), demostrable e independiente.

---

## Phase 4: Polish

- [ ] T017 [P] **[Red→verde]** Perf `listOrders` P95 < 300 ms (método D9: N≥200, warm-up descartado, server-side)
  sobre ≥30 órdenes — `backend/tests/integration/orders-perf.spec.ts` (SC-002)
- [ ] T018 [P] Actualizar `docs/traceability.md` con matriz RF→tarea→test de 002a — `docs/traceability.md` (Const. VI)
- [ ] T019 Validación `quickstart.md` end-to-end (login por rol → listado correcto) — (quickstart)

---

## Dependencies & Execution Order

- **Setup (T001-T002)** → **Foundational (T003-T007)** → **US1 (T008-T016)** → **Polish (T017-T019)**.
- Tests Red (T004, T008-T011, T017) **antes** de su implementación (commit en rojo).
- Dominio (T003/T005/T006) antes que infra (T012) y handlers (T014).

## Notas

- TDD: commit del test en rojo antes del de implementación (verificable en historial).
- `orderScopeFor` es la ÚNICA fuente de la regla rol→alcance (FR-016); 003/004/005 la reutilizarán.
- `version` sin comportamiento en 002a (If-Match→409 stretch en 003/004, BL-001).
- Diferidos: minimización PII por rol (BL-046), aislamiento por equipo (BL-049).
