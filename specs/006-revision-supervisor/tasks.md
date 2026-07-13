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
- [ ] T007 [P] Clasificador propio de 006 — **test primero** `backend/tests/unit/classify-review-guard.spec.ts` (Red): recibe el snapshot re-leído **tras** un UPDATE de 0 filas y clasifica: inexistente o `status ≠ pending_review` → **`GUARD_UNMET` (404)** (visibilidad state-scoped; nunca 403/422); y, **sólo en approve**, orden visible en `pending_review` con `evidenceCount = 0` → **`EVIDENCE_MISSING` (409)**. Luego `backend/src/domain/order/write-side/classify-review-guard.ts`: función pura `classifyReviewGuard(current, {decision})→DomainError`. **No** hace SELECT propio (recibe snapshot dentro de la tx → sin TOCTOU). **No** reutiliza ni altera `classifyZeroRows`/`applyTransition` de 002b. **Commit del test primero.**
- [ ] T008 [P] Zod `reviewRequestSchema` en `backend/src/handlers/contract/schemas.ts` (`.strict()`, derivado del contrato): `decision` enum `[approve, reject]` (ausente/otro → `VALIDATION_ERROR`); `reason` **opcional** string `1..1000` code points (contar code points, no UTF-16). DTO `snake_case` en `order-types.ts`. La obligatoriedad de `reason` por `decision` y el saneo son de dominio (T010), no del schema.

**Checkpoint**: errores/logger listos, `sanitizeReason` y `classifyReviewGuard` verdes, schema Zod. US1 y US2 pueden empezar (ambas reutilizan T006/T007/T008).

---

## Phase 3: User Story 1 — Aprobar (P1) 🎯 MVP

**Goal**: un supervisor aprueba una orden `pending_review` → `closed` (200, version+1, 1 auditoría), con guard
defensivo de evidencia (409 si 0).

**Independent test**: `POST /v1/orders/{id}/review {decision:approve}` sobre `pending_review` con evidencia →
200 `closed`; sin evidencia → 409 `EVIDENCE_MISSING`; otro rol → 403; no visible → 404; sin token → 401.

- [ ] T009 [P] [US1] Contract test `backend/tests/contract/review-order.contract.spec.ts` (Red): `reviewOrder` × cada código (200/401/403/404/409/422/500/503) contra el schema del contrato (approve como caso 200; incluye 422 `VALIDATION_ERROR` de `decision` ausente/inválida). **Commit en rojo primero.**
- [ ] T010 [P] [US1] Domain use case — **test primero** `backend/tests/unit/review-order.spec.ts` (Red): valida `decision`; rama **approve** → estado destino `closed`, `reason` opcional (si presente, `sanitizeReason` + 1..1000 → `INVALID_REASON`); delega en `ReviewOrderPort` (mockeado, no toca BD). Luego `backend/src/domain/order/write-side/review-order.ts` (puro).
- [ ] T011 [US1] `ReviewOrderPort` en `backend/src/domain/order/write-side/write-side-ports.ts` + implementación `reviewOrder` (rama **approve**) en `backend/src/infra/repositories/order-write-side-repository.ts`: **1 `$transaction`** — (1) guard `count(order_evidence where orderId) ≥ 1`, si 0 → `EVIDENCE_MISSING`; (2) `updateMany({ where:{ id, status:'pending_review' }, data:{ status:'closed', version:{increment:1} }})` (WHERE **sin** `version`) → 0 filas: re-lee y `classifyReviewGuard` (T007) → 404; (3) 1 fila: insert `OrderAudit` (`transition`, `from=pending_review`, `to=closed`, `actorId`=**token**, `reason`=`sanitizeReason(reason)`|`NULL`). **NO** usa `applyTransition`. Wire `infra/container.ts`.
- [ ] T012 [US1] Integration test `backend/tests/integration/review-order-approve.spec.ts` (Red): approve sobre `pending_review` con evidencia → 200 `closed`, version+1, **1** auditoría `{from:pending_review,to:closed,actor:S,reason:NULL}`; approve sobre `pending_review` **sin** evidencia → **409 `EVIDENCE_MISSING`** sin efecto; sin token → 401; technician/dispatcher → 403; orden inexistente / `orderId` malformado (no-uuid) / estado ≠ `pending_review` (`assigned`/`in_progress`/`closed`) → **404 genérico byte-idéntico**; **(FR-012)** enviar `actor_id` en el cuerpo → rechazado (`.strict()`), actor persistido = **token**. **Commit en rojo primero.**
- [ ] T013 [US1] Handler delgado `backend/src/handlers/orders/review.ts`: `authenticate`→`requireRole('supervisor')`→parse `reviewRequestSchema` (→ 422 `VALIDATION_ERROR`)→**valida formato UUID de `orderId`** (regex, →404 si malformado, evita P2023→500)→`review-order` (dominio/puerto)→map `Result`. **Nunca** serializa `reason` en errores. Montar ruta `POST /v1/orders/:orderId/review` en `backend/src/handlers/app.ts` con `authenticate`+`requireRole('supervisor')`.
- [ ] T014 [US1] Arch test — extender `backend/tests/unit/write-side-boundary.spec.ts`: `reviewOrder` no muta `status`/`version` fuera de `domain/order/write-side/*` + `order-write-side-repository.ts`; confirmar (grep de imports / dependency-cruiser) que 006 **no** invoca `applyTransition`/`classifyZeroRows` de 002b.

