---

description: "Task list — 004-orden-reasignacion"
---

# Tasks: Reasignación de una orden por el dispatcher

**Input**: Design documents from `specs/004-orden-reasignacion/`

**Prerequisites**: plan.md ✓, spec.md ✓ (G1 PASS), research.md ✓, data-model.md ✓, contracts/ ✓, quickstart.md ✓

**Tests**: OBLIGATORIOS (Constitution VII — TDD fase Red: commit del test en rojo **antes** de implementar).

**Organization**: por user story. US1 (P1) = MVP; US2 (P3) = stretch (If-Match), no bloquea gate.

> Regenerada tras `/speckit-analyze`: incorpora G1 (test negativo dedicado de FR-011 — actor infalsificable)
> e I1 (guarda de regresión al extender `sendError`/`DomainError` compartidos con 001/002a).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: paralelizable (ficheros distintos, sin dependencias abiertas).
- Rutas reales del repo (backend hexagonal). `status`/`version` sólo mutan desde `domain/order/write-side/` + su repo de infra (FR-007).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: preparar el terreno; el proyecto y las dependencias ya existen (001/002).

- [ ] T001 Verificar rama `004-orden-reasignacion`, BD de test arriba (`docker compose up -d db-test`, puerto 5433) y que `npm run test` de 002b pasa en verde (baseline antes de refactor).
- [ ] T002 Confirmar que el contrato `contracts/orders.openapi.yaml` incluye `reassignOrder` (hecho en plan) y que `npm run build`/`tsc` compila el repo actual sin errores.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: infraestructura de datos y dominio que TODA la feature necesita. Bloquea US1/US2.

**⚠️ CRITICAL**: ninguna US puede empezar hasta completar esta fase.

- [ ] T003 [P] Extender `backend/prisma/schema.prisma`: añadir `enum OrderAuditEventType { transition reassignment }`; en `OrderAudit` añadir `eventType OrderAuditEventType @default(transition) @map("event_type")`, `fromAssignee String? @db.Uuid @map("from_assignee")`, `toAssignee String? @db.Uuid @map("to_assignee")` con relaciones FK→User `onDelete: Restrict` (ver data-model.md).
- [ ] T004 Crear migración `backend/prisma/migrations/<ts>_extend_order_audit_reassignment/migration.sql`: `CREATE TYPE` + 3 `ADD COLUMN` (event_type NOT NULL DEFAULT 'transition' → backfill implícito; from/to_assignee UUID + FK Restrict); **conservar** el trigger append-only. Añadir `down.sql` (DROP columns + DROP TYPE).
- [ ] T005 (TDD Red) Test de migración en `backend/tests/integration/order-audit-migration.spec.ts`: tras aplicar, las filas de auditoría legacy de 002b tienen `event_type='transition'` y `from_assignee/to_assignee` NULL; el trigger sigue rechazando UPDATE/DELETE con `restrict_violation`. **Commit en rojo.**
- [ ] T006 Aplicar migración (`prisma migrate`) y regenerar el client; T005 pasa a verde.
- [ ] T007 Refactor módulo write-side: crear `backend/src/domain/order/write-side/` y **mover** `apply-transition.ts` (y `transition-ports.ts` si aplica) desde `domain/order/`; actualizar todos los imports; `npm run test` de 002b debe seguir verde (sin cambio de comportamiento, XV).
- [ ] T008 (TDD Red) Test de arquitectura en `backend/tests/unit/write-side-boundary.spec.ts`: ningún fichero fuera de `domain/order/write-side/*` (dominio) ni de `infra/repositories/order-write-side-repository.ts` (infra) referencia escrituras de `status`/`version` (`order.update*` con esos campos). **Commit en rojo** (cierra BL-065).
- [ ] T009 [P] Extender contrato de error: añadir `agentAction?` a `DomainError` en `backend/src/domain/result.ts` y emitir `agent_action` en `sendError` de `backend/src/handlers/error-mapper.ts` **sólo cuando `DomainError` lo aporta** (opcional, retrocompatible); añadir `INVALID_ASSIGNEE→422` y `FORBIDDEN_ROLE→403` al catálogo `ErrorCode`/tabla `STATUS` (reusa `VERSION_CONFLICT→409`, `VALIDATION_ERROR→422`, `ORDER_NOT_FOUND→404`).
- [ ] T010 (Guarda de regresión — I1) Re-ejecutar los contract/integration tests de error de **001** y **002** (`backend/tests/contract/*` y `backend/tests/integration/*` de auth/orders-list) y confirmar que el cambio de `sendError` (T009) es **retrocompatible**: los cuerpos de error existentes no se rompen (sin `agent_action` cuando el `DomainError` no lo aporta). Ajustar/asertar según convención de forma (`additionalProperties`/keys) usada en esos tests.
- [ ] T011 [P] Ampliar `REDACT_PATHS` en `backend/src/infra/logger.ts` para cubrir `reason` **anidado** del payload real (`req.body.reason`, y `err.reason`/`error.cause` si el logger de errores las alcanza), FR-009/BL-059.
- [ ] T012 Añadir catch-all de errores no mapeados → **500 genérico** `{code,message,agent_action}` en `backend/src/handlers/error-mapper.ts` (extiende `jsonErrorHandler`), sin filtrar detalle de Postgres (FR-010/BL-060). Mapear FK del asignatario (`P2003`) a `INVALID_ASSIGNEE`.

