---

description: "Task list — 004-orden-reasignacion (MAGRO)"
---

# Tasks: Reasignación de una orden por el dispatcher (MVP magro)

**Input**: Design docs magros de `specs/004-orden-reasignacion/` (spec G1 PASS, plan/research/data-model/contrato alineados).

**Tests**: OBLIGATORIOS (Constitution VII — TDD fase Red: commit del test en rojo **antes** de implementar).

**Organization**: una user story (US1 = MVP). Sin US2 (If-Match/409 es stretch fuera de alcance).

## Format: `[ID] [P?] [Story] Description`

- **[P]** = paralelizable (ficheros distintos, sin dependencias abiertas). Rutas reales del repo hexagonal.
- `status`/`version`/`assigned_to` sólo mutan desde `domain/order/write-side/` + su repo de infra (FR-007).

---

## Phase 1: Setup

- [ ] T001 Verificar rama `004-orden-reasignacion`, BD de test arriba (`docker compose up -d db-test`, puerto 5433) y `npm run test` de 002b en verde (baseline).
- [ ] T002 Confirmar que `contracts/orders.openapi.yaml` tiene `reassignOrder` (200/401/403/404/422/500) y que `tsc`/`npm run build` compilan.

---

## Phase 2: Foundational (Blocking) ⚠️ bloquea US1

- [X] T003 [P] Extender `backend/prisma/schema.prisma`: `enum OrderAuditEventType { transition reassignment }`; en `OrderAudit` añadir `eventType OrderAuditEventType @default(transition) @map("event_type")`, `fromAssignee String? @db.Uuid @map("from_assignee")`, `toAssignee String? @db.Uuid @map("to_assignee")` (FK→User `onDelete: Restrict`); **relajar** `fromStatus`/`toStatus` a **nullable**.
- [X] T004 Crear migración con `prisma migrate dev --create-only` y **editar a mano** `backend/prisma/migrations/<ts>_extend_order_audit_reassignment/migration.sql`: `CREATE TYPE`; `ADD COLUMN event_type NOT NULL DEFAULT 'transition'` (backfill legacy→transition); `ADD COLUMN from_assignee/to_assignee UUID` con FK `ADD CONSTRAINT … NOT VALID` + `VALIDATE CONSTRAINT`; `ALTER COLUMN from_status/to_status DROP NOT NULL`; **2 CHECK constraints** de invariantes por `event_type` (reassignment ⇒ from/to_status NULL ∧ to_assignee NOT NULL; transition ⇒ from/to_status NOT NULL ∧ from/to_assignee NULL), `NOT VALID`+`VALIDATE` (H-003); **conservar** el trigger append-only. `down.sql`: **reverso parcial** (drop columnas/CHECK/type; deja from/to_status **nullable** — no re-NOT-NULL por append-only, M10/H-002, documentado).
- [X] T005 Aplicar migración (`prisma migrate`) y regenerar el client Prisma.
- [ ] T006 (Verificación post-migración) Test `backend/tests/integration/order-audit-migration.spec.ts` (verde tras T005): filas de auditoría legacy de 002b con `event_type='transition'` y `from_assignee/to_assignee` NULL; el trigger sigue rechazando UPDATE/DELETE (`restrict_violation`).
- [ ] T007 Refactor write-side (dominio): crear `backend/src/domain/order/write-side/` y **mover** `apply-transition.ts` (+`transition-ports.ts` si aplica) desde `domain/order/`; actualizar imports. `applyTransition` **sin cambio de comportamiento** (XV); `npm run test` de 002b verde.
- [ ] T008 Refactor write-side (infra): renombrar `order-transition-repository.ts` → `backend/src/infra/repositories/order-write-side-repository.ts` y **añadir** el método `reassign` (nuevo). **`applyTransition` NO cambia su cuerpo** (conserva su lectura optimista `findUnique`+`updateMany` por `version` y su `classifyZeroRows` de 002b — SIN cambio de concurrencia, H-004). **NO** se fuerza una primitiva de locking compartida (nada de imponer `FOR UPDATE` a `applyTransition`); a lo sumo se comparten helpers sin efecto sobre la concurrencia; si no hay boilerplate seguro, no se comparte. Actualizar `infra/container.ts`; `npm run test` de 002b **verde** (regresión).
- [ ] T009 (arch test, verde en Foundational) `backend/tests/unit/write-side-boundary.spec.ts`: ningún fichero fuera de `domain/order/write-side/*` ni de `infra/repositories/order-write-side-repository.ts` **muta** (UPDATE de orden existente) `status`/`version`/`assigned_to` (regla imports/dependency-cruiser o grep). *(Alcance: mutaciones de órdenes existentes; la asignación de valores iniciales en la CREACIÓN de órdenes —roadmap siguiente— se reconciliará en su feature; nota de trazabilidad cruzada, H-005.)* **Commit del test primero.**
- [ ] T010 [P] Catálogo de errores en `backend/src/domain/result.ts` (`ErrorCode`) y `backend/src/handlers/error-mapper.ts` (`STATUS`): +`INVALID_ASSIGNEE`→422, +`FORBIDDEN_ROLE`→403 (reusa `VALIDATION_ERROR`→422, `ORDER_NOT_FOUND`→404). Añadir `agentAction?` a `DomainError`; `sendError` emite `agent_action` **solo si se aporta** (opcional, retrocompatible). El error-mapper es **genérico** (no inspecciona Prisma).
- [ ] T011 (Guarda de regresión) Re-ejecutar los tests de error de **001** y **002**; confirmar que el cambio de `sendError` (T010) es retrocompatible (cuerpos intactos; sin `agent_action` cuando no se aporta).
- [ ] T012 [P] Ampliar `REDACT_PATHS` en `backend/src/infra/logger.ts` para `reason` anidado (`req.body.reason`, `error.cause`), FR-009.
- [ ] T013 Catch-all de errores de BD en `backend/src/handlers/error-mapper.ts`: **todo** error de BD → **500** genérico `{code,message,agent_action}` sin filtrar SQLSTATE/constraint/columna/query. Sin 503, sin mapeo fino de P2003.

