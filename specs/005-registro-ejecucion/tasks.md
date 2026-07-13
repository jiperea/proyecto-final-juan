---

description: "Task list — 005-registro-ejecucion (MAGRO)"
---

# Tasks: Registro de ejecución por el técnico (MVP magro)

**Input**: Design docs de `specs/005-registro-ejecucion/` (spec G1 PASS remediada; plan/research/data-model/
contrato/quickstart alineados).

**Tests**: OBLIGATORIOS (Constitution VII — TDD fase Red: commit del test en rojo **antes** de implementar).

**Organization**: dos user stories P1 (ambas MVP). **US1** = iniciar trabajo (`startOrderWork`, reutiliza
`applyTransition`). **US2** = registrar ejecución (`submitOrderExecution`, entidades + tx atómica). US1 es
demostrable por sí sola; US2 depende de la Foundational y es independiente de US1.

## Format: `[ID] [P?] [Story] Description`

- **[P]** = paralelizable (ficheros distintos, sin dependencias abiertas). Rutas reales del repo hexagonal.
- `status`/`version` sólo mutan desde `domain/order/write-side/` + `infra/repositories/order-write-side-repository.ts` (FR-006/007).
- Contrato: `contracts/orders.openapi.yaml` (`startOrderWork`, `submitOrderExecution`) — ya extendido en Plan.

---

## Phase 1: Setup

- [ ] T001 Verificar rama `005-registro-ejecucion`, BD de test arriba (`docker compose up -d db-test`, puerto 5433) y `npm run test` de 001/002/004 en verde (baseline de no-regresión).
- [ ] T002 Confirmar que `contracts/orders.openapi.yaml` incluye `startOrderWork` y `submitOrderExecution` (200/401/403/404/422/500) + schemas `ExecutionRequest`/`EvidenceRef`, y que `tsc`/`npm run build` compilan.

---

## Phase 2: Foundational (Blocking) ⚠️ bloquea US1 y US2

- [ ] T003 [P] Extender `backend/prisma/schema.prisma` (**aditivo**): `model OrderEvidence` (`id` uuid PK, `orderId`→orders RESTRICT, `objectRef @map("object_ref") @db.Text`, `contentType @map("content_type")`, `sizeBytes Int @map("size_bytes")`, `uploadedBy`→users RESTRICT, `attempt Int? `, `at @default(now()) @db.Timestamptz(3)`; índice `orderId`) y `model OrderExecutionNotes` (`id` uuid PK, `orderId`→orders RESTRICT, `auditId`→order_audit RESTRICT, `notes @db.Text`, `attempt Int?`, `createdBy`→users RESTRICT, `at`; índices `orderId`,`auditId`). **Sin ALTER** sobre `orders`/`order_audit`.
- [ ] T004 Crear migración con `prisma migrate dev --create-only` y **editar** `backend/prisma/migrations/<ts>_add_order_evidence_and_execution_notes/migration.sql`: `CREATE TABLE order_evidence` (+FKs RESTRICT, +índice) con **trigger append-only** (mismo patrón que `order_audit`: rechaza UPDATE/DELETE con `restrict_violation`); `CREATE TABLE order_execution_notes` (+FKs RESTRICT, +índices) **sin** trigger (debe admitir purga, IX). `down.sql`: `DROP TABLE` de ambas + trigger.
- [ ] T005 Aplicar migración (`prisma migrate`) y regenerar el client Prisma.
- [ ] T006 (Verificación post-migración) Test `backend/tests/integration/order-evidence-migration.spec.ts` (verde tras T005): `order_evidence` rechaza UPDATE/DELETE (append-only); `order_execution_notes` **permite** UPDATE/DELETE (purgable); FKs RESTRICT presentes. **Commit del test primero.**
- [ ] T007 [P] Catálogo de errores en `backend/src/domain/result.ts` (`ErrorCode`) y `backend/src/handlers/error-mapper.ts` (`STATUS`): +`EVIDENCE_REQUIRED`→422, +`INVALID_EVIDENCE`→422. Confirmar mapeos existentes: `INVALID_TRANSITION`→**422**, `GUARD_UNMET`→**404** (no-enumeración), `ORDER_NOT_FOUND`→404, `VALIDATION_ERROR`→422, `FORBIDDEN_ROLE`→403 (reutiliza de 004). El error-mapper sigue **genérico** (no inspecciona Prisma); catch-all de BD → 500.
- [ ] T008 (Guarda de regresión) Re-ejecutar tests de error de 001/002/004; confirmar que las adiciones de T007 son retrocompatibles (cuerpos intactos).
- [ ] T009 [P] Ampliar `REDACT_PATHS` en `backend/src/infra/logger.ts` para `notes` y `object_ref` anidados (`req.body.notes`, `req.body.evidence[*].object_ref`, `error.cause`), FR-005 (grep negativo).
- [ ] T010 [P] Reglas de validación de evidencia (dominio puro) — **test primero** `backend/tests/unit/evidence.spec.ts` (Red): ≥1 y ≤10; `content_type` en allowlist (`image/jpeg|png|webp|heic`); `0 < size_bytes ≤ 26214400`; `object_ref` 1..512 code points, sin control/whitespace de borde; **sin duplicados** (igualdad exacta). Casos límite (0, 11, tipo inválido, size 0/26214401, ref vacío/>512, ref con `\n`, duplicado). Luego implementar `backend/src/domain/order/evidence.ts` (funciones puras `validateEvidence` → `Result`, códigos `EVIDENCE_REQUIRED`/`INVALID_EVIDENCE`).

