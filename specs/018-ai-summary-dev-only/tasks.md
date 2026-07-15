# Tasks: 018 — Resumen IA dev-only + indisponibilidad honesta

**Ámbito**: backend (`src/`, contrato) + frontend (`IncidentSummaryPanel`, api, i18n) + docs. TDD.

## Phase 1 — Backend: error distinguible

- [X] T001 [Red] Test unit del adaptador (`backend/tests/unit/claude-cli-provider-availability.spec.ts`): con guard `operable:false` → `err(AI_UNAVAILABLE)` sin invocar; con error nativo `ENOENT`/`EACCES` → `AI_UNAVAILABLE`; con timeout/exit≠0 (binario presente) → `SERVICE_UNAVAILABLE`. (FR-002/FR-006)
- [X] T002 Añadir `AI_UNAVAILABLE` a `ErrorCode`/`DomainError` (`backend/src/domain/result.ts`) y `STATUS[AI_UNAVAILABLE]=501` en `backend/src/handlers/error-mapper.ts`, mensaje genérico. → tsc fuerza el mapa 1:1.
- [X] T003 `claude-cli-provider.ts`: añadir `operable` a la config; guard deny-by-default (si `!operable` → `err(AI_UNAVAILABLE)`); clasificar `error.code` en el `catch`. → pasa T001.
- [X] T004 `config.ts` + `container.ts`: derivar `aiOperable = NODE_ENV==='development'` (Zod, fail-fast) e inyectar en el provider.

## Phase 2 — Backend: handler + logging + orden

- [X] T005 [Red] Test integración (`backend/tests/integration/ai-summary-unavailable.spec.ts`): entorno no operable + supervisor + pending_review + material suficiente → **501 `AI_UNAVAILABLE`**, mensaje genérico (sin `claude`/ruta/versión). (SC-001/SC-002)
- [X] T006 [Red] Test de precedencia (mismo fichero): no-supervisor→403, orden no-pending→404, no auth→401, rate-limited→429 — **nunca** `AI_UNAVAILABLE` con proveedor no operable. (SC-003)
- [X] T007 `AccessOutcome += 'unavailable'` (`summary-ports.ts`); en `ai-summary.ts`, cuando el error es `AI_UNAVAILABLE`, registrar `outcome:'unavailable'` (sin PII). → pasa T005/T006.
- [X] T008 [Red] Test de logging (`backend/tests/unit/ai-summary-unavailable-log.spec.ts` o integración): evento con `outcome:'unavailable'` y solo `orderId`/código/timestamp; sin cargar/loguear material. (SC-007)

## Phase 3 — Contrato

- [X] T009 `contracts/orders.openapi.yaml`: respuesta **501** `AI_UNAVAILABLE` en `ai-summary` (separada de 503). `codegen:check` en verde.

## Phase 4 — Frontend

- [X] T010 [Red] Test de componente (`frontend/tests/unit/summary-unavailable.test.tsx`): ante `code:AI_UNAVAILABLE`/501, el panel muestra «El resumen por IA no está disponible en este entorno», **deshabilita** el botón y no ofrece reintento. (SC-004)
- [X] T011 `frontend/src/api/*` + `src/i18n/errors.ts`: mapear el código/501 a un `userMessage` propio.
- [X] T012 `IncidentSummaryPanel.tsx`: estado `unavailable` (botón deshabilitado, mensaje de entorno, sin reintento). → pasa T010.

## Phase 5 — Docs + verificación

- [X] T013 Docs: `docs/design-system.md §8` (mensaje de error), `docs/06-roadmap.md` (BL-072 cerrado dev-only), nota en `.specify/memory/constitution.md`/ADR; `docs/traceability.md` (cambio de puerto + FR→test). (FR-007)
- [X] T014 Verificación: backend `typecheck`+`lint`+`test` (host, db-test) y front `typecheck`+`lint`+`test` en verde; tests existentes de IA (mock) sin regresión (SC-005). Guard dev-only por config inyectada (SC-006).

## Trazabilidad FR→tarea
FR-001→T002/T003/T005 · FR-002→T001/T003 · FR-002b→T006 · FR-003→T010/T012 · FR-004→T014 ·
FR-005→T007/T008 · FR-006→T003/T004/T014 · FR-007→T013. SC-001→T005 · SC-002→T005 · SC-003→T006 ·
SC-004→T010 · SC-005→T014 · SC-006→T014 · SC-007→T008 · SC-008→T014.