**Checkpoint**: esquema migrado, write-side aislado (arch test verde), errores listos. US1 puede empezar.

---

## Phase 3: User Story 1 - Reasignar una orden a otro técnico (Priority: P1) 🎯 MVP

**Goal**: un dispatcher reasigna una orden reasignable a un técnico válido, conservando estado, con `version`+1
y auditoría append-only atómica; RBAC dispatcher-only y no-enumeración.

**Independent Test**: `POST /v1/orders/{id}/reassignments` (dispatcher, orden reasignable, destino válido,
reason) → 200 + `assigned_to=T2` + estado intacto + `version`+1 + 1 auditoría `reassignment`; rechazos sin efecto.

### Tests for User Story 1 (TDD — Red primero) ⚠️

- [ ] T014 [P] [US1] (Red) Contract test `backend/tests/contract/reassign.contract.spec.ts`: forma de 200/401/403/404/422/500 (status, keys del body, `additionalProperties:false`, `agent_action` en negocio 404/422/500). **Commit en rojo.**
- [ ] T015 [P] [US1] (Red) Unit dominio `backend/tests/unit/reassign-order.spec.ts`: con **fakes** de `OrderVisibilityPort`/`UserLookupPort`/`OrderReassignmentPort` — happy; validación de destino (4 causas→INVALID_ASSIGNEE); clasificación de 0-filas (404 no-visible / 422 mismo destino). **Commit en rojo.**
- [ ] T016 [P] [US1] (Red) Integración happy+auditoría `backend/tests/integration/reassign-order.spec.ts`: 200, `assigned_to=T2`, estado intacto (assigned/in_progress), `version`+1, 1 fila `reassignment` con **`from_assignee=T1` (T1≠T2)**, `to_assignee=T2`, `from_status/to_status=NULL`; incluye **orden huérfana** (`assignedTo=null`) que **SÍ se reasigna → 200** con `from_assignee=NULL` (confirma la guarda null-safe `IS DISTINCT FROM`, H-001). (SC-001)
- [ ] T017 [P] [US1] (Red) Integración RBAC `backend/tests/integration/reassign-order-rbac.spec.ts`: 401 sin auth **y token expirado/revocado**; 403 `FORBIDDEN_ROLE` technician/supervisor; sin efecto. (SC-002, FR-003)
- [ ] T018 [P] [US1] (Red) Integración no-enumeración `backend/tests/integration/reassign-order-notfound.spec.ts`: 404 **cuerpo genérico idéntico** entre inexistente / no-reasignable / **`orderId` malformado (no-uuid)**; y **sin auth + orderId malformado → 401** (auth precede). (SC-003/SC-004, FR-004)
- [ ] T019 [P] [US1] (Red) Integración orden de validación `backend/tests/integration/reassign-order-precedence.spec.ts`: orden **no visible × body inválido** → **404** (no 422). **Commit en rojo.** (FR-004)
- [ ] T020 [P] [US1] (Red) Integración destino inválido `backend/tests/integration/reassign-order-assignee.spec.ts`: 422 `INVALID_ASSIGNEE` cuerpo genérico idéntico para las 4 causas (inexistente/no-technician/deshabilitado/igual al actual), sobre orden visible. (SC-005, FR-005)
- [ ] T021 [P] [US1] (Red) Integración body/reason `backend/tests/integration/reassign-order-body.spec.ts`: 422 `VALIDATION_ERROR` para `reason` ausente/vacío/whitespace/control / >500 code points (acepta emoji) y para `assignee_id` ausente/no-uuid; **el cuerpo del 422 NO reproduce el `reason`** (message/details/logs). (SC-006/SC-008, FR-006/FR-009)
- [ ] T022 [P] [US1] (Red) Integración atomicidad `backend/tests/integration/reassign-order-atomicity.spec.ts`: forzar fallo del insert de auditoría en la tx → orden intacta, 0 filas auditoría; sin SQL crudo. (SC-007, FR-007)
- [ ] T023 [P] [US1] (Red) Integración errores/no-fuga `backend/tests/integration/reassign-order-errors.spec.ts`: error de BD → **500** genérico sin SQLSTATE/constraint/columna/query; `reason` centinela ausente de logs y del cuerpo de error. (SC-008/SC-009, FR-009)
- [ ] T024 [P] [US1] (Red) Integración concurrencia `backend/tests/integration/reassign-order-concurrency.spec.ts`: (a) **mismo destino** (2×T2 sobre `assigned_to=T1`) → 1×200, 1×**422** (guarda `assigned_to<>destino`, sin auditoría no-op); (b) **destinos distintos** (T1→T2, T2→T3) → last-write-wins, auditoría de la 2ª con `from_assignee=T2` (veraz); (c) **carrera FSM** que saca la orden de ámbito antes del commit → **404** (0 filas, sin 200/auditoría fantasma); (d) **precedencia** compuesta: orden fuera de ámbito **Y** `assigned_to==destino` → **404** (status precede a 422, H-006). (SC-001/SC-005, FR-007)
- [ ] T025 [P] [US1] (Red) Integración actor infalsificable `backend/tests/integration/reassign-order-actor.spec.ts`: `actor`/`actor_id` espurio en el body → rechazado por `.strict()` (422) o ignorado; la auditoría registra `actor_id = userId del token`, nunca el del body. (FR-008)

