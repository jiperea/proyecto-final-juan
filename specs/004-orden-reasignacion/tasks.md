---

description: "Task list — 004-orden-reasignacion"
---

# Tasks: Reasignación de una orden por el dispatcher

**Input**: Design documents from `specs/004-orden-reasignacion/`

**Prerequisites**: plan.md ✓ (G2-remediado ×2), spec.md ✓ (G1 PASS, congelada), research.md ✓ (D-01..D-14), data-model.md ✓, contracts/ ✓, quickstart.md ✓

**Tests**: OBLIGATORIOS (Constitution VII — TDD fase Red: commit del test en rojo **antes** de implementar).

**Organization**: por user story. US1 (P1) = MVP; US2 (P3) = stretch (If-Match), no bloquea gate.

> Regenerada tras la re-entrada de G2: N1 (sin 503, todo error de BD→500), N2 (primitiva devuelve snapshot crudo;
> clasifica el dominio), N3 (byte-idéntico por reescritura de code), N5 (orderId uuid→404), N6 (flujo migración),
> N7 (lectura única de visibilidad). Conserva G1 (actor FR-011, regresión sendError) y G2-previos (orden
> visibilidad→body, puerto de visibilidad, destino en dominio, arch test en Foundational).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: paralelizable (ficheros distintos, sin dependencias abiertas).
- Rutas reales del repo (backend hexagonal). `status`/`version` sólo mutan desde `domain/order/write-side/` + su repo de infra (FR-007).

---

## Phase 1: Setup (Shared Infrastructure)

- [ ] T001 Verificar rama `004-orden-reasignacion`, BD de test arriba (`docker compose up -d db-test`, puerto 5433) y que `npm run test` de 002b pasa en verde (baseline antes de refactor).
- [ ] T002 Confirmar que el contrato `contracts/orders.openapi.yaml` incluye `reassignOrder` (200/401/403/404/409/422/500) y que `npm run build`/`tsc` compila el repo actual sin errores.

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ CRITICAL**: bloquea US1/US2. Checkpoint **real**: el arch test (T009) queda en verde aquí.

