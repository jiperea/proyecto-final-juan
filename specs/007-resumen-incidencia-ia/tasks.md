# Tasks: Resumen de incidencia por IA (007)

**Branch**: `007-resumen-incidencia-ia` | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

**Input**: plan de la feature IA. 1 endpoint `summarizeOrderIncident`. Dominio IA **puro** tras puerto de
proveedor (`claude -p`/mock). Minimización de PII por capas, fallback no-inventa, rate-limit, evento de acceso,
eval promptfoo. **Sin migración**. 001/002a/004/005/006 inamovibles.

## Format: `[ID] [P?] [Story] Description`

- **[US1]** Resumen fiel (P1) · **[US2]** Fallback no-inventa (P1) · **[US3]** RBAC/PII/rate-limit (P2).
- **TDD fase Red**: los tests "(Red)" se commitean en rojo antes de implementar (Constitution VII).
- Un endpoint sirve las 3 US: US1 construye el pipeline (resumen fiel), US2 extiende el dominio (fallback), US3
  añade los controles transversales (RBAC/PII/rate-limit/robustez). Cada US es demostrable con el proveedor **mock**.
- **Eval promptfoo** (fidelidad/alucinación/no-fuga/fallback) = Polish + gate G3 (provider `claude -p`), fuera del
  `vitest run`.

---

## Phase 1: Setup

- [ ] T001 Verificar rama `007-resumen-incidencia-ia`, BD de test arriba, `npm run test` de 001–006 en verde (baseline). **Sin migración en 007.**
- [ ] T002 [P] Confirmar contrato `contracts/orders.openapi.yaml` (v1.4.0) con `summarizeOrderIncident` (200/401/403/404/429/503) + `IncidentSummaryResponse` (Spectral OK). Añadir `promptfoo` como **devDependency** en `backend/package.json` + script `"eval": "promptfoo eval -c ../evals/promptfooconfig.yaml"`.
- [ ] T003 [P] Extender `backend/src/infra/config.ts` (Zod, fail-fast): `AI_PROVIDER` (default `claude-cli`), `AI_TIMEOUT_MS` (default 10000), `AI_RATE_MAX` (10), `AI_RATE_WINDOW_MS` (60000). Actualizar `.env.example`.

---

## Phase 2: Foundational (Blocking) ⚠️ bloquea US1/US2/US3

- [ ] T004 [P] Catálogo de errores: confirmar en `error-mapper.ts` los mapeos reutilizados `FORBIDDEN_ROLE`→403, `RATE_LIMITED`→429, `SERVICE_UNAVAILABLE`→503, `ORDER_NOT_FOUND`/`GUARD_UNMET`→404. No se añaden códigos nuevos (007 reutiliza).
- [ ] T005 [P] `pii-redactor.ts` (dominio puro) — **test primero** `backend/tests/unit/pii-redactor.spec.ts` (Red): `redactStructured(text)` sustituye por `[REDACTED]` emails, teléfonos (E.164/ES), matrículas (ES), DNI/NIF; `hasStructuredPii(text)` → boolean. Casos: cada patrón, texto sin PII (idempotente), no toca palabras normales. Nombres/direcciones **no** se detectan (best-effort, BL-073) — documentado en el test. Luego `backend/src/domain/ai/pii-redactor.ts`.
- [ ] T006 [P] Puertos en `backend/src/domain/ai/summary-ports.ts`: `AiSummaryProviderPort.generate(input)→Promise<Result<{summary,sufficient}>>` (errores: timeout/proceso→SERVICE_UNAVAILABLE); `IncidentSourcePort.findSummarizable(orderId)→Promise<{notes, evidence:{count,contentTypes}}|null>` (null = no visible/pending_review); `AccessLogPort.record({actor,orderId,outcome})`.
- [ ] T007 [P] `IncidentSourceRepository` en `backend/src/infra/repositories/incident-source-repository.ts`: lee la orden **sólo si** `status='pending_review'` (visibilidad de 006) + sus `order_execution_notes` + conteo/`content_type` de `order_evidence`; NUNCA `object_ref`. Devuelve `null` si no visible.
- [ ] T008 [P] Zod/DTO `IncidentSummaryResponse` en `backend/src/handlers/contract/{schemas,order-types}.ts`: `{ summary: string|null, sufficient: boolean }`. (Sin request body: el endpoint no recibe payload; actor + orderId del path/token.)
- [ ] T009 [P] Instancia de rate-limit del endpoint IA (reutiliza `InMemoryRateLimit` de 001) en `infra/container.ts` con `AI_RATE_MAX`/`AI_RATE_WINDOW_MS`; y categoría de log de acceso (`access.ai_summary`) en `infra/logger.ts` (sin PII; confirmar REDACT de notas/`object_ref`).