### Implementation for User Story 1

- [ ] T026 [P] [US1] Zod `reassignRequestSchema` (`.strict()`) + DTOs snake_case en `backend/src/handlers/contract/{schemas,order-types}.ts`: `assignee_id` uuid; `reason` refinamiento por **code points** (`[...reason].length ∈ [1,500]`, ≥1 imprimible, sin `\p{Cc}/\p{Cf}`); sin campo actor.
- [ ] T027 [US1] Puertos en `backend/src/domain/order/write-side/write-side-ports.ts`: `OrderVisibilityPort.findReassignable(orderId)→{id,status,assignedTo,version}|null`; `UserLookupPort.findAssignableTechnician(id)`; `OrderReassignmentPort.reassign(cmd)→{count, order|null}` donde `cmd = {orderId, assigneeId, reason, actorId}` — **`actorId` es parte del comando** (lo provee el handler desde `req.auth`, FR-008; nunca del body).
- [ ] T028 [US1] Caso de uso `backend/src/domain/order/write-side/reassign-order.ts`: recibe el snapshot de visibilidad (no relee) y el `actorId` del contexto; valida destino (`UserLookupPort`, FR-005) y reason; invoca `OrderReassignmentPort.reassign(cmd)` con `actorId` del contexto; clasifica 0-filas con **precedencia**: status no reasignable/no existe → **404** antes que mismo destino → **422** (H-006); `Result`. (depende de T027)
- [ ] T029 [US1] Adaptadores en `backend/src/infra/repositories/order-write-side-repository.ts`: `OrderVisibilityPort` (consulta única); `OrderReassignmentPort.reassign` (dentro de `$transaction`: `SELECT … FOR UPDATE` → `from_assignee`=assigned_to previo + status; UPDATE condicional `id ∧ status∈{assigned,in_progress} ∧ assigned_to IS DISTINCT FROM :destino` (**null-safe**, orden huérfana OK, H-001/S-002), `assigned_to=destino, version+1`; si count=1 inserta auditoría `reassignment` (`from_status/to_status=NULL`, `actor_id`=cmd.actorId); relectura post-UPDATE para el 200; si count=0 reclasifica sobre el row bloqueado comparando en código `snapshot.assignedTo===destino`, con precedencia status→404 antes que mismo-destino→422). `UserLookupPort` sobre `user-repository`. **`applyTransition` no se toca** (H-004). (depende de T027)
- [ ] T030 [US1] Handler **delgado** `backend/src/handlers/orders/reassign.ts` (D-06): (1) `req.auth` (actor del token); (2) validar `orderId` uuid → malformado = 404; `OrderVisibilityPort.findReassignable` → null ⇒ 404; (3) sólo si visible: parsear Zod del body (422) → delegar en `reassignOrder` pasándole el snapshot (destino 422); (4) 200 con la orden; errores vía `sendError` con `agent_action`. Sin Prisma directo. (depende de T028, T029, T026)
- [ ] T031 [US1] Cablear ruta en `backend/src/handlers/app.ts`: `POST /orders/{orderId}/reassignments` con `authenticate` + `requireRole('dispatcher')` + `correlation`; exponer puertos en `AppDeps`/`infra/container.ts`. Validación de forma del body **dentro** del handler (tras visibilidad), no middleware previo. (depende de T030)
- [ ] T032 [US1] Verificar en verde T014–T025; ajustar `agent_action` por código y correlation-ID en respuesta+logs.