- [ ] T003 [P] Extender `backend/prisma/schema.prisma`: `enum OrderAuditEventType { transition reassignment }`; en `OrderAudit` añadir `eventType OrderAuditEventType @default(transition) @map("event_type")`, `fromAssignee String? @db.Uuid @map("from_assignee")`, `toAssignee String? @db.Uuid @map("to_assignee")` con relaciones FK→User `onDelete: Restrict` (data-model.md).
- [ ] T004 Crear migración con **`prisma migrate dev --create-only`** y **editar a mano** el SQL generado (`backend/prisma/migrations/<ts>_extend_order_audit_reassignment/migration.sql`): `CREATE TYPE` + `ADD COLUMN event_type NOT NULL DEFAULT 'transition'` (backfill implícito) + 2 `ADD COLUMN` UUID; las **FKs nuevas** con `ADD CONSTRAINT ... NOT VALID` + `VALIDATE CONSTRAINT` en pasos separados (evita lock largo, D-05/N6); **conservar** el trigger append-only. Añadir `down.sql`. Documentar en el fichero que el SQL es artesanal (no regenerar con `migrate dev` a ciegas). (N6)
- [ ] T005 Aplicar la migración (`prisma migrate deploy`/`dev`) y regenerar el client Prisma.
- [ ] T006 (Verificación post-migración — no Red de negocio) Test `backend/tests/integration/order-audit-migration.spec.ts` (**verde tras T005**): las filas de auditoría legacy de 002b tienen `event_type='transition'` y `from_assignee/to_assignee` NULL; el trigger append-only sigue rechazando UPDATE/DELETE con `restrict_violation`.
- [ ] T007 Refactor módulo write-side (dominio): crear `backend/src/domain/order/write-side/` y **mover** `apply-transition.ts` (+ `transition-ports.ts` si aplica) desde `domain/order/`; actualizar imports. `applyTransition` **sin cambio de comportamiento** (su clasificador 002b intacto, XV).
- [ ] T008 Refactor write-side (infra) — **rename adelantado a Foundational**: renombrar `order-transition-repository.ts` → `backend/src/infra/repositories/order-write-side-repository.ts`; extraer la primitiva privada `conditionalWriteWithAudit` que hace SOLO el boilerplate (UPDATE condicional + insert auditoría en `$transaction`) y **devuelve un snapshot crudo** `{count, order:{id,status,version}|null}` en 0 filas, **sin clasificar** (N2). `applyTransition` mantiene su propio clasificador de 002b sobre ese resultado (comportamiento intacto). Actualizar `infra/container.ts`. `npm run test` de 002b **verde**.
- [ ] T009 (arch test, verde en Foundational) `backend/tests/unit/write-side-boundary.spec.ts`: ningún fichero fuera de `domain/order/write-side/*` ni de `infra/repositories/order-write-side-repository.ts` referencia escrituras de `status`/`version`. Debe quedar **verde** al cierre de Foundational (por eso el rename es T008). **Commit del test primero** (cierra BL-065).
- [ ] T010 [P] Catálogo de errores en `backend/src/domain/result.ts` (`ErrorCode`) y `backend/src/handlers/error-mapper.ts` (`STATUS`): añadir `INVALID_ASSIGNEE→422`, `FORBIDDEN_ROLE→403`, `ORDER_NOT_REASSIGNABLE→404` (reusa `VERSION_CONFLICT→409`, `VALIDATION_ERROR→422`, `ORDER_NOT_FOUND→404`). **Mecanismo byte-idéntico (N3)**: caso explícito en `error-mapper` que, para `ORDER_NOT_REASSIGNABLE`, **reescribe el cuerpo al de `ORDER_NOT_FOUND`** (mismo `code` genérico, sin `details`) antes de serializar — NO emite el nombre del ErrorCode. Añadir `agentAction?` a `DomainError` y emitir `agent_action` en `sendError` **sólo cuando el DomainError lo aporta** (opcional, retrocompatible).
- [ ] T011 (Guarda de regresión — I1) Re-ejecutar los contract/integration tests de error de **001** y **002** y confirmar retrocompatibilidad de `sendError` (T010): cuerpos existentes intactos; sin `agent_action` cuando no se aporta (401/403 heredados no cambian).
- [ ] T012 [P] Ampliar `REDACT_PATHS` en `backend/src/infra/logger.ts` para cubrir `reason` **anidado** del payload real (`req.body.reason`, `err.reason`/`error.cause`), FR-009/BL-059.
- [ ] T013 Catch-all de errores de BD en `backend/src/handlers/error-mapper.ts` (D-10, conforme FR-010): **todo** error de BD ≠ FK-asignatario (deadlock, timeout, **BD no disponible**, UUID no atrapado, constraint futura) → **500** genérico `{code,message,agent_action}` sin filtrar SQLSTATE/constraint/columna/query; FK del asignatario (`P2003`) → `INVALID_ASSIGNEE` (422). **NO** hay 503 (reconciliación diferida a BL-066). Catch-all de nivel superior (extiende `jsonErrorHandler`).

**Checkpoint**: esquema migrado, módulo write-side **completo y aislado** (arch test T009 verde), catálogo de errores + byte-idéntico + catch-all 500 listos. US1 puede empezar.

---

## Phase 3: User Story 1 - Reasignar una orden a otro técnico (Priority: P1) 🎯 MVP

**Goal**: un dispatcher reasigna una orden reasignable a un técnico válido, conservando estado, con
`version`+1 y auditoría append-only atómica; RBAC dispatcher-only y no-enumeración por construcción.

**Independent Test**: `POST /v1/orders/{id}/reassignments` (dispatcher, orden reasignable, destino válido,
reason) → 200 + `assigned_to=T2` + estado intacto + `version`+1 + 1 fila auditoría `reassignment`. No-dispatcher
/ orden no reasignable / destino inválido rechazados sin efecto.

### Tests for User Story 1 (TDD — escribir y ver FALLAR antes de implementar) ⚠️

