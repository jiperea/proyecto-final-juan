# Tasks: Revisión por el supervisor (006)

**Branch**: `006-revision-supervisor` | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

**Input**: plan magro (XV). 1 endpoint `reviewOrder` (approve/reject sobre `pending_review`). Sin migración
(reutiliza `orders`/`order_audit`/`order_evidence`). Módulo write-side **propio** (no toca `applyTransition` de
002b). 001/002a/002b/004/005 inamovibles.

## Format: `[ID] [P?] [Story] Description`

- **[P]** = paralelizable (fichero distinto, sin dependencia pendiente).
- **[US1]** Aprobar (P1) · **[US2]** Rechazar (P1). US3 (RBAC/no-enumeración, P2) es transversal → cubierta por
  tests en US1/US2 y Polish.
- **TDD fase Red**: los tests marcados "(Red)" se **commitean en rojo** antes de implementar (Constitution VII).
- Un endpoint sirve approve+reject → US1 construye el pipeline (approve como camino primario) y US2 **extiende**
  el mismo `review-order.ts`/`reviewOrder` con la rama reject. Cada US es demostrable de forma independiente.

---

## Phase 1: Setup

- [ ] T001 Verificar rama `006-revision-supervisor`, BD de test arriba (`docker compose up -d db-test`, puerto 5433) y `npm run test` de 001/002/003/004/005 en verde (baseline de no-regresión). **Sin migración nueva en 006.**
- [ ] T002 Confirmar que `contracts/orders.openapi.yaml` (v1.3.0) incluye `reviewOrder` (200/401/403/404/409/422/500/503) + schema `ReviewRequest`, que Spectral pasa (0 errores) y que `tsc`/`npm run build` compilan.

---

## Phase 2: Foundational (Blocking) ⚠️ bloquea US1 y US2

- [ ] T003 [P] Catálogo de errores: en `backend/src/domain/result.ts` (`ErrorCode`) +`INVALID_REASON`, +`EVIDENCE_MISSING`; en `backend/src/handlers/error-mapper.ts` (`STATUS`) +`INVALID_REASON`→**422**, +`EVIDENCE_MISSING`→**409**. **NO tocar** `EVIDENCE_REQUIRED`→422 (es de 005, semántica de payload). Confirmar mapeos existentes reutilizados: `VALIDATION_ERROR`→422 (incl. body no-JSON vía `jsonErrorHandler`), `GUARD_UNMET`→404 (no-enumeración), `FORBIDDEN_ROLE`→403, `ACTOR_INVALID`/`INTERNAL`→500, `SERVICE_UNAVAILABLE`→503. `VERSION_CONFLICT`→409 global **intacto** (006 no keyea `version` → no surge).
- [ ] T004 (Guarda de regresión) Re-ejecutar los tests de error de 001/002/003/004/005; confirmar que las adiciones de T003 son retrocompatibles (cuerpos intactos; `EVIDENCE_REQUIRED` de 005 sigue en 422).
- [ ] T005 [P] Confirmar/extender `REDACT_PATHS` en `backend/src/infra/logger.ts` para `req.body.reason` (y `error.cause`) — FR-008 (el motivo nunca en logs; grep negativo en Polish).
- [ ] T006 [P] `sanitizeReason` (dominio puro) — **test primero** `backend/tests/unit/sanitize-reason.spec.ts` (Red): (1) trim; (2) colapso de whitespace interno repetido a uno; (3) strip de control chars Cc (`U+0000`–`U+001F`, `U+007F`) salvo `\n`; (4) NFC. Casos: espacios de borde, tabs/control internos, sólo-whitespace → "vacío tras saneo" (longitud 0), NFC (é compuesto vs descompuesto), conteo por **code points**. Luego `backend/src/domain/order/write-side/sanitize-reason.ts` (función pura). **Commit del test primero.**
- [ ] T007 [P] Clasificador propio de 006 — **test primero** `backend/tests/unit/classify-review-guard.spec.ts` (Red): recibe el snapshot `{status, evidenceCount}` re-leído **tras** un UPDATE de 0 filas y clasifica con **404 ANTES que 409**: inexistente o `status ≠ pending_review` → **`GUARD_UNMET` (404)** (visibilidad state-scoped; nunca 403/422, **ni siquiera** si `evidenceCount = 0` — la no-visibilidad manda); y, **sólo en approve**, `status = pending_review` **con** `evidenceCount = 0` → **`EVIDENCE_MISSING` (409)**. Casos clave: `{inexistente}`→404, `{status:assigned, evidenceCount:0}`→**404 (nunca 409)**, `{status:pending_review, evidenceCount:0, decision:approve}`→409, `{status:pending_review, evidenceCount:0, decision:reject}`→404 (reject no tiene guard, pero un 0-filas en reject sólo ocurre por no-visibilidad); **(G2/H-003)** **rama por-defecto fail-safe**: cualquier snapshot que NO encaje (p.ej. `{status:pending_review, evidenceCount:1, decision:approve}` — no debería llegar aquí, pero puede por carrera entre el UPDATE-0-filas y la re-lectura) → **`404 GUARD_UNMET`** (nunca 500, nunca filtra estado). Luego `backend/src/domain/order/write-side/classify-review-guard.ts`: función pura `classifyReviewGuard({status, evidenceCount}, {decision})→DomainError` con `default`→GUARD_UNMET. **No** hace SELECT propio (recibe snapshot dentro de la tx → sin TOCTOU). **No** reutiliza ni altera `classifyZeroRows`/`applyTransition` de 002b. **Commit del test primero.**
- [ ] T008 [P] Zod `reviewRequestSchema` en `backend/src/handlers/contract/schemas.ts` (`.strict()`, derivado del contrato): `decision` enum `[approve, reject]` (ausente/otro → `VALIDATION_ERROR`); `reason` **opcional** string con **cota cruda ≤ 4000** code points (red de seguridad de payload → `VALIDATION_ERROR` sólo si >4000; **NO** capar a 1000 aquí). DTO `snake_case` en `order-types.ts`. **(G2/K2)** La obligatoriedad de `reason` por `decision`, el saneo y la **longitud efectiva 1..1000 (medida TRAS `sanitizeReason`)** son de **dominio** (T010/T015) → `INVALID_REASON`, **no** del schema (que mide crudo). Un motivo con mucho whitespace puede superar 1000 en crudo y ser válido tras saneo.