**Checkpoint**: redactor de PII, puertos, lectura de fuente, DTO, rate-limit y log listos.

---

## Phase 3: User Story 1 — Resumen fiel (P1) 🎯 MVP

**Goal**: el supervisor obtiene un resumen fiel de una orden `pending_review` (provider mock → 200 {summary, sufficient:true}).

**Independent test**: `POST /v1/orders/{id}/ai-summary` sobre `pending_review` con notas+evidencia, provider mock devuelve resumen → 200 con `sufficient:true`.

- [ ] T010 [P] [US1] Contract test `backend/tests/contract/ai-summary.contract.spec.ts` (Red): `summarizeOrderIncident` × cada código (200/401/403/404/429/503) contra el schema (`IncidentSummaryResponse` en 200; `ErrorResponse` resto). **Commit en rojo primero.**
- [ ] T011 [P] [US1] Domain use case — **test primero** `backend/tests/unit/summarize-incident.spec.ts` (Red, provider mock): minimiza (allowlist + `redactStructured`) → construye prompt con instrucción anti-PII → llama al puerto → valida salida (no vacía, `≤1200`, `!hasStructuredPii` → si no, fallback) → devuelve `{summary, sufficient}`. Luego `backend/src/domain/ai/summarize-incident.ts` (puro; NO importa child_process/Prisma).
- [ ] T012 [US1] `ClaudeCliProvider` en `backend/src/infra/ai/claude-cli-provider.ts`: implementa `AiSummaryProviderPort` invocando `claude -p` (`node:child_process`, **timeout 10 s**, captura stdout, **suprime stderr** → no PII); parsea `{summary, sufficient}`; timeout/fallo → `SERVICE_UNAVAILABLE`. Wire `infra/container.ts`.
- [ ] T013 [US1] Handler delgado `backend/src/handlers/orders/ai-summary.ts`: `authenticate`→(requireRole supervisor en app.ts)→**rate-limit**→valida uuid (`404` si malformado)→`IncidentSourcePort.findSummarizable` (`null`→404)→`summarize-incident` (dominio) con provider inyectado→map `Result`→emite **evento de acceso** (FR-013). Montar ruta `POST /v1/orders/:orderId/ai-summary` en `app.ts` con `authenticate`+`requireRole('supervisor')`.
- [ ] T014 [US1] Integration test `backend/tests/integration/ai-summary-ok.spec.ts` (Red, provider **mock** inyectado): orden `pending_review` con notas+evidencia → 200 `{summary, sufficient:true}`; el prompt pasado al mock lleva metadatos de evidencia (no `object_ref`). **Commit en rojo primero.**
- [ ] T015 [US1] Arch test `backend/tests/unit/ai-domain-boundary.spec.ts`: `domain/ai/*` no importa `child_process`/`@prisma/client`/`express` (el proveedor se inyecta por puerto).

**Checkpoint US1**: T010/T014/T015 verdes; "resumen fiel" demostrable con provider mock.

---

## Phase 4: User Story 2 — Fallback no-inventa (P1) 🎯 MVP

**Goal**: cuando el proveedor no puede resumir con fidelidad (o contenido degenerado), el sistema no inventa.

**Independent test**: provider mock `sufficient:false` → 200 `{summary:null, sufficient:false}`; orden sin notas útiles Y 0 evidencia → fallback sin llamar al proveedor.

- [ ] T016 [US2] Extender el domain use case — **test primero** (añadir a `summarize-incident.spec.ts`, Red): (1) provider devuelve `sufficient:false` → fallback `{summary:null, sufficient:false}`; (2) **corto-circuito**: notas vacías tras saneo Y 0 evidencia → fallback **sin** invocar el puerto (spy no llamado); (3) salida `>1200` → fallback; (4) salida vacía tras trim → fallback; (5) salida con PII estructurada → fallback (`blocked_pii`). Luego extender `summarize-incident.ts`.
- [ ] T017 [US2] Integration test `backend/tests/integration/ai-summary-fallback.spec.ts` (Red): provider mock `sufficient:false` → 200 fallback; orden degenerada → 200 fallback sin llamada al provider (mock spy 0 llamadas); salida con PII estructurada del mock → 200 fallback (NO se devuelve el texto con PII). **Commit en rojo primero.**

**Checkpoint US2**: fallback alcanzable y verificado con mock.

---

## Phase 5: User Story 3 — RBAC / PII / rate-limit / robustez (P2)

**Goal**: solo supervisor, no-enumeración, minimización de PII de entrada, rate-limit, timeout→503, sin logs de PII, evento de acceso.

**Independent test**: T/D→403; orden ≠ pending_review→404; 11ª petición→429; provider timeout→503; PII centinela no en prompt/logs; evento de acceso sin PII.