- [ ] T014 [P] [US1] (Red) Contract test `backend/tests/contract/reassign.contract.spec.ts`: forma exacta de 200/401/403/404/409/422/500 (status, header `ETag`, keys del body, `additionalProperties:false`; `agent_action` presente en respuestas de negocio 404/409/422/500, no exigido en 401/403) por `operationId` reassignOrder. **Commit en rojo.**
- [ ] T015 [P] [US1] (Red) Unit dominio `backend/tests/unit/reassign-order.spec.ts`: `reassignOrder` con **fakes** de `OrderVisibilityPort`/`UserLookupPort`/primitiva atómica (la primitiva fake devuelve `{count, order:{id,status,version}|null}`) — happy path; validación de destino (4 causas→INVALID_ASSIGNEE); **clasificación de 0-filas con precedencia status>version en el DOMINIO** (404 fuera de ámbito antes que 409) sobre el snapshot crudo. **Commit en rojo.** (N2)
- [ ] T016 [P] [US1] (Red) Integración happy path + auditoría `backend/tests/integration/reassign-order.spec.ts`: 200, `assigned_to=T2`, `status` intacto, `version`+1, **1** fila `event_type=reassignment` con `from_assignee/to_assignee/reason`; incluye **orden huérfana** (`assignedTo=null`→`from_assignee=NULL`). (SC-001; escenarios 1/2/11)
- [ ] T017 [P] [US1] (Red) Integración RBAC `backend/tests/integration/reassign-order-rbac.spec.ts`: 401 sin auth; 403 `FORBIDDEN_ROLE` technician/supervisor; sin efecto. (SC-002, FR-003)
- [ ] T018 [P] [US1] (Red) Integración no-enumeración `backend/tests/integration/reassign-order-notfound.spec.ts`: 404 **byte-idéntico** (cuerpo+cabeceras, `code`=`ORDER_NOT_FOUND`, sin `details`) entre las **cuatro** vías — inexistente, existente-no-reasignable (`ORDER_NOT_REASSIGNABLE` colapsado), colapso post-UPDATE (escenario 9) y **`orderId` malformado** (no uuid, N5). (SC-003/SC-008, FR-002/FR-004, D-04/D-14)
- [ ] T019 [P] [US1] (Red — B1/D-11) Integración **orden de validación** `backend/tests/integration/reassign-order-precedence.spec.ts`: **orden no visible × body inválido** (reason ausente/>500cp / campo extra / `assignee_id` mal formado) → **404** (no 422); la visibilidad precede a la validación de forma. **Commit en rojo.** (FR-004, D-11)
- [ ] T020 [P] [US1] (Red) Integración destino inválido `backend/tests/integration/reassign-order-assignee.spec.ts`: 422 `INVALID_ASSIGNEE` con cuerpo **genérico idéntico** para las 4 causas, **sobre orden visible**. (SC-005, FR-005)
- [ ] T021 [P] [US1] (Red) Integración validación+no-fuga de `reason` `backend/tests/integration/reassign-order-reason.spec.ts`: sobre orden visible, 422 `VALIDATION_ERROR` para ausente/vacío/whitespace/control / >500 code points (acepta emoji, code points); **y el cuerpo del 422 NO reproduce el `reason`** (ni `message`, ni `details.fields`, ni logs). (FR-006/FR-009, G2-A4)
- [ ] T022 [P] [US1] (Red) Integración concurrencia `backend/tests/integration/reassign-order-concurrency.spec.ts`: (a) N concurrentes misma version → 1 éxito, resto 409, sin doble auditoría; (b) carrera cruzada reasignación↔transición-FSM → **404** (no 409). (SC-004, FR-008)
- [ ] T023 [P] [US1] (Red) Integración atomicidad `backend/tests/integration/reassign-order-atomicity.spec.ts`: forzar fallo del insert de auditoría en la tx → orden intacta, 0 filas auditoría; sin SQL crudo. (SC-009, FR-007)
- [ ] T024 [P] [US1] (Red) Integración errores de BD `backend/tests/integration/reassign-order-errors.spec.ts`: error de BD ≠ FK (incl. BD no disponible) → **500** genérico sin SQLSTATE/constraint/columna/query. (SC-007, FR-010, D-10)
- [ ] T025 [P] [US1] (Red — G1) Integración actor infalsificable `backend/tests/integration/reassign-order-actor.spec.ts`: `actor`/`actor_id` **espurio en el body** → rechazado por `.strict()` (422) **sobre orden visible**; la auditoría registra `actor_id = userId del token`, nunca el del body. (FR-011)

### Implementation for User Story 1