**Checkpoint US1**: T009/T012/T014 en verde; "apruebo una orden revisada" demostrable con guard de evidencia.

---

## Phase 4: User Story 2 — Rechazar con motivo (P1) 🎯 MVP

**Goal**: un supervisor rechaza una orden `pending_review` → `in_progress` con **motivo obligatorio válido**
(200, version+1, auditoría con `reason` saneado). Evidencia/notas de 005 conservadas.

**Independent test**: `POST /v1/orders/{id}/review {decision:reject, reason}` sobre `pending_review` → 200
`in_progress`; sin motivo / vacío-tras-saneo / >1000 → 422 `INVALID_REASON` sin efecto.

- [ ] T015 [US2] Extender el domain use case — **test primero** (añadir a `backend/tests/unit/review-order.spec.ts`, Red): rama **reject** → estado destino `in_progress`; `reason` **obligatorio**: ausente/`null`/vacío-tras-`sanitizeReason`/>1000 code points → `INVALID_REASON`. Luego extender `review-order.ts` (rama reject).
- [ ] T016 [US2] Extender `reviewOrder` (rama **reject**) en `backend/src/infra/repositories/order-write-side-repository.ts`: misma `$transaction` — `updateMany({ where:{ id, status:'pending_review' }, data:{ status:'in_progress', version:{increment:1} }})` → 0 filas: `classifyReviewGuard` → 404; 1 fila: insert `OrderAudit` (`from=pending_review`, `to=in_progress`, `reason`=`sanitizeReason(reason)`). **Sin** guard de evidencia (sólo approve).
- [ ] T017 [US2] Integration test `backend/tests/integration/review-order-reject.spec.ts` (Red): reject con motivo válido → 200 `in_progress`, version+1, 1 auditoría `{from:pending_review,to:in_progress,reason:<saneado>}`; reject **sin** `reason` / `reason` sólo-whitespace (vacío tras saneo) / >1000 → **422 `INVALID_REASON`** sin cambio de estado; **(FR-011)** body sin `decision` / `decision:"aprove"` / body no-JSON → **422 `VALIDATION_ERROR`** evaluado **antes** que `INVALID_REASON`; approve con `reason` inválido presente → 422 `INVALID_REASON`; precedencia completa `401→403→422(VALIDATION_ERROR)→422(INVALID_REASON)→404`. **Commit en rojo primero.**
- [ ] T018 [US2] Test de atomicidad `backend/tests/integration/review-order-atomicity.spec.ts` (Red→verde): forzar fallo en la inserción de **auditoría** (approve y reject por separado) → la orden **no** transiciona (`status`/`version` intactos; 0 auditorías nuevas de ese intento).
- [ ] T019 [US2] Test de conservación `backend/tests/integration/review-order-preservation.spec.ts` (Red→verde, FR-005): tras approve y tras reject, las filas de `order_evidence` y `order_execution_notes` de la orden siguen **presentes e inalteradas** (0 pérdidas; 006 no las toca).