**Checkpoint**: esquema migrado (2 tablas nuevas), errores/logger listos, validación de evidencia pura verde. US1 y US2 pueden empezar.

---

## Phase 3: User Story 1 — Iniciar el trabajo (P1) 🎯 MVP

**Goal**: un technician inicia su orden `assigned` → `in_progress` (200, version+1, 1 auditoría).

**Independent test**: `POST /v1/orders/{id}/start` sobre orden `assigned` propia → 200 `in_progress`; ajena/otro
rol/estado inválido → rechazado sin efecto (precedencia 401→403→404→422).

- [ ] T011 [P] [US1] Contract test `backend/tests/contract/start-order-work.contract.spec.ts` (Red): `startOrderWork` × cada código (200/401/403/404/422/500) contra el schema del contrato. **Commit en rojo primero.**
- [ ] T012 [P] [US1] Integration test `backend/tests/integration/start-order-work.spec.ts` (Red): orden `assigned` propia → 200, `in_progress`, version+1, **1** auditoría `transition` (`from_status=assigned`,`to_status=in_progress`,`actor=T`, `reason` NULL); orden de T2 (cualquier estado) → 404; orden propia `in_progress`/`closed` → 422 `INVALID_TRANSITION`; dispatcher → 403; sin token → 401. **Commit en rojo primero.**
- [ ] T013 [US1] Handler delgado `backend/src/handlers/orders/start.ts`: `authenticate`→`requireRole('technician')`→`applyTransition({toStatus:'in_progress', guard:{assignedTo: actorId}, actorId})` con `expectedVersion` derivado server-side; mapear `Result` (200 orden / errores vía error-mapper). Sin cuerpo.
- [ ] T014 [US1] Montar ruta `POST /v1/orders/:orderId/start` en `backend/src/handlers/app.ts` con `authenticate` + `requireRole('technician')`. `orderId` malformado → 404 (no 400).

**Checkpoint US1**: T011/T012 en verde; "entro y arranco mi orden" demostrable.

---

## Phase 4: User Story 2 — Registrar la ejecución con evidencia (P1) 🎯 MVP

**Goal**: technician registra ejecución de su orden `in_progress` → `pending_review` con ≥1 evidencia válida y
notas, en una sola transacción (transición + auditoría reason-opaco + evidencia + notas).

**Independent test**: `POST /v1/orders/{id}/execution` (in_progress propia, 1 evidencia válida + notas) → 200
`pending_review`, version+1, 1 auditoría, 1 fila notas, ≥1 evidencia; sin evidencia/evidencia inválida/notas
inválidas/orden ajena/estado incorrecto → rechazado **sin efecto** (atomicidad).