**Checkpoint**: errores/logger listos, `sanitizeReason` y `classifyReviewGuard` verdes, schema Zod. US1 y US2 pueden empezar (ambas reutilizan T006/T007/T008).

---

## Phase 3: User Story 1 — Aprobar (P1) 🎯 MVP

**Goal**: un supervisor aprueba una orden `pending_review` → `closed` (200, version+1, 1 auditoría), con guard
defensivo de evidencia (409 si 0).

**Independent test**: `POST /v1/orders/{id}/review {decision:approve}` sobre `pending_review` con evidencia →
200 `closed`; sin evidencia → 409 `EVIDENCE_MISSING`; otro rol → 403; no visible → 404; sin token → 401.

- [ ] T009 [P] [US1] Contract test `backend/tests/contract/review-order.contract.spec.ts` (Red): `reviewOrder` × cada código (200/401/403/404/409/422/500/503) contra el schema del contrato (approve como caso 200; incluye 422 `VALIDATION_ERROR` de `decision` ausente/inválida). **Commit en rojo primero.**
- [ ] T010 [P] [US1] Domain use case — **test primero** `backend/tests/unit/review-order.spec.ts` (Red): valida `decision`; rama **approve** → estado destino `closed`, `reason` **opcional** (si presente: `sanitizeReason` y luego 1..1000 code points → si no, `INVALID_REASON`; vacío tras saneo → `INVALID_REASON`); delega en `ReviewOrderPort` (mockeado, no toca BD). **(G2/K5)** El `switch(decision)` es **exhaustivo** con `default: assertNever(decision)` (TS `never`) → un `decision` no contemplado nunca cae en comportamiento indefinido. Luego `backend/src/domain/order/write-side/review-order.ts` (puro).
- [ ] T011 [US1] `ReviewOrderPort` en `backend/src/domain/order/write-side/write-side-ports.ts` + implementación `reviewOrder` (rama **approve**) en `backend/src/infra/repositories/order-write-side-repository.ts`: **1 `$transaction`** — **(G2/K1)** (1) `updateMany({ where:{ id, status:'pending_review', evidence:{ some:{} } }, data:{ status:'closed', version:{increment:1} }})` — la existencia de ≥1 evidencia va **dentro** del WHERE como filtro de relación (**NO** un `count`/`SELECT` previo, que antepondría 409 a 404). **(G2/H-002)** debe compilar a **una** sentencia atómica `UPDATE … WHERE … AND EXISTS(SELECT 1 FROM order_evidence …)` — si la versión de Prisma no lo compila atómico, **fallback** `$executeRaw` con ese UPDATE. WHERE **sin** `version`. (2) **0 filas**: re-lee el snapshot `{status, evidenceCount}` y `classifyReviewGuard` (T007) → **404** si `status≠pending_review`/inexistente, **409** `EVIDENCE_MISSING` si `pending_review`+`evidenceCount=0` (404 antes que 409). (3) **1 fila**: insert `OrderAudit` (`transition`, `from=pending_review`, `to=closed`, `actorId`=**token**, `reason`=`sanitizeReason(reason)`|`NULL`). **NO** usa `applyTransition`. Wire `infra/container.ts`.
- [ ] T012 [US1] Integration test `backend/tests/integration/review-order-approve.spec.ts` (Red): approve sobre `pending_review` con evidencia → 200 `closed`, version+1, **1** auditoría `{from:pending_review,to:closed,actor:S,reason:NULL}`; approve sobre `pending_review` **real sin evidencia** → **409 `EVIDENCE_MISSING`** sin efecto; **(G2/K1, no-enumeración — caso clave)** approve sobre orden **NO visible SIN evidencia** (inexistente, `orderId` no-uuid, o `assigned`/`in_progress`/`closed` sin evidencia) → **404 genérico byte-idéntico, NUNCA 409** (la no-visibilidad precede al guard de evidencia); sin token → 401; technician/dispatcher → 403; **(FR-012)** enviar `actor_id` en el cuerpo → rechazado (`.strict()`), actor persistido = **token**; **(G2/H-005)** simetría del camino approve con la precedencia payload-primero: `POST /orders/{orderId-no-uuid}/review {decision:approve, reason:"<inválido>"}` → **422 `INVALID_REASON`** (NO 404: aunque `reason` sea opcional en approve, si está **presente** se valida antes que el formato de `orderId`); `{decision:approve}` sin `reason` + `orderId` no-uuid → **404** (sin reason que validar). **(G2/H-002)** con el query log de Prisma activado, verificar que el approve emite **UNA sola** sentencia `UPDATE … EXISTS(…)` (ver T018 para el criterio robusto). **Commit en rojo primero.**
- [ ] T013 [US1] Handler delgado `backend/src/handlers/orders/review.ts` — **(G2/H-001) orden = payload antes que recurso** (FR-009, como 005 T022): `authenticate`→`requireRole('supervisor')`→parse `reviewRequestSchema` (→ 422 `VALIDATION_ERROR`)→**validación de dominio PURA de `decision`/`reason`** (`sanitizeReason` + 1..1000 → 422 `INVALID_REASON`) **ANTES** del **chequeo de formato UUID de `orderId`** (regex, →404 si malformado, evita P2023→500)→`review-order`/repo (404 visibilidad / 409 evidencia)→map `Result`. Así `orderId` malformado **+** `reason` inválido → **422 `INVALID_REASON`** (no 404). **Nunca** serializa `reason` en errores. **(G2/K5)** El handler no ramifica por `decision` (eso es del dominio con switch exhaustivo, T010); mapea el `Result` de forma uniforme. Montar ruta `POST /v1/orders/:orderId/review` en `backend/src/handlers/app.ts` con `authenticate`+`requireRole('supervisor')`.
- [ ] T014 [US1] Arch test — extender `backend/tests/unit/write-side-boundary.spec.ts`: `reviewOrder` no muta `status`/`version` fuera de `domain/order/write-side/*` + `order-write-side-repository.ts`; confirmar (grep de imports / dependency-cruiser) que 006 **no** invoca `applyTransition`/`classifyZeroRows` de 002b.