**Checkpoint US2**: T009..T019 en verde; "rechazo con motivo y devuelvo al técnico" demostrable end-to-end.

---

## Phase 5: Polish & Cross-Cutting

- [ ] T020 [P] No-fuga PII `backend/tests/integration/review-pii-redaction.spec.ts` (SC-005, FR-008): rechazar con `reason` centinela; grep negativo del valor en logs y en el cuerpo de error; en logs sólo `id`/estado.
- [ ] T021 [P] Saneo de errores de BD `backend/tests/integration/review-db-errors.spec.ts` (FR-010): error de BD **no transitorio** (constraint/`ACTOR_INVALID`) → 500 genérico sin SQLSTATE/constraint/columna/query; **BD no disponible** (conexión caída) → 503 (patrón `SERVICE_UNAVAILABLE` de 002a).
- [ ] T022 [P] Latencia (SC-006): p95 < 300 ms **por separado** para `approve` (sin motivo) y `reject` (motivo 1000 chars) — 50 req secuenciales, BD caliente, nearest-rank; correlation-ID en respuesta y logs.
- [ ] T023 [P] Trazabilidad: actualizar `docs/traceability.md` (FR-001/013→`reviewOrder` approve; FR-002/003→reject; FR-004/005/006/007/008/009/010/011/012→`reviewOrder`; SC-001..006→tests).
- [ ] T024 Verificar que la deuda **#010 (BL-070)** (read-side + enmienda Constitution XI) está trazada en `docs/06-roadmap.md` y en `Assumptions` de la spec (ya hecho en G1; confirmar que sigue presente y coherente).
- [ ] T025 Cobertura y regresión final: dominio ≥80%, handlers/servicios ≥80%; `npm run test` completo verde (001/002/003/004/005/006). Preparar para el gate G3.

---

## Dependencias y orden

```
Setup (T001-T002)
  └─ Foundational (T003-T008)  ⚠️ bloquea US1 y US2 (errores, logger, sanitizeReason, classifyReviewGuard, Zod)
        ├─ US1 approve (T009-T014)   ← construye el pipeline reviewOrder (approve); demostrable solo
        └─ US2 reject  (T015-T019)   ← extiende review-order.ts/reviewOrder con reject; depende del pipeline de US1
              └─ Polish (T020-T025)
```

- **Foundational** bloquea ambas US (catálogo de errores 409/422, saneo, clasificador, schema).
- **US1** introduce el endpoint/handler/repo `reviewOrder` (approve). **US2** **extiende** los mismos módulos con
  la rama reject → US2 depende de que exista el pipeline de US1 (no son 100% paralelas: comparten un endpoint).
- **US3** (RBAC/no-enumeración, P2) es transversal: sus criterios se verifican en T012 (403/404/401) y en Polish.
- **Polish** tras ambas US.

## Paralelismo

- Foundational: T003 ∥ T005 ∥ T006 ∥ T007 ∥ T008 (ficheros distintos); T004 tras T003.
- US1: T009 ∥ T010 (contract ∥ dominio); luego T011→T012→T013→T014.
- US2: T015→T016→T017; T018 ∥ T019 tras T016.
- Polish: T020 ∥ T021 ∥ T022 ∥ T023 (ficheros distintos); T024→T025 al final.

## MVP

**MVP mínimo demostrable** = Setup + Foundational + **US1** ("apruebo una orden"). El MVP **funcional completo**
de la feature = US1 + US2 (aprobar y rechazar), que es el Brief Func #3 al completo. Polish endurece (no-fuga,
saneo de BD, latencia, trazabilidad, cobertura) antes del gate G3.