**Checkpoint**: US1 completa y testeable (MVP). Cobertura ≥80% dominio/handlers.

---

## Phase 4: Polish

- [ ] T033 [P] Actualizar `docs/traceability.md` con la matriz viva RF→endpoint→tarea→test de 004.
- [ ] T034 [P] Test de latencia `backend/tests/integration/reassign-order-latency.spec.ts`: p95 de 50 reasignaciones secuenciales (BD caliente, warm-up descartado, nearest-rank índice 48) < 300 ms; correlation-ID presente. (SC-010)
- [ ] T035 Ejecutar `npm run test` completo con cobertura; confirmar gate (dominio ≥80%, handlers/servicios ≥80%, 100% contract) y `tsc`/`eslint` limpios; confirmar 001/002 verdes.
- [ ] T036 Validar `quickstart.md` (20 escenarios) y anotar residuales abiertos en `docs/backlog.md` (BL-001 If-Match, BL-063/064/066 hardening, BL-067 gobernanza XI, BL-002/051/055 heredados).

---

## Dependencies & Execution Order

- **Setup (T001–T002)** → **Foundational (T003–T013)** bloquea todo. Orden: T003→T004→T005→T006; T007→T008→T009; T010→T011; T012; T013.
- **US1 (T014–T032)**: tests Red (T014–T025) antes de impl (T026–T032). Puertos (T027)→dominio (T028)+adaptadores (T029)→handler (T030)→ruta (T031)→verde (T032). Zod (T026) [P].
- **Polish (T033–T036)** al final.

### Parallel Opportunities

- Foundational: T003, T010, T012 [P] (T008 antes de T009).
- US1 tests: T014–T025 casi todos [P] (ficheros distintos).
- Polish: T033, T034 [P].

---

## Implementation Strategy

**MVP = US1 completo.** Setup → Foundational (arch test verde) → US1 (Red→impl→verde) → Polish → G3. No hay
US2 (If-Match/409 es stretch, fuera de alcance).

## Notes

- TDD: cada test Red **falla** antes de implementar; commit en rojo (VII). Excepción: T006 = verificación
  post-migración (verde tras aplicar).
- Residuales aceptados (documentados): BL-001 (If-Match/409), BL-063/064/066 (hardening), BL-067 (gobernanza XI),
  BL-002/051/055 (heredados). Ninguno bloquea el MVP.