**Checkpoint**: esquema migrado, módulo write-side aislado, contrato de errores completo y retrocompatible. US1 puede empezar.

---

## Phase 3: User Story 1 - Reasignar una orden a otro técnico (Priority: P1) 🎯 MVP

**Goal**: un dispatcher reasigna una orden reasignable a un técnico válido, conservando estado, con
`version`+1 y auditoría append-only atómica; RBAC dispatcher-only y no-enumeración por construcción.

**Independent Test**: `POST /v1/orders/{id}/reassignments` (dispatcher, orden reasignable, destino válido,
reason) → 200 + `assigned_to=T2` + estado intacto + `version`+1 + 1 fila auditoría `reassignment`. No-dispatcher
/ orden no reasignable / destino inválido rechazados sin efecto.

### Tests for User Story 1 (TDD — escribir y ver FALLAR antes de implementar) ⚠️

- [ ] T013 [P] [US1] (Red) Contract test `backend/tests/contract/reassign.contract.spec.ts`: forma exacta de las respuestas 200/401/403/404/409/422/500 (status, header `ETag`, keys del body, `additionalProperties:false`, `agent_action` presente) por `operationId` reassignOrder. **Commit en rojo.**
- [ ] T014 [P] [US1] (Red) Unit dominio `backend/tests/unit/reassign-order.spec.ts`: `reassignOrder` con fakes del puerto write-side — happy path, y clasificación 0-filas con **precedencia status>version** (404 fuera de ámbito antes que 409). **Commit en rojo.**
- [ ] T015 [P] [US1] (Red) Integración happy path + auditoría `backend/tests/integration/reassign-order.spec.ts`: 200, `assigned_to=T2`, `status` intacto (assigned y in_progress), `version`+1, **1** fila `event_type=reassignment` con `from_assignee/to_assignee/reason`. Incluye **orden huérfana** (`assignedTo=null` → `from_assignee=NULL`). (SC-001, escenarios 1/2/11)
- [ ] T016 [P] [US1] (Red) Integración RBAC `backend/tests/integration/reassign-order-rbac.spec.ts`: 401 sin auth; 403 technician/supervisor; sin efecto. (SC-002, FR-003)
- [ ] T017 [P] [US1] (Red) Integración no-enumeración `backend/tests/integration/reassign-order-notfound.spec.ts`: 404 **byte-idéntico** (cuerpo+cabeceras) entre las **tres** vías — inexistente, existente-no-reasignable (pending_review/closed/draft), y colapso post-UPDATE (escenario 9). (SC-003/SC-008, FR-002/FR-004)
- [ ] T018 [P] [US1] (Red) Integración destino inválido `backend/tests/integration/reassign-order-assignee.spec.ts`: 422 `INVALID_ASSIGNEE` con cuerpo **genérico idéntico** para las 4 causas (inexistente/no-technician/deshabilitado `disabledAt≠null`/igual al actual). (SC-005, FR-005)
- [ ] T019 [P] [US1] (Red) Integración validación de `reason` `backend/tests/integration/reassign-order-validation.spec.ts`: 422 `VALIDATION_ERROR` para ausente/vacío/sólo whitespace/sólo control / >500 code points; acepta emoji (conteo por code points). (FR-006)
- [ ] T020 [P] [US1] (Red) Integración concurrencia `backend/tests/integration/reassign-order-concurrency.spec.ts`: (a) N reasignaciones concurrentes misma version → exactamente 1 éxito, resto 409, sin doble auditoría; (b) carrera cruzada reasignación↔transición-FSM (via `applyTransition`) que saca la orden de ámbito → **404** (no 409). (SC-004, FR-008)
- [ ] T021 [P] [US1] (Red) Integración atomicidad `backend/tests/integration/reassign-order-atomicity.spec.ts`: forzar fallo del insert de auditoría dentro de la tx → orden intacta (assigned_to/status/version), 0 filas auditoría; sin propagar SQL crudo. (SC-009, FR-007)
- [ ] T022 [P] [US1] (Red) Integración fugas/errores `backend/tests/integration/reassign-order-security.spec.ts`: `reason` centinela ausente en logs (req/resp/error) y en body de error (grep negativo, incl. error tras aceptar payload); error de BD ≠ FK → 500 genérico sin SQLSTATE/constraint/columna/query. (SC-006/SC-007, FR-009/FR-010)
- [ ] T023 [P] [US1] (Red — G1) Integración actor infalsificable `backend/tests/integration/reassign-order-actor.spec.ts`: enviar un `actor`/`actor_id` **espurio en el body** (además del token del dispatcher) → el schema `.strict()` lo rechaza (422) **o** se ignora, y en todo caso la fila de auditoría registra `actor_id = userId del token`, **nunca** el del body. (FR-011, cierra G1 de analyze)

