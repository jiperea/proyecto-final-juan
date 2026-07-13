---

description: "Task list — 005-registro-ejecucion (MAGRO)"
---

# Tasks: Registro de ejecución por el técnico (MVP magro)

**Input**: Design docs de `specs/005-registro-ejecucion/` (spec G1 PASS + G2 remediado; plan/research/data-model/
contrato/quickstart alineados).

**Tests**: OBLIGATORIOS (Constitution VII — TDD fase Red: commit del test en rojo **antes** de implementar).

**Organization**: dos user stories P1 (ambas MVP). **US1** = iniciar trabajo (`startOrderWork`). **US2** =
registrar ejecución (`submitOrderExecution`). Ambas reutilizan el **clasificador propio de 005** (Foundational
T010b) para el 404-vs-422; son independientes entre sí.

## Format: `[ID] [P?] [Story] Description`

- **[P]** = paralelizable (ficheros distintos, sin dependencias abiertas). Rutas reales del repo hexagonal.
- `status`/`version` sólo mutan desde `domain/order/write-side/` + `infra/repositories/order-write-side-repository.ts` (FR-006/007).
- **Patrón de 005 (G2)**: start/execution usan un **puerto propio de 005** (como 004 `reassign`), **no** reutilizan
  `applyTransition()`/`classifyZeroRows` de 002b para clasificar (su precedencia es pertenencia-última). El
  UPDATE condicional keyea `status=<origen> AND assigned_to=<actor>`; el `expectedVersion` se lee **dentro** de la
  `$transaction`; si 0 filas → clasificador **T010b** (pertenencia→estado→versión). `applyTransition` de 002b NO se toca.

---

## Phase 1: Setup

- [X] T001 Verificar rama `005-registro-ejecucion`, BD de test arriba (`docker compose up -d db-test`, puerto 5433) y `npm run test` de 001/002/004 en verde (baseline de no-regresión).
- [X] T002 Confirmar que `contracts/orders.openapi.yaml` incluye `startOrderWork` y `submitOrderExecution` (200/401/403/404/422/500) + schemas `ExecutionRequest`/`EvidenceRef`, y que `tsc`/`npm run build` compilan.

---

## Phase 2: Foundational (Blocking) ⚠️ bloquea US1 y US2

