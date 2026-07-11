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

- [x] T001 Añadir modelo `Order` + enum `OrderStatus` al esquema Prisma (`status` dato, `assigned_to` FK opcional,
  **`version` int default 0**, índices `(status, assigned_to)` y `created_at`) + **migración reversible verificada**
  (up→down deja el esquema sin `orders`/enum; comprobado por introspección) — `backend/prisma/schema.prisma`,
  `backend/prisma/migrations/` (FR-010, data-model, H-001, T-004)
- [x] T002 Extender seed con **≥30 órdenes** + **≥2 technicians nuevos** (`technician2`, `technician3`): activas de
  technician1/technician2; **`pending_review` de technician1 Y technician2** (IDOR mismo-estado); **`technician3`
  sin activas** (lista vacía); **≥2 órdenes con `created_at` idéntico** (tiebreak); **≥1 `draft` con
  `assigned_to=null`**; **≥1 `closed` de technician1**; **invariante**: sin `assigned_to=null` en
  `assigned`/`in_progress`/`pending_review` — `backend/prisma/seed.ts`, `backend/prisma/seed-data.ts`
  (SC-001/004, D7, S-002/H-001/H-003/H-005)

---

## Phase 2: Foundational

- [x] T003 [P] Modelo de dominio `Order` (tipo `OrderRecord`, `OrderStatus`, `OrderPublic`) — `backend/src/domain/order/model.ts` (FR-007/010)
- [x] T004 [P] **[Red]** Unit `orderScopeFor(role,userId)`: technician (self + activas), supervisor (pending_review),
  dispatcher (assigned/in_progress); closed/draft excluidos — `backend/tests/unit/order-scope.spec.ts` (FR-002/003/004/016)
- [x] T005 `orderScopeFor(role,userId)` política de dominio (única fuente; devuelve `{assignedToSelf, statuses}`) —
  `backend/src/domain/order/scope-policy.ts` (FR-016, D1)
- [x] T006 [P] Puerto `OrderRepositoryPort.listForScope(scope)` — `backend/src/domain/order/ports.ts` (Const. III)
- [x] T007 [P] Tipos/DTO + (si aplica) Zod del contrato `listOrders` (`OrderListResponse`, campos snake_case) —
  `backend/src/handlers/contract/order-types.ts` (Const. II)

---

## Phase 3: User Story 1 — Ver mis órdenes según mi rol (P1) 🎯 MVP

**Goal**: `GET /v1/orders` devuelve solo el subconjunto del rol. **Independent Test**: login por rol → listado.

### Tests Red ⚠️

- [x] T008 [P] [US1] **[Red]** Contract test `listOrders` 200/401/403 (shape `OrderListResponse`; `assigned_to`
  UUID/null; sin PII); **el error 401/403 cumple `{code,message}` accionable y propaga `x-correlation-id`**
  (FR-011, traza; K-001) — `backend/tests/contract/orders.contract.spec.ts` (FR-001/007/011/014, contrato)
- [x] T009 [P] [US1] **[Red]** Integration por rol contra seed: technician solo sus activas (**excluye sus
  `closed`/`draft`** y ajenas); supervisor solo `pending_review`; dispatcher solo `assigned`/`in_progress`;
  **0 fugas** (SC-004); **IDOR mismo-estado: technician1 NO ve la `pending_review` de technician2** (S-002);
  **lista vacía (technician3) → 200** (H-003); `?assigned_to=otro`/`?status=closed` NO amplían (FR-015);
  **orden `created_at` desc, `id` desc verificado con el par de `created_at` idéntico del seed** (FR-012, H-001) —
  `backend/tests/integration/orders-list.spec.ts` (FR-001/002/003/004/008/009/012/015, SC-001/004)
- [x] T010 [P] [US1] **[Red]** Auth/authorize (2 niveles):
  (a) **Unit** sobre `authorize('orders:list')` invocado con principal fuera del allowlist / rol
  ausente / rol malformado → **403 default-deny** con mensaje **genérico** (sin JWT forjado; S-001/S-004/S-005/H-002);
  (b) **Integration**: token inválido/ausente → **401 antes que 403** (auth antes que authz, FR-014/T-002);
  disabled/revocada→401; **cuerpo del 401 idéntico entre causas** (uniforme, SC-003/C3) —
  `backend/tests/unit/orders-authorize.spec.ts`, `backend/tests/integration/orders-authz.spec.ts` (FR-005/006/014, SC-003)
- [x] T011 [P] [US1] **[Red]** Test de arquitectura (mecanismo fijado, T-001): **spy** que asevera que el handler
  **llama a `orderScopeFor(role, userId)`** y pasa **su retorno** al repo (no lógica inline) + `domain/order` no
  importa infra — `backend/tests/unit/order-architecture.spec.ts` (FR-016)

### Implementación

- [x] T012 [US1] Adaptador Prisma `OrderRepository.listForScope` (traduce scope a WHERE; orden **`created_at`
  DESC, `id` DESC**; sin paginación; devuelve campos públicos) — `backend/src/infra/repositories/order-repository.ts` (FR-012/013)
- [x] T013 [US1] `authorize('orders:list')` allowlist `{dispatcher,technician,supervisor}` **default-deny**→403 —
  `backend/src/handlers/middleware/authorize.ts` (extiende el de 001) (FR-006, D3)
- [x] T014 [US1] Handler `GET /v1/orders` (bearerAuth vía `authenticate` de 001; usa `orderScopeFor` + repo;
  **ignora query params — la validación de contrato aplica a body/response, NO a query; un param desconocido
  NO produce 400** (H-004); mapea a `OrderListResponse`) — `backend/src/handlers/orders/list.ts` (FR-001/008/015)
- [x] T015 [US1] Wiring: `OrderRepository` en container + ruta en app (`authenticate`→`authorize`→handler) —
  `backend/src/infra/container.ts`, `backend/src/handlers/app.ts` (FR-014)
- [x] T016 [US1] **[Red]** Test de redacción con poder de detección (T-003): **forzar** el log de un objeto
  `Order` (camino feliz **y ruta de error/excepción**) y verificar que `title`/`description` salen `[Redacted]`;
  extender la lista de redacción de 001 — `backend/tests/integration/orders-log-redaction.spec.ts`,
  `backend/src/infra/logger.ts` (FR-017, S-003/004/006, H-006, C2)

**Checkpoint**: US1 funcional (login→GET /v1/orders por rol), demostrable e independiente.

---

## Phase 4: Polish

- [ ] T017 [P] **[Red→verde]** Perf `listOrders` P95 < 300 ms (método D9: N≥200, warm-up descartado, server-side)
  sobre ≥30 órdenes — `backend/tests/integration/orders-perf.spec.ts` (SC-002)
- [x] T018 [P] Actualizar `docs/traceability.md` con matriz RF→tarea→test de 002a — `docs/traceability.md` (Const. VI)
- [x] T019 Validación `quickstart.md` end-to-end (login por rol → listado correcto) — (quickstart)

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