### Implementation for User Story 1

- [ ] T024 [P] [US1] Zod `reassignRequestSchema` (`.strict()`) + DTOs snake_case en `backend/src/handlers/contract/schemas.ts` y `backend/src/handlers/contract/order-types.ts` (assignee_id uuid, reason 1..500 con refinamiento ≥1 imprimible / conteo code points; **sin** campo actor — se ignora/rechaza), derivados del contrato.
- [ ] T025 [US1] Puerto write-side + primitiva compartida en `backend/src/domain/order/write-side/write-side-ports.ts`: firma de `reassignOrder` (input: orderId, assigneeId, actorId, reason, expectedVersion) y del método atómico `conditionalWriteWithAudit`.
- [ ] T026 [US1] Caso de uso `backend/src/domain/order/write-side/reassign-order.ts`: orquesta validación de destino (puerto de usuarios), delega en el puerto atómico; clasifica 0-filas con precedencia status>version; devuelve `Result`. (depende de T025)
- [ ] T027 [US1] Adaptador atómico: generalizar `infra/repositories/order-transition-repository.ts` → `backend/src/infra/repositories/order-write-side-repository.ts` con `conditionalWriteWithAudit` privado (UPDATE condicional `id ∧ version ∧ status∈{assigned,in_progress}` → `assigned_to=T2, version+1` + insert auditoría `reassignment` en misma `$transaction`); relee y clasifica 0-filas (ORDER_NOT_FOUND → ORDER_NOT_REASSIGNABLE(404) → VERSION_CONFLICT(409)); mapea `P2003`. (depende de T025; `applyTransition` sigue usando la misma primitiva)
- [ ] T028 [US1] Handler `backend/src/handlers/orders/reassign.ts`: (1) `req.auth` (actor server-side, FR-011); (2) consulta de visibilidad única (id ∧ status reasignable) → releer version (expectedVersion base) → 0 filas ⇒ 404 genérico; (3) validar destino → 422; (4) invocar dominio; (5) 200 con `ETag`; errores vía `sendError` con `agent_action`. (depende de T026, T024)
- [ ] T029 [US1] Cablear la ruta en `backend/src/handlers/app.ts`: `POST /orders/{orderId}/reassignments` con `authenticate` + `requireRole('dispatcher')` + `correlation`; exponer el puerto write-side en `AppDeps`/`infra/container.ts`. (depende de T028)
- [ ] T030 [US1] Verificar en verde T013–T023; ajustar `agent_action` por código y correlation-ID en respuesta+logs (SC-010 correlation).

**Checkpoint**: US1 completa y testeable de forma independiente (MVP). Cobertura ≥80% dominio/handlers.

---

## Phase 4: User Story 2 - Concurrencia optimista explícita con If-Match (Priority: P3, stretch)

**Goal**: exponer al cliente el control de concurrencia (`If-Match`), sin alterar la precedencia de FR-008.

**Independent Test**: `If-Match` obsoleto → 409; correcto → 200; fuera de ámbito + `If-Match` obsoleto → 404.

### Tests for User Story 2 (TDD — Red) ⚠️