- [X] T003 [P] Extender `backend/prisma/schema.prisma` (**aditivo**): `model OrderEvidence` (`id` uuid PK, `orderId`→orders RESTRICT, `auditId @map("audit_id")`→order_audit RESTRICT (referencia XI a la auditoría), `objectRef @map("object_ref") @db.Text`, `contentType @map("content_type")`, `sizeBytes Int @map("size_bytes")`, `uploadedBy`→users RESTRICT, `attempt Int?`, `at @default(now()) @db.Timestamptz(3)`; índices `orderId`,`auditId`) y `model OrderExecutionNotes` (`id` uuid PK, `orderId`→orders RESTRICT, `auditId`→order_audit RESTRICT, `notes @db.Text`, `attempt Int?`, `createdBy`→users RESTRICT, `at`; índices `orderId`,`auditId`). **Sin ALTER** sobre `orders`/`order_audit`.
- [X] T004 Crear migración con `prisma migrate dev --create-only` y **editar** `backend/prisma/migrations/<ts>_add_order_evidence_and_execution_notes/migration.sql`: `CREATE TABLE order_evidence` (+FKs RESTRICT a orders/**order_audit**/users, +índices `order_id`,`audit_id`) con **trigger append-only** (mismo patrón que `order_audit`: rechaza UPDATE/DELETE con `restrict_violation`); `CREATE TABLE order_execution_notes` (+FKs RESTRICT, +índices) **sin** trigger (debe admitir purga, IX). `down.sql`: `DROP TABLE` de ambas + trigger.
- [X] T005 Aplicar migración (`prisma migrate`) y regenerar el client Prisma.
- [X] T006 (Verificación post-migración) Test `backend/tests/integration/order-evidence-migration.spec.ts` (verde tras T005): `order_evidence` rechaza UPDATE/DELETE (append-only); `order_execution_notes` **permite** UPDATE/DELETE (purgable); FKs RESTRICT presentes. **Commit del test primero.**
- [X] T007 [P] Catálogo de errores en `backend/src/domain/result.ts` (`ErrorCode`) y `backend/src/handlers/error-mapper.ts` (`STATUS`): +`EVIDENCE_REQUIRED`→422, +`INVALID_EVIDENCE`→422. Confirmar mapeos existentes: `INVALID_TRANSITION`→**422**, `GUARD_UNMET`→**404** (no-enumeración), `ORDER_NOT_FOUND`→404, `VALIDATION_ERROR`→422, `FORBIDDEN_ROLE`→403 (reutiliza de 004). **(F3/BG2 — decidido)** 005 **no usa el predicado de versión** en el UPDATE → `VERSION_CONFLICT` **no surge** en el flujo de 005. El clasificador 005 sólo emite `ORDER_NOT_FOUND`/`GUARD_UNMET` (→404) e `INVALID_TRANSITION` (→422), **nunca** `VERSION_CONFLICT`. El mapeo **global** `VERSION_CONFLICT→409` del `error-mapper` queda **intacto** (reservado a #008/BL-001). El error-mapper sigue **genérico** (no inspecciona Prisma); catch-all de BD → 500.
- [X] T008 (Guarda de regresión) Re-ejecutar tests de error de 001/002/004; confirmar que las adiciones de T007 son retrocompatibles (cuerpos intactos; `VERSION_CONFLICT→409` global sin cambios para 004/#008).
- [X] T009 [P] Ampliar `REDACT_PATHS` en `backend/src/infra/logger.ts` para `notes` y `object_ref` anidados (`req.body.notes`, `req.body.evidence[*].object_ref`, `error.cause`), FR-005 (grep negativo).
- [X] T010 [P] Reglas de validación de evidencia (dominio puro) — **test primero** `backend/tests/unit/evidence.spec.ts` (Red): ≥1 y ≤10; `content_type` en allowlist (`image/jpeg|png|webp|heic`); `0 < size_bytes ≤ 26214400`; `object_ref` 1..512 code points, sin control/whitespace de borde; **sin duplicados** (igualdad exacta byte a byte). Casos límite (0, 11, tipo inválido, size 0/26214401, ref vacío/>512, ref con `\n`, duplicado). Luego implementar `backend/src/domain/order/evidence.ts` (funciones puras `validateEvidence` → `Result`, códigos `EVIDENCE_REQUIRED`/`INVALID_EVIDENCE`).
- [X] T010b Clasificador propio de 005 (Foundational compartido) — **test primero** `backend/tests/unit/classify-execution-guard.spec.ts` (Red): recibe el snapshot de la orden re-leída **tras** un UPDATE de 0 filas y clasifica con orden **PERTENENCIA(404)→ESTADO(422)**; casos: inexistente→404, **ajena** en cualquier estado (incl. no legal)→**404 (nunca 422)**, **propia** en estado no legal→**422 `INVALID_TRANSITION`**. (Sin rama de versión: el UPDATE de 005 keyea `status`+`assigned_to` sin `version`, así que no hay 0-filas por versión; `VERSION_CONFLICT` no surge.) Luego implementar `backend/src/domain/order/write-side/classify-execution-guard.ts`: función pura `classifyExecutionGuard(current, {actorId, fromStatus, toStatus})→DomainError`. Actúa **sobre los códigos de recurso** (pertenencia/estado/versión) y sólo **después** de que el payload ya pasó su validación en el handler/dominio (payload primero, FR-003); **no** se ocupa del payload. **No** hace SELECT propio (recibe el snapshot re-leído dentro de la tx) → sin TOCTOU (AG2/H-004). **No** reutiliza ni altera `classifyZeroRows`/`applyTransition` de 002b (H-001). **Commit del test primero.**

**Checkpoint**: esquema migrado (2 tablas), errores/logger listos, validación de evidencia y **clasificador 005** verdes. US1 y US2 pueden empezar (ambas reutilizan T010b).

---

## Phase 3: User Story 1 — Iniciar el trabajo (P1) 🎯 MVP

**Goal**: un technician inicia su orden `assigned` → `in_progress` (200, version+1, 1 auditoría).

**Independent test**: `POST /v1/orders/{id}/start` sobre orden `assigned` propia → 200 `in_progress`; ajena/otro
rol/estado inválido → rechazado sin efecto (precedencia 401→403→404→422).

- [X] T011 [P] [US1] Contract test `backend/tests/contract/start-order-work.contract.spec.ts` (Red): `startOrderWork` × cada código (200/401/403/404/422/500) contra el schema del contrato. **Commit en rojo primero.**
- [X] T012 [P] [US1] Integration test `backend/tests/integration/start-order-work.spec.ts` (Red): orden `assigned` propia → 200, `in_progress`, version+1, **1** auditoría `transition` (`from_status=assigned`,`to_status=in_progress`,`actor=T`, `reason` NULL); **(H-004/H-005)** orden **ajena en estado no operable** (de T2 y `closed`) **con `version` que coincidiría con cualquier `expectedVersion`** → **404 genérico, NUNCA 422** (caso que distingue la precedencia nueva de la vieja); orden **propia** `in_progress`/`closed` → 422 `INVALID_TRANSITION`; **(H-003)** `orderId` malformado (no-uuid) → **404** (no 400/500); dispatcher → 403; sin token → 401. **Commit en rojo primero.**
- [X] T013 [US1] Uso de dominio + puerto propios de 005 para `start`: `backend/src/domain/order/write-side/start-order-work.ts` (+ `StartOrderWorkPort` en `write-side-ports.ts`) y su implementación en `backend/src/infra/repositories/order-write-side-repository.ts`. **(H-001/H-002)** **NO** reutiliza `applyTransition()` para clasificar: hace su **propio** `$transaction` — UPDATE condicional `updateMany({ where:{ id, status:'assigned', assignedTo: actorId } , data:{ status:'in_progress', version:{increment:1} }})` (WHERE **sin** `version`; `version` sólo se incrementa) → si 1 fila: escribe auditoría (`transition`, `reason` NULL) en la misma tx; si **0 filas**: re-lee y `classifyExecutionGuard` (T010b) → 404 (pertenencia) / 422 (estado). Handler delgado `backend/src/handlers/orders/start.ts`: `authenticate`→`requireRole('technician')`→**valida formato UUID de `orderId` (regex `UUID_RE`, evita P2023→500) → 404 si malformado** (start no tiene payload)→uso de dominio→map `Result`. Sin cuerpo.
- [X] T014 [US1] Montar ruta `POST /v1/orders/:orderId/start` en `backend/src/handlers/app.ts` con `authenticate` + `requireRole('technician')`.
- [X] T015 [US1] **(H-004, checkpoint temprano)** Arch/paridad test `backend/tests/unit/execution-guard-single-source.spec.ts` (verde en US1): confirmar que `start` deriva el 404-vs-422 del **mismo** `classify-execution-guard.ts` (T010b), **no** de `classifyZeroRows` de 002b (p.ej. dependency-cruiser/grep de imports, o test paramétrico con el caso "ajena en estado no legal + versión coincidente"). Evita descubrir en Polish que `start` usó la precedencia vieja.

**Checkpoint US1**: T011/T012/T015 en verde; "entro y arranco mi orden" demostrable con la precedencia correcta.

---

## Phase 4: User Story 2 — Registrar la ejecución con evidencia (P1) 🎯 MVP

**Goal**: technician registra ejecución de su orden `in_progress` → `pending_review` con ≥1 evidencia válida y
notas, en una sola transacción (transición → auditoría reason-opaco → evidencia → notas).

**Independent test**: `POST /v1/orders/{id}/execution` (in_progress propia, 1 evidencia válida + notas) → 200
`pending_review`, version+1, 1 auditoría, 1 fila notas, ≥1 evidencia; sin evidencia/evidencia inválida/notas
inválidas/orden ajena/estado incorrecto → rechazado **sin efecto** (atomicidad).

- [X] T016 [P] [US2] Zod `executionRequestSchema` en `backend/src/handlers/contract/schemas.ts` (`.strict()`, derivado del contrato): `notes` 1..2000 code points (contar code points, ≥1 imprimible); `evidence` array 1..10 de `{object_ref, content_type, size_bytes}`. DTOs `snake_case` en `order-types.ts`.
- [X] T017 [P] [US2] Domain use case — **test primero** `backend/tests/unit/submit-execution.spec.ts` (Red): valida evidencia (reutiliza `evidence.ts`) **antes** que notas; notas por forma; devuelve intención de escritura (no toca BD, puerto mockeado). Luego `backend/src/domain/order/write-side/submit-execution.ts` (puro; delega en `OrderExecutionPort`).
- [X] T018 [US2] Extender `backend/src/domain/order/write-side/write-side-ports.ts`: `OrderExecutionPort.submitExecution(input)` (orden, actor, evidencias[], notas) → `Result<OrderRecord>`; errores 005.
- [X] T019 [US2] Implementar `submitExecution` en `backend/src/infra/repositories/order-write-side-repository.ts`: **puerto propio de 005** (patrón 004 `reassign`, **NO** reutiliza `applyTransition`/`classifyZeroRows`). **1 `$transaction`** con orden ÚNICO **(K-101)**: UPDATE condicional `updateMany({ where:{ id, status:'in_progress', assignedTo: actorId }, data:{ status:'pending_review', version:{increment:1} }})` (WHERE **sin** `version`; sólo se incrementa) → si 0 filas: re-lee y `classifyExecutionGuard` (T010b) → 404 (pertenencia) / 422 (estado); si 1 fila: **auditoría** (`transition`, `reason="execution_registered"`) → **evidencia[]** (`OrderEvidence`, cada fila con `audit_id`=id de esa auditoría — referencia XI) → **notas** (`OrderExecutionNotes`, `audit_id`=auditoría). `uploaded_by`/`created_by` del token. Actualizar `infra/container.ts`. **`applyTransition` de 002b NO cambia.**
- [X] T020 [US2] Integration test `backend/tests/integration/submit-execution.spec.ts` (Red): happy path (200, `pending_review`, version+1, 1 auditoría `reason="execution_registered"`, 1 fila `order_execution_notes`, ≥1 `order_evidence`; orden de inserción auditoría→evidencia→notas); **(payload primero, FR-003)** payload inválido → 422 y se evalúa **antes** que pertenencia/estado: 0 evidencias → 422 `EVIDENCE_REQUIRED`; evidencia inválida/duplicada/>10 → 422 `INVALID_EVIDENCE`; notas vacías/>2000 → 422 `VALIDATION_ERROR`; **orden ajena con payload VÁLIDO → 404 (nunca 422)**; **orden ajena con payload INVÁLIDO → 422 (payload)** (independiente del destino; no revela nada del recurso); orden **propia** (payload válido) `assigned`/`pending_review`/`closed` → 422 `INVALID_TRANSITION`; `orderId` malformado (payload válido) → 404; **`orderId` malformado + payload inválido → 422** (payload primero, H-003); auditoría con `reason="execution_registered"` y cada `OrderEvidence` con su `audit_id`; **(FR-007)** enviar `uploaded_by`/`created_by`/`actor_id` en el cuerpo → **rechazado** (`.strict()`), valor persistido del **token**. **Commit en rojo primero.**
- [X] T021 [US2] Test de atomicidad `backend/tests/integration/submit-execution-atomicity.spec.ts` (Red→verde): forzar fallo en la inserción de **auditoría**, **evidencia** y **notas** (por separado) → orden **no** transiciona (status/version intactos; 0 filas nuevas de ese intento en las 3 tablas). **Commit en rojo primero.**
- [X] T022 [US2] Handler delgado `backend/src/handlers/orders/execution.ts`: `authenticate`→`requireRole('technician')`→**(H-003, payload primero)** parse `executionRequestSchema` + validación de dominio del payload (evidencia/notas → 422 `EVIDENCE_REQUIRED`/`INVALID_EVIDENCE`/`VALIDATION_ERROR`) **ANTES** del chequeo de formato UUID de `orderId` (regex, →404 si malformado, evita P2023→500) → así "orderId malformado + payload inválido" → **422**→`submit-execution` (dominio/puerto)→map `Result`. Nunca serializa `notes`/`object_ref` en errores. Montar ruta `POST /v1/orders/:orderId/execution` en `app.ts` con `authenticate`+`requireRole('technician')`.

**Checkpoint US2**: T011..T022 en verde; "registro mi ejecución con foto" demostrable end-to-end.

---

## Phase 5: Polish & Cross-Cutting

- [X] T023 [P] Arch test — extender `backend/tests/unit/write-side-boundary.spec.ts`: la nueva ruta de ejecución **no** muta `status`/`version` fuera de `domain/order/write-side/*` + `order-write-side-repository.ts`. (La verificación del clasificador único compartido se adelantó a T015, checkpoint US1.)
- [X] T024 [P] No-fuga PII `backend/tests/integration/execution-pii-redaction.spec.ts` (SC-007): registrar con `notes` y `object_ref` centinela; grep negativo en logs y en el cuerpo de error; `OrderAudit.reason` = `"execution_registered"` (sin el texto de notas).
- [X] T025 [P] Saneo de errores de BD (SC-008): forzar error de BD en execution/start → 500 genérico sin SQLSTATE/constraint/columna/query.
- [X] T026 [P] Latencia (SC-009): p95 < 300 ms (50 req secuenciales, BD caliente, nearest-rank) en ambos endpoints; correlation-ID en respuesta y logs.
- [X] T027 [P] Trazabilidad: actualizar `docs/traceability.md` (FR-001→`startOrderWork`; FR-002/004/005/006→`submitOrderExecution`; FR-003/007/008→ambos; SC-001..009→tests).
- [X] T028 **(obligatorio antes del merge — sin vía de escape)** Crear ítem de backlog propio de **cifrado en reposo + purga/retención** de `OrderExecutionNotes.notes` (IX; distinto de BL-051/055, que son de `OrderAudit.reason`) y referenciarlo en `docs/06-roadmap.md` + `Assumptions`. **(K-102)** El tratamiento at-rest de `OrderEvidence.object_ref` **NO** entra aquí: pertenece a **#007** (minimización de PII del binario/almacenamiento); documentarlo así. Unicidad global de `object_ref` entre órdenes: fuera de alcance (opaco, #007).
- [X] T029 Cobertura y regresión final: dominio ≥80%, handlers/servicios ≥80%; `npm run test` completo verde (001/002/004/005). Preparar para el gate G3.

---

## Dependencias y orden

```
Setup (T001-T002)
  └─ Foundational (T003-T010b)  ⚠️ bloquea todo (incluye el clasificador 005 compartido T010b)
        ├─ US1 (T011-T015)   ← demostrable solo; reutiliza T010b; T015 verifica el clasificador único (temprano)
        └─ US2 (T016-T022)   ← independiente de US1; reutiliza T010b
              └─ Polish (T023-T029)
```

- **Foundational** bloquea ambas US (esquema, errores, logger, validación de evidencia, **clasificador 005 T010b**).
- **Clasificador propio de 005** (`classify-execution-guard.ts`): se crea **una vez en Foundational (T010b)**,
  **antes** de US1/US2, y ambas lo reutilizan → US1 y US2 independientes, sin implementación duplicada/divergente.
  No altera `classifyZeroRows` de 002b.
- **US1** y **US2** son independientes entre sí (ficheros/rutas distintos) — en paralelo tras Foundational.
- **Polish** tras ambas US.

## Paralelismo

- Foundational: T003 ∥ T007 ∥ T009 ∥ T010 ∥ T010b (ficheros distintos); T004→T005→T006 secuencial (migración).
- US1: T011 ∥ T012 (tests); luego T013→T014→T015.
- US2: T016 ∥ T017 (schema Zod ∥ dominio); T018→T019→T020→T021→T022.
- Polish: T023..T027 en paralelo.

## MVP

**MVP mínimo demostrable** = Setup + Foundational + **US1** ("inicio mi orden"). El MVP **funcional completo**
(Brief Func #2 "registro con ≥1 foto") requiere **US2**. Ambas son P1.