**Checkpoint US1**: T009/T012/T014 en verde; "apruebo una orden revisada" demostrable con guard de evidencia.

---

## Phase 4: User Story 2 — Rechazar con motivo (P1) 🎯 MVP

**Goal**: un supervisor rechaza una orden `pending_review` → `in_progress` con **motivo obligatorio válido**
(200, version+1, auditoría con `reason` saneado). Evidencia/notas de 005 conservadas.

**Independent test**: `POST /v1/orders/{id}/review {decision:reject, reason}` sobre `pending_review` → 200
`in_progress`; sin motivo / vacío-tras-saneo / >1000 → 422 `INVALID_REASON` sin efecto.

- [ ] T015 [US2] Extender el domain use case — **test primero** (añadir a `backend/tests/unit/review-order.spec.ts`, Red): rama **reject** → estado destino `in_progress`; `reason` **obligatorio**: ausente/`null`/vacío-tras-`sanitizeReason`/**>1000 code points tras saneo** → `INVALID_REASON`. **(G2/K2)** un `reason` con mucho whitespace (>1000 crudo pero ≤1000 tras saneo) es **válido**; el límite se aplica **tras** `sanitizeReason`, no en crudo. Luego extender `review-order.ts` (rama reject) manteniendo el switch exhaustivo (T010).
- [ ] T016 [US2] Extender `reviewOrder` (rama **reject**) en `backend/src/infra/repositories/order-write-side-repository.ts`: misma `$transaction` — `updateMany({ where:{ id, status:'pending_review' }, data:{ status:'in_progress', version:{increment:1} }})` → 0 filas: `classifyReviewGuard` → 404; 1 fila: insert `OrderAudit` (`from=pending_review`, `to=in_progress`, `reason`=`sanitizeReason(reason)`). **Sin** guard de evidencia (sólo approve).
- [ ] T017 [US2] Integration test `backend/tests/integration/review-order-reject.spec.ts` (Red): reject con motivo válido → 200 `in_progress`, version+1, 1 auditoría `{from:pending_review,to:in_progress,reason:<saneado>}`; reject **sin** `reason` / `reason` sólo-whitespace (vacío tras saneo) / **>1000 tras saneo** → **422 `INVALID_REASON`** sin cambio de estado; **(G2/K2)** `reason` con whitespace interno abundante (**>1000 crudo pero ≤1000 tras saneo**) → **200** (válido, NO `VALIDATION_ERROR`); `reason` **>4000 crudo** → **422 `VALIDATION_ERROR`** (cota de payload del schema); **(FR-011)** body sin `decision` / `decision:"aprove"` / body no-JSON → **422 `VALIDATION_ERROR`** evaluado **antes** que `INVALID_REASON`; approve con `reason` inválido presente → 422 `INVALID_REASON`; **(G2/H-001) caso cruzado**: `orderId` no-uuid **+** `reason` inválido → **422 `INVALID_REASON`** (payload antes que recurso, NO 404); `orderId` no-uuid **+** payload válido → **404**; precedencia completa `401→403→422(VALIDATION_ERROR)→422(INVALID_REASON)→404→409`. **Commit en rojo primero.**
- [ ] T018 [US2] Test de atomicidad `backend/tests/integration/review-order-atomicity.spec.ts` (Red→verde): forzar fallo en la inserción de **auditoría** (approve y reject por separado) → la orden **no** transiciona (`status`/`version` intactos; 0 auditorías nuevas de ese intento). **(G2/H-007) Garantía dura de no-TOCTOU del guard de evidencia** (no depende del formato del query log): el criterio robusto es de **diseño** — el guard es el filtro `evidence:{some:{}}` **en el WHERE del UPDATE** (T011), y si Prisma no lo compilara a una sola sentencia se usa `$executeRaw` (T011 fallback); el test asevera el **comportamiento** (una orden que pierde su última evidencia entre check y commit no se aprueba con 0 evidencias) mediante fault/timing injection, **no** contando líneas del log. La cuenta de sentencias del query log (T012) es **best-effort** (puede variar por versión/PREPARE+EXECUTE) y no es la fuente de verdad.
- [ ] T019 [US2] Test de conservación `backend/tests/integration/review-order-preservation.spec.ts` (Red→verde, FR-005): tras approve y tras reject, las filas de `order_evidence` y `order_execution_notes` de la orden siguen **presentes e inalteradas** (0 pérdidas; 006 no las toca).

- [ ] T020 [US2] **(G2/K3)** Integration test del **ciclo cruzado 006↔005** `backend/tests/integration/review-reject-resubmit-cycle.spec.ts` (Red→verde, cubre US2 Acceptance Scenario 3, P1): orden en `pending_review` → `reviewOrder {reject, reason}` → `in_progress` (version+1, auditoría rechazo) → `submitOrderExecution` (005) reenvía evidencia+notas → `pending_review` (version+1) → `reviewOrder {approve}` → `closed` (version+1). Verificar: coherencia de `status`/`version` en cada paso; que el guard FR-013 (approve) **cuenta la evidencia del reenvío** (no falla con 409 si 005 persistió ≥1); auditoría acumulada correcta (2 transiciones de 006 + la de 005). **(G2/H-004/H-006) Precondición del guard (camino feliz, sin sobre-afirmar)**: comprobar que **inmediatamente tras** `submitOrderExecution` la orden está en `pending_review` con `evidenceCount ≥ 1` — la **postcondición funcional** de la que depende el guard FR-013 de 006. **No** re-verifica la atomicidad de 005 bajo fallo parcial (eso lo cubre el test de atomicidad propio de **005**); es una **alarma de regresión** si esa postcondición se degradara (p. ej. #007 hiciera la evidencia asíncrona). **Commit en rojo primero.**

**Checkpoint US2**: T009..T020 en verde; "rechazo con motivo y devuelvo al técnico" + ciclo de re-revisión demostrable end-to-end.

---

## Phase 5: Polish & Cross-Cutting

- [ ] T021 [P] No-fuga PII `backend/tests/integration/review-pii-redaction.spec.ts` (SC-005, FR-008): rechazar con `reason` centinela; grep negativo del valor en logs y en el cuerpo de error; en logs sólo `id`/estado.
- [ ] T022 [P] Saneo de errores de BD `backend/tests/integration/review-db-errors.spec.ts` (FR-010): error de BD **no transitorio** (constraint/`ACTOR_INVALID`) → 500 genérico sin SQLSTATE/constraint/columna/query; **BD no disponible** (conexión caída) → 503 (patrón `SERVICE_UNAVAILABLE` de 002a).
- [ ] T023 [P] Latencia (SC-006): p95 < 300 ms **por separado** para `approve` (sin motivo) y `reject` (motivo 1000 chars) — 50 req secuenciales, BD caliente, nearest-rank; correlation-ID en respuesta y logs.
- [ ] T024 [P] Trazabilidad: actualizar `docs/traceability.md` (FR-001/013→`reviewOrder` approve; FR-002/003→reject; FR-004/005/006/007/008/009/010/011/012→`reviewOrder`; SC-001..006→tests).
- [ ] T025 Verificar que **BL-070** (#010 read-side + enmienda Constitution XI) **y BL-071** (reconciliar 003 FR-006, invariante write-side = carpeta) están **ambas presentes** en `docs/06-roadmap.md` y referenciadas en `Assumptions`/plan (añadidas en G1/G2; grep de confirmación de que no falta ninguna).
- [ ] T026 Cobertura y regresión final: dominio ≥80%, handlers/servicios ≥80%; `npm run test` completo verde (001/002/003/004/005/006). Preparar para el gate G3.

---

## Dependencias y orden

```
Setup (T001-T002)
  └─ Foundational (T003-T008)  ⚠️ bloquea US1 y US2 (errores, logger, sanitizeReason, classifyReviewGuard, Zod)
        ├─ US1 approve (T009-T014)   ← construye el pipeline reviewOrder (approve); demostrable solo
        └─ US2 reject  (T015-T020)   ← extiende review-order.ts/reviewOrder con reject + ciclo cruzado (T020)
              └─ Polish (T021-T026)
```

- **Foundational** bloquea ambas US (catálogo de errores 409/422, saneo, clasificador, schema).
- **US1** introduce el endpoint/handler/repo `reviewOrder` (approve). **US2** **extiende** los mismos módulos con
  la rama reject → US2 depende de que exista el pipeline de US1 (no son 100% paralelas: comparten un endpoint).
- **US3** (RBAC/no-enumeración, P2) es transversal: sus criterios se verifican en T012 (403/404/401) y en Polish.
- **Polish** tras ambas US.

## Paralelismo

- Foundational: T003 ∥ T005 ∥ T006 ∥ T007 ∥ T008 (ficheros distintos); T004 tras T003.
- US1: T009 ∥ T010 (contract ∥ dominio); luego T011→T012→T013→T014.
- US2: T015→T016→T017; T018 ∥ T019 tras T016; T020 (ciclo cruzado) tras T016 (+ requiere 005 desplegado).
- Polish: T021 ∥ T022 ∥ T023 ∥ T024 (ficheros distintos); T025→T026 al final.

## MVP

**(G2/K5)** US1 y US2 son **un mismo endpoint** (`reviewOrder`) y **ambos P1** → se **despliegan juntos**. El
checkpoint de US1 ("apruebo una orden") es un **hito de desarrollo/demostración**, **no** una frontera de
despliegue parcial: no se despliega US1-solo (con `decision:reject` sin implementar). El switch exhaustivo de
`decision` (T010, `never`) garantiza que ningún `decision` sin rama cause fallo no controlado durante el
desarrollo. El MVP **funcional completo** = US1 + US2 (aprobar y rechazar) = Brief Func #3 al completo. Polish
(T021-T026) endurece (no-fuga, saneo de BD, latencia, trazabilidad, cobertura) antes del gate G3.