- [ ] T031 [P] [US2] (Red) Integración `backend/tests/integration/reassign-order-ifmatch.spec.ts`: `If-Match:"0"` obsoleto → 409 + `ETag` vigente; `If-Match:"1"` correcto → 200 + `ETag:"2"`; orden fuera de ámbito + `If-Match` obsoleto → **404** (precedencia, S-007). Sin cabecera → comportamiento de US1. **Commit en rojo.** (FR-012, SC-004)

### Implementation for User Story 2

- [ ] T032 [US2] Parsear la cabecera `If-Match` en `backend/src/handlers/orders/reassign.ts`: si presente, `expectedVersion` = versión del cliente (en vez de la releída); la comprobación de ámbito/status **precede** a la de version por esta vía también. (depende de T028)
- [ ] T033 [US2] Verificar T031 en verde; documentar que sin `If-Match` la concurrencia interna de FR-008 sigue protegiendo.

**Checkpoint**: US1 + US2 funcionan; US2 es opcional y no bloquea el gate.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [ ] T034 [P] Actualizar `docs/traceability.md`: RF→endpoint→tarea→test de 004 (incl. fila "Migración (OrderAudit)" y el test negativo de actor FR-011/T023).
- [ ] T035 [P] Test de latencia `backend/tests/integration/reassign-order-latency.spec.ts`: p95 de 50 reasignaciones secuenciales (BD caliente, warm-up descartado) < 300 ms; correlation-ID presente. (SC-010)
- [ ] T036 Ejecutar `npm run test` completo con cobertura; confirmar gate (dominio ≥80%, handlers/servicios ≥80%, 100% contract + clasificación 0-filas) y `tsc`/`eslint` limpios; confirmar que 001/002 siguen verdes (regresión, I1).
- [ ] T037 Ejecutar la validación de `quickstart.md` (18 escenarios) y anotar residuales abiertos (BL-063/064/065/BL-055/051/002) en `docs/backlog.md` si procede.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (T001–T002)**: sin dependencias.
- **Foundational (T003–T012)**: depende de Setup; **BLOQUEA** US1/US2. Orden interno: T003→T004→T005(Red)→T006; T007→T008(Red); T009→T010(guarda regresión); T011/T012 tras T009.
- **US1 (T013–T030)**: depende de Foundational. Tests Red (T013–T023) antes de impl (T024–T030).
- **US2 (T031–T033)**: depende de US1 (extiende el handler). Stretch.
- **Polish (T034–T037)**: depende de las US deseadas.

### Within User Story 1

- Tests (T013–T023) **en rojo** antes de implementar.
- Puerto (T025) → dominio (T026) y adaptador (T027) → handler (T028) → ruta (T029) → verde (T030).
- Zod/DTOs (T024) [P] pueden ir en paralelo a T025.

### Parallel Opportunities

- Foundational: T009 y luego T011 en paralelo con otras; T010 depende de T009.
- US1 tests: T013–T023 casi todos [P] (ficheros distintos).
- Polish: T034, T035 [P].

---

## Parallel Example: User Story 1 (tests Red)

```bash
Task: "Contract test reassignOrder en backend/tests/contract/reassign.contract.spec.ts"
Task: "Unit dominio reassign-order en backend/tests/unit/reassign-order.spec.ts"
Task: "Integración happy+audit en backend/tests/integration/reassign-order.spec.ts"
Task: "Integración RBAC en backend/tests/integration/reassign-order-rbac.spec.ts"
Task: "Integración actor infalsificable en backend/tests/integration/reassign-order-actor.spec.ts"
```

---

## Implementation Strategy

### MVP First (US1)

1. Phase 1 Setup → 2. Phase 2 Foundational (CRÍTICO, bloquea) → 3. Phase 3 US1 → **STOP y validar** US1
   independiente (escenarios 1–14, 16–18) → listo para G3.

### Incremental

- US1 (MVP) → validar/demostrar → US2 (If-Match stretch) → validar → Polish.

---

## Notes

- `[P]` = ficheros distintos, sin dependencias abiertas.
- TDD: verificar que cada test Red **falla** antes de implementar; commit del test en rojo (Constitution VII).
- Commit por tarea o grupo lógico (Conventional Commits). No commitear con bloqueantes.
- Cobertura de analyze: FR-011 con test negativo dedicado (T023, G1); regresión de `sendError` guardada (T010, I1).
- Residuales aceptados (documentados, no bloquean G3): BL-063 (TOCTOU destino), BL-064 (timing 422),
  BL-065 (cerrado por T008), BL-051/055 (PII de reason), BL-002 (accesos denegados).