- [ ] T015 [P] [US2] Zod `executionRequestSchema` en `backend/src/handlers/contract/schemas.ts` (`.strict()`, derivado del contrato): `notes` 1..2000 code points (contar code points, ≥1 imprimible); `evidence` array 1..10 de `{object_ref, content_type, size_bytes}`. DTOs `snake_case` en `order-types.ts`.
- [ ] T016 [P] [US2] Domain use case — **test primero** `backend/tests/unit/submit-execution.spec.ts` (Red): valida evidencia (reutiliza `evidence.ts`) **antes** que notas; notas por forma; precedencia; devuelve intención de escritura (no toca BD, puerto mockeado). Luego `backend/src/domain/order/write-side/submit-execution.ts` (puro; delega en `OrderExecutionPort`).
- [ ] T017 [US2] Extender `backend/src/domain/order/write-side/write-side-ports.ts`: `OrderExecutionPort.submitExecution(input)` (orden, actor, toStatus, reason opaco, evidencias[], notas) → `Result<OrderRecord>`; errores 005.
- [ ] T018 [US2] Integration test `backend/tests/integration/submit-execution.spec.ts` (Red): happy path (200, `pending_review`, version+1, 1 auditoría `reason="execution_registered"`, 1 fila `order_execution_notes`, ≥1 `order_evidence`); 0 evidencias → 422 `EVIDENCE_REQUIRED`; evidencia inválida/duplicada/>10 → 422 `INVALID_EVIDENCE`; notas vacías/>2000 → 422 `VALIDATION_ERROR`; orden ajena → 404; orden propia `assigned`/`pending_review` → 422 `INVALID_TRANSITION`. **Commit en rojo primero.**
- [ ] T019 [US2] Implementar `submitExecution` en `backend/src/infra/repositories/order-write-side-repository.ts`: **1 `$transaction`** — UPDATE condicional (`in_progress→pending_review`, `version`+guard en WHERE; 0 filas → `classifyZeroRows`) → `OrderAudit` (`event_type=transition`, `reason="execution_registered"`) → `OrderEvidence[]` → `OrderExecutionNotes` (`audit_id`=auditoría). `uploaded_by`/`created_by` del token. Actualizar `infra/container.ts`. **`applyTransition` NO cambia.**
- [ ] T020 [US2] Test de atomicidad `backend/tests/integration/submit-execution-atomicity.spec.ts` (Red→verde): forzar fallo en la inserción de **evidencia**, **auditoría** y **notas** (por separado) → orden **no** transiciona (status/version intactos; 0 filas nuevas de ese intento en las 3 tablas). **Commit en rojo primero.**
- [ ] T021 [US2] Handler delgado `backend/src/handlers/orders/execution.ts`: `authenticate`→`requireRole('technician')`→parse `executionRequestSchema` (422 `VALIDATION_ERROR` si cuerpo mal formado)→`submit-execution` (dominio)→map `Result`. Nunca serializa `notes`/`object_ref` en errores.
- [ ] T022 [US2] Montar ruta `POST /v1/orders/:orderId/execution` en `backend/src/handlers/app.ts` con `authenticate` + `requireRole('technician')`.

**Checkpoint US2**: T011..T022 en verde; "registro mi ejecución con foto" demostrable end-to-end.

---

## Phase 5: Polish & Cross-Cutting

- [ ] T023 [P] Arch test — extender `backend/tests/unit/write-side-boundary.spec.ts`: la nueva ruta de ejecución **no** muta `status`/`version` fuera de `domain/order/write-side/*` + `order-write-side-repository.ts`.
- [ ] T024 [P] No-fuga PII `backend/tests/integration/execution-pii-redaction.spec.ts` (SC-007): registrar con `notes` y `object_ref` centinela; grep negativo en logs y en el cuerpo de error; `OrderAudit.reason` = `"execution_registered"` (sin el texto de notas).
- [ ] T025 [P] Saneo de errores de BD (SC-008): forzar error de BD en execution/start → 500 genérico sin SQLSTATE/constraint/columna/query.
- [ ] T026 [P] Latencia (SC-009): p95 < 300 ms (50 req secuenciales, BD caliente, nearest-rank) en ambos endpoints; correlation-ID en respuesta y logs.
- [ ] T027 [P] Trazabilidad: actualizar `docs/traceability.md` (FR-001→`startOrderWork`; FR-002/004/005/006→`submitOrderExecution`; FR-003/007/008→ambos; SC-001..009→tests).
- [ ] T028 Registrar en backlog el ítem de **cifrado en reposo + purga** de `OrderExecutionNotes.notes` (IX; distinto de BL-051/055) y la referencia en `docs/06-roadmap.md`/`Assumptions` si procede.
- [ ] T029 Cobertura y regresión final: dominio ≥80%, handlers/servicios ≥80%; `npm run test` completo verde (001/002/004/005). Preparar para `/speckit-analyze` → G2.

---

## Dependencias y orden

```
Setup (T001-T002)
  └─ Foundational (T003-T010)  ⚠️ bloquea todo
        ├─ US1 (T011-T014)   ← demostrable solo
        └─ US2 (T015-T022)   ← independiente de US1
              └─ Polish (T023-T029)
```

- **Foundational** bloquea ambas US (esquema, errores, logger, validación de evidencia).
- **US1** y **US2** son independientes entre sí (ficheros/rutas distintos) — pueden ir en paralelo tras Foundational.
- **Polish** tras ambas US.

## Paralelismo

- Foundational: T003 ∥ T007 ∥ T009 ∥ T010 (ficheros distintos); T004→T005→T006 secuencial (migración).
- US1: T011 ∥ T012 (tests); luego T013→T014.
- US2: T015 ∥ T016 (schema Zod ∥ dominio); T017→T018→T019→T020→T021→T022.
- Polish: T023..T027 en paralelo.

## MVP

**MVP mínimo demostrable** = Setup + Foundational + **US1** ("inicio mi orden"). El MVP **funcional completo** de
la feature (Brief Func #2 "registro con ≥1 foto") requiere **US2**. Ambas son P1.
