# Tasks: FE-2 · Front del técnico (014)

**Spec**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · **Quickstart**: [quickstart.md](./quickstart.md)

Front sobre el shell de FE-1. **TDD** (test en rojo antes de implementar). Verificación: Vitest + axe, tsc
strict, lint. Rutas bajo `frontend/src/`.

## Phase 1 · Setup
- [ ] T001 Verificar codegen del contrato al día: `cd frontend && npm run codegen` → `src/api/generated/orders.ts` incluye `ExecutionRequest`/`EvidenceRef`/operaciones start/execution; `npm run typecheck` verde (baseline).

## Phase 2 · Foundational — capa api write (bloquea US1 y US2)
- [ ] T002 [P] Zod de request/response de las acciones write en `src/api/schemas.ts` (o módulo dedicado), derivado del contrato: `ExecutionRequest` (notes 1..2000 + evidence 1..10 EvidenceRef), `EvidenceRef` (object_ref 1..512 sin control/borde, content_type allowlist, size_bytes 1..25MiB). Aserción Zod↔contrato (AssertAssignable) — falla tsc si diverge (FR-008/SC-005).
- [ ] T003 Test (RED) de la capa api en `src/api/orders.write.test.ts`: `startOrderWork`/`submitOrderExecution` mapean **códigos reales** (422 INVALID_TRANSITION/EVIDENCE_REQUIRED/INVALID_EVIDENCE/VALIDATION_ERROR, 404 uniforme, 403 FORBIDDEN_ROLE, 401→refresh, fallback/offline) sobre el `client` mockeado (FR-006).
- [ ] T004 Implementar `startOrderWork(orderId)` y `submitOrderExecution(orderId, body)` en `src/api/orders.ts` (o `src/features/orders/api.ts`) sobre `client.ts` (reusa 401→refresh/CSRF); mapeo de errores del contrato → tipos de error de UI. Tests T003 en verde (FR-001/FR-005/FR-006).

## Phase 3 · US1 — Iniciar trabajo (P1)
**Objetivo**: orden propia `assigned` → Iniciar → `in_progress`. **Test independiente**: botón Iniciar dispara startOrderWork y refleja el estado.
- [ ] T005 [US1] Test (RED) de `StartWorkButton` en `src/features/orders/StartWorkButton.test.tsx`: dispara `startOrderWork`, estado en vuelo `aria-busy`+disabled, éxito→refleja in_progress, 422 INVALID_TRANSITION→mensaje mapeado sin error boundary + refresca (AC1.1/1.3, F-001).
- [ ] T006 [US1] Implementar `src/features/orders/StartWorkButton.tsx` (Button del DS, aria-busy, mapeo error). Tests T005 verde.
- [ ] T007 [US1] Integrar en `OrderDetailView.tsx`: mostrar Iniciar **solo** si rol=`technician` ∧ dueño ∧ estado `assigned` (FR-007, doble capa); estados carga/error del detalle reusando FE-1 (FR-011/F-005). Test de integración (AC1.2 404 uniforme; ocultación por rol AC2.7).

## Phase 4 · US2 — Registrar ejecución + evidencia + enviar (P1)
**Objetivo**: `in_progress` → notas + ≥1 foto → Enviar → `pending_review`.
- [ ] T008 [P] [US2] Test (RED) de `EvidencePicker` en `src/features/orders/EvidencePicker.test.tsx`: añadir imagen válida (deriva content_type con **fallback por extensión** HEIC + size_bytes; object_ref=UUID); rechazo **al añadir** de allowlist/tamaño (INVALID_EVIDENCE, causa concreta); preview thumbnail; eliminar por ítem (teclado, nombre accesible); límite 10 con feedback; dedup best-effort; aviso honesto (role=status, texto "metadato, no se almacena"). axe sin violaciones (FR-004/SC-004).
- [ ] T009 [US2] Implementar `src/features/orders/EvidencePicker.tsx` (input cámara/archivo, `crypto.randomUUID()`, `URL.createObjectURL` para preview, validación al añadir, aviso honesto con componente DS). Tests T008 verde.
- [ ] T010 [P] [US2] Test (RED) de `ExecutionForm` en `src/features/orders/ExecutionForm.test.tsx`: notas 1..2000 + ≥1 imprimible; envío llama submitOrderExecution con {notes, evidence[]}; aria-busy en Enviar; 422 sin perder datos + foco al error; EVIDENCE_REQUIRED/VALIDATION_ERROR mapeados (AC2.1-2.6, F-008).
- [ ] T011 [US2] Implementar `src/features/orders/ExecutionForm.tsx` (TextField DS + EvidencePicker + Enviar). Tests T010 verde.
- [ ] T012 [US2] Hook de **borrador de notas** en `src/features/orders/useExecutionDraft.ts` (sessionStorage clave `sub`+`orderId`; **solo notas**; restaura al volver; limpia al enviar; **purga al cambiar de identidad** colgado de `session-store`, FR-009/FR-010/H-101). Test (RED→GREEN): persiste notas, no persiste evidencias, purga al cambiar `sub`.
- [ ] T013 [US2] Integrar en `OrderDetailView.tsx`: si estado `in_progress` ∧ dueño ∧ technician → `ExecutionForm`. Test de integración del flujo iniciar→ejecutar→enviar.

## Phase 5 · Verificación y cierre
- [ ] T014 [P] Barrido **axe** en las pantallas nuevas + verificación de tap targets ≥44px (SC-004) y de que notas/object_ref no aparecen en logs/telemetría (SC-006, test/inspección).
- [ ] T015 [P] (opcional, justificado) e2e Playwright del **camino feliz** iniciar→notas→foto→enviar con backend mockeado por contrato (`page.route`) — SC-002.
- [ ] T016 Verificación total: `npm run typecheck` (incl. codegen:check) + `npm run lint` + `npm test` (+ axe) + `npm run build`, todo verde.
- [ ] T017 Trazabilidad `docs/traceability.md` (FR→tarea→test de FE-2) + Gate G3 (panel front) en `specs/014-front-tecnico/gates/`.

## Dependencias
- Phase 2 (api) bloquea US1 y US2. T002 antes de T003/T004.
- US1 (T005-007) y US2 (T008-013) paralelizables tras Phase 2, salvo la integración en `OrderDetailView` (T007/T013 tocan el mismo fichero → secuencial).
- T009 antes de T011/T013 (ExecutionForm usa EvidencePicker). T012 antes de T013.
- Phase 5 tras 1-4.

## MVP
US1 (iniciar) es el incremento mínimo demostrable; US2 (ejecutar+evidencia+enviar) completa el objetivo del roadmap ("con ≥1 foto y la envío a revisión").