- [ ] T026 [P] [US1] Zod `reassignRequestSchema` (`.strict()`) + DTOs snake_case en `backend/src/handlers/contract/schemas.ts` y `order-types.ts`: `assignee_id` uuid; `reason` refinamiento por **code points** (`[...reason].length ∈ [1,500]`) + ≥1 carácter imprimible (no `.max()` UTF-16, D-13); sin campo actor.
- [ ] T027 [US1] Puertos en `backend/src/domain/order/write-side/write-side-ports.ts`: `OrderVisibilityPort.findReassignable(orderId)→{id,assignedTo,version}|null` (D-12), `UserLookupPort.findAssignableTechnician(id)` (D-07), firma de `reassignOrder` y de `conditionalWriteWithAudit` (devuelve snapshot crudo, N2).
- [ ] T028 [US1] Caso de uso `backend/src/domain/order/write-side/reassign-order.ts`: recibe el **snapshot de visibilidad** (no relee, N7); **valida destino** (vía `UserLookupPort`, FR-005) y `reason`; invoca la primitiva atómica; **clasifica** el snapshot crudo de 0-filas con **precedencia status>version** (ORDER_NOT_FOUND→ORDER_NOT_REASSIGNABLE(404)→VERSION_CONFLICT(409)); devuelve `Result`. (depende de T027; el DOMINIO clasifica, N2)
- [ ] T029 [US1] Adaptadores en `backend/src/infra/repositories/order-write-side-repository.ts`: implementar `OrderVisibilityPort` (consulta única `WHERE id AND status IN {assigned,in_progress}` → snapshot); el `conditionalWriteWithAudit` de reasignación (UPDATE `assigned_to=T2, version+1` + insert auditoría `reassignment`) **devuelve `{count, order|null}` sin clasificar** (N2); mapea `P2003`→INVALID_ASSIGNEE. `UserLookupPort` sobre `user-repository`/Prisma. (depende de T027)
- [ ] T030 [US1] Handler **delgado** `backend/src/handlers/orders/reassign.ts` (D-11/D-14/N7): (1) `req.auth` (actor server-side); (2) **validar `orderId` uuid** → si malformado, 404 genérico byte-idéntico (antes de Prisma, D-14); (3) **una** llamada `OrderVisibilityPort.findReassignable` → null ⇒ 404 genérico; (4) **sólo si visible**: parseo Zod del body + delega en `reassignOrder` **pasándole el snapshot** → 422; (5) 200 con `ETag`; errores vía `sendError` con `agent_action`. NO usa Prisma directo; NO valida destino ni relee. (depende de T028, T029, T026)
- [ ] T031 [US1] Cablear ruta en `backend/src/handlers/app.ts`: `POST /orders/{orderId}/reassignments` con `authenticate` + `requireRole('dispatcher')` + `correlation`; exponer puertos en `AppDeps`/`infra/container.ts`. La validación de forma del body va **dentro del handler** (tras visibilidad), **no** como middleware previo (D-11). (depende de T030)
- [ ] T032 [US1] Verificar en verde T014–T025; ajustar `agent_action` por código y correlation-ID en respuesta+logs. (SC-010 correlation)

**Checkpoint**: US1 completa y testeable de forma independiente (MVP). Cobertura ≥80% dominio/handlers.

---

## Phase 4: User Story 2 - Concurrencia optimista explícita con If-Match (Priority: P3, stretch)

**Goal**: exponer al cliente el control de concurrencia (`If-Match`), sin alterar la precedencia de FR-008/D-11.

**Independent Test**: `If-Match` obsoleto → 409; correcto → 200; fuera de ámbito + `If-Match` obsoleto → 404.

### Tests for User Story 2 (TDD — Red) ⚠️

- [ ] T033 [P] [US2] (Red) Integración `backend/tests/integration/reassign-order-ifmatch.spec.ts`: `If-Match:"0"` obsoleto → 409 + `ETag` vigente; `If-Match:"1"` correcto → 200 + `ETag:"2"`; orden fuera de ámbito + `If-Match` obsoleto → **404** (precedencia, S-007). Sin cabecera → comportamiento de US1. **Commit en rojo.** (FR-012, SC-004)

### Implementation for User Story 2

- [ ] T034 [US2] Parsear `If-Match` en `backend/src/handlers/orders/reassign.ts`: si presente, `expectedVersion` = versión del cliente; la comprobación de visibilidad/status **precede** a la de version también por esta vía. (depende de T030)
- [ ] T035 [US2] Verificar T033 en verde; documentar que sin `If-Match` la concurrencia interna de FR-008 sigue protegiendo.