- [ ] T018 [US3] Integration test `backend/tests/integration/ai-summary-authz.spec.ts` (Red): sin token→401; technician/dispatcher→403; orden inexistente/uuid malformado/estado ≠ pending_review→404 genérico; **en ninguno se llama al provider** (mock spy 0). Precedencia FR-012.
- [ ] T019 [US3] Integration test `backend/tests/integration/ai-summary-ratelimit.spec.ts` (Red): 10 peticiones OK, 11ª en <60 s → 429 `RATE_LIMITED` + `Retry-After`, **sin** llamar al provider.
- [ ] T020 [US3] Integration test `backend/tests/integration/ai-summary-pii.spec.ts` (Red, SC-003/FR-003/FR-005): notas con email/teléfono/DNI/matrícula centinela → el input pasado al provider mock lleva `[REDACTED]` (no el valor); `object_ref` nunca en el input; grep negativo del valor/`object_ref`/resumen en logs y `stderr`.
- [ ] T021 [US3] Integration test `backend/tests/integration/ai-summary-provider-failure.spec.ts` (Red, FR-010/SC-006): provider mock que **excede 10 s** o **lanza** → 503 `SERVICE_UNAVAILABLE` (no cuelga, cuerpo genérico sin detalle).
- [ ] T022 [US3] Integration test `backend/tests/integration/ai-summary-access-event.spec.ts` (Red, FR-013/SC-007): cada petición (success/fallback/denied/error) emite un evento `access.ai_summary {actor, orderId, timestamp, outcome}` **sin PII**; `blocked_pii` distinguible de `fallback_insufficient`; capturar el log y afirmar 0 PII.

**Checkpoint US3**: controles transversales verdes con provider mock.

---

## Phase 6: Eval (promptfoo) & Polish

- [ ] T023 [P] Arnés de eval: `evals/promptfooconfig.yaml` (provider `claude -p`; thresholds faithfulness ≥ 0.90, tasa_alucinacion ≤ 0.05) + `evals/ia-resumen/golden-cases.yaml` (casos ricos → fidelidad; casos pobres → `sufficient:false`; casos con nombre/dirección/email literal → aserción de **no-fuga**) + `evals/sc/007-resumen-incidencia-ia.yaml`.
- [ ] T024 [P] No-fuga (unit) `backend/tests/unit/pii-redactor-negative.spec.ts`: grep negativo — el redactor no deja pasar los patrones estructurados centinela; documenta el residual de nombres (BL-073).
- [ ] T025 [P] Trazabilidad: actualizar `docs/traceability.md` (FR-001..014 → `summarizeOrderIncident`; SC-001..007 → tests/eval). Registrar **BL-072** (proveedor prod TLS/DPA) y **BL-073** (endurecimiento PII texto libre) en `docs/06-roadmap.md`.
- [ ] T026 Cobertura y regresión final: dominio ≥80% (redactor + caso de uso con mock), handlers ≥80%; `npm run test` completo verde (001–007, provider mock). Preparar para el gate G3 (que además ejecuta `npm run eval`).

---

## Dependencias y orden

```
Setup (T001-T003)
  └─ Foundational (T004-T009)  ⚠️ bloquea US1/US2/US3 (redactor, puertos, fuente, DTO, rate-limit, log)
        ├─ US1 resumen fiel (T010-T015)   ← construye el pipeline (provider mock); demostrable solo
        ├─ US2 fallback (T016-T017)       ← extiende el dominio; depende del pipeline de US1
        └─ US3 transversal (T018-T022)    ← RBAC/PII/rate-limit/robustez sobre el endpoint de US1
              └─ Eval & Polish (T023-T026)
```

- **Foundational** bloquea las 3 US. **US1** introduce endpoint/handler/dominio/provider; **US2/US3** extienden.
- **Eval (T023)** se ejecuta en G3 (`npm run eval`, provider `claude -p`); los tests de código usan **mock**.

## Paralelismo

- Setup: T002 ∥ T003. Foundational: T005 ∥ T006 ∥ T007 ∥ T008 ∥ T009 (ficheros distintos); T004 confirmación.
- US1: T010 ∥ T011; luego T012→T013→T014→T015. US2: T016→T017. US3: T018 ∥ T019 ∥ T020 ∥ T021 ∥ T022.
- Polish: T023 ∥ T024 ∥ T025; T026 al final.

## MVP

**MVP mínimo demostrable** = Setup + Foundational + **US1** ("resumen fiel", provider mock). El MVP **funcional
completo** = US1 + US2 + US3 (Brief Func #5 con no-inventa + PII + rate-limit). El **eval promptfoo** (T023, G3)
ancla la fidelidad/no-fuga/fallback con `claude -p`. US1/US2/US3 comparten el endpoint → se despliegan juntas.