**Checkpoint**: US1 + US2 funcionan; US2 es opcional y no bloquea el gate.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [ ] T036 [P] Actualizar `docs/traceability.md`: RF→endpoint→tarea→test de 004 (incl. "Migración (OrderAudit)", orden de validación T019, `orderId` malformado T018, actor FR-011/T025).
- [ ] T037 [P] Test de latencia `backend/tests/integration/reassign-order-latency.spec.ts`: p95 de 50 reasignaciones secuenciales (BD caliente, warm-up descartado) < 300 ms; correlation-ID presente. (SC-010)
- [ ] T038 Ejecutar `npm run test` completo con cobertura; confirmar gate (dominio ≥80%, handlers/servicios ≥80%, 100% contract + clasificación 0-filas) y `tsc`/`eslint` limpios; confirmar 001/002 verdes (regresión, I1).
- [ ] T039 Ejecutar la validación de `quickstart.md` (21 escenarios) y anotar residuales abiertos (BL-063/064/065/066/BL-055/051/002) en `docs/backlog.md` si procede.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (T001–T002)**: sin dependencias.
- **Foundational (T003–T013)**: depende de Setup; **BLOQUEA** US1/US2. Orden: T003→T004→T005→T006; T007→T008→T009 (arch test verde); T010→T011; T012; T013.
- **US1 (T014–T032)**: depende de Foundational. Tests Red (T014–T025) antes de impl (T026–T032).
- **US2 (T033–T035)**: depende de US1 (extiende el handler). Stretch.
- **Polish (T036–T039)**: depende de las US deseadas.

### Within User Story 1

- Tests (T014–T025) **en rojo** antes de implementar.
- Puertos (T027) → dominio (T028, clasifica) + adaptadores (T029, snapshot crudo) → handler delgado (T030) → ruta (T031) → verde (T032).
- Zod/DTOs (T026) [P] en paralelo a T027.

### Parallel Opportunities

- Foundational: T003, T010, T012 [P]; T008 antes de T009.
- US1 tests: T014–T025 casi todos [P] (ficheros distintos).
- Polish: T036, T037 [P].

---

## Parallel Example: User Story 1 (tests Red)

```bash
Task: "Contract test reassignOrder en backend/tests/contract/reassign.contract.spec.ts"
Task: "Unit dominio (clasificación status>version sobre snapshot) en backend/tests/unit/reassign-order.spec.ts"
Task: "Integración no-enum (4 vías byte-idéntico, incl. orderId malformado) en backend/tests/integration/reassign-order-notfound.spec.ts"
Task: "Integración orden de validación (no-visible × body inválido → 404) en backend/tests/integration/reassign-order-precedence.spec.ts"
Task: "Integración actor infalsificable en backend/tests/integration/reassign-order-actor.spec.ts"
```

---

## Implementation Strategy

### MVP First (US1)

1. Phase 1 Setup → 2. Phase 2 Foundational (CRÍTICO, bloquea; arch test verde) → 3. Phase 3 US1 → **STOP y
   validar** US1 independiente (escenarios 1–14, 16–21) → listo para G3.

### Incremental

- US1 (MVP) → validar/demostrar → US2 (If-Match stretch) → validar → Polish.

---

## Notes

- `[P]` = ficheros distintos, sin dependencias abiertas.
- TDD: cada test Red **falla** antes de implementar; commit del test en rojo (Constitution VII). Excepción:
  T006 es verificación post-migración (verde tras aplicar), no un Red de negocio.
- Cierres G2 (re-entrada): N1→T013/T024/T014 (sin 503, todo→500); N2→T008/T028/T029/T015 (snapshot crudo,
  dominio clasifica); N3→T010 (reescribe code a ORDER_NOT_FOUND); N5→T018/T030 (orderId uuid→404 byte-idéntico);
  N6→T004 (migrate --create-only + NOT VALID/VALIDATE); N7→T028/T030 (lectura única de visibilidad).
- Cierres G2 previos: B1→T019/T030/T031; A1→T008/T009; A2→T028/T030; A3→T027/T029/T030; A4→T021. G1: T025, T011.
- Residuales aceptados (documentados, no bloquean G3): BL-063 (TOCTOU destino), BL-064 (timing 422),
  BL-065 (cerrado por T009), BL-066 (503-vs-500, revisión de spec futura), BL-051/055 (PII reason),
  BL-002 (accesos denegados — Complexity Tracking).
