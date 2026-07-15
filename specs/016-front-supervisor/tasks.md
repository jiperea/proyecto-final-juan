# Tasks: FE-4 · Front del supervisor (016)

**Spec**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · **Quickstart**: [quickstart.md](./quickstart.md)

Front sobre el shell de FE-1/2/3. **TDD** (test en rojo antes de implementar). Verificación: Vitest + axe, tsc
strict (+codegen:check), lint. Rutas bajo `frontend/src/`. Consume 006/007, sin backend nuevo. FE-4 solo
muestra el resultado IA (distingue por `sufficient`, no inventa); el eval de la IA es del backend 007.

## Phase 1 · Setup
- [ ] T001 Verificar codegen: `cd frontend && npm run codegen` → `src/api/generated/orders.ts` incluye `reviewOrder`/`summarizeOrderIncident` + `ReviewRequest`/`IncidentSummaryResponse`; `npm run typecheck` verde (baseline).

## Phase 2 · Foundational — DS ConfirmDialog + capa api (bloquea US1/US2/US3)
- [ ] T002 [P] Test (RED) de `ConfirmDialog` en `src/ui/ConfirmDialog.test.tsx`: `role="alertdialog"`+`aria-modal`; foco inicial dentro; **foco atrapado** (Tab/Shift+Tab ciclan dentro); `Esc` y Cancelar cierran (onCancel); **click en overlay NO cierra**; **retorno de foco** al disparador al cerrar; Confirmar dispara onConfirm (FR-017/G1-B01). axe sin violaciones.
- [ ] T003 Implementar `src/ui/ConfirmDialog.tsx` (primitiva DS accesible) + tokens en `src/ui/components.css`/`tokens.css` (overlay/elevación/foco); export en `src/ui/index.ts`. Tests T002 verde.
- [ ] T004 Añadir `EVIDENCE_MISSING` al mapa de `src/i18n/errors.ts` (mensaje "No se puede aprobar sin evidencia."); verificar que `INVALID_REASON`/`RATE_LIMITED`/`SERVICE_UNAVAILABLE`/`INTERNAL`/`NOT_FOUND`/`FORBIDDEN_ROLE` ya están (tabla cerrada de códigos de FE-4).
- [ ] T005 [P] `reviewRequestSchema` (Zod) en `src/api/schemas.ts`, derivado del contrato: `decision` enum(approve|reject); `reason` string 1..1000 code points con ≥1 imprimible (reutiliza `reasonHasPrintable`), opcional a nivel de esquema. AssertAssignable con `ReviewRequest` (falla tsc si diverge; FR-002).
- [ ] T006 Test (RED) de la capa api en `src/features/orders/write-api.review.test.ts`: `reviewOrder(id,{decision,reason})` → 200 Order (approve→closed | reject→in_progress); 422 VALIDATION_ERROR/INVALID_REASON; 409 EVIDENCE_MISSING; 404; 403; 401→refresh; 500; 503. `summarizeIncident(id)` → 200 {sufficient,summary}; 429 (Retry-After); 503; **500**; 404/403/401.
- [ ] T007 **Extender** `src/features/orders/write-api.ts` con `reviewOrder` (valida body con `reviewRequestSchema`) y `summarizeIncident`; `useReview(orderId)` + `useSummary(orderId)` en `src/features/orders/useOrderMutations.ts` (useReview invalida `['order',id]`+`['orders']`, onError 404→invalida; useSummary bajo demanda, **descarta respuestas fuera de orden/otra orden**, 401→refresh sin auto-retry). Tests T006 verde.

## Phase 3 · US1 — Aprobar/rechazar (P1)
**Objetivo**: aprobar→closed (con confirmación) / rechazar→in_progress (con motivo), sin recarga. **Test independiente**: el flujo dispara reviewOrder y refleja el nuevo estado.
- [ ] T008 [P] [US1] Test (RED) de `ReviewActions` en `src/features/orders/ReviewActions.test.tsx`: **Aprobar abre `ConfirmDialog`**; Confirmar envía `{decision:'approve'}`, Cancelar no envía; Rechazar exige motivo (1..1000, ≥1 imprimible; **ambos** cliente); aria-busy/aria-disabled en vuelo (no doble envío); mapeo INVALID_REASON→campo motivo, VALIDATION_ERROR/409 EVIDENCE_MISSING→alerta; **Aprobar deshabilitado si `evidence.count===0`**; conservar motivo en 500/503; tras 401 en approve confirmado NO reintenta (re-confirmar).
- [ ] T009 [US1] Implementar `src/features/orders/ReviewActions.tsx` (Button DS + `ConfirmDialog` para aprobar; `TextArea` motivo para rechazar; mapeo de errores por campo/alerta). Tests T008 verde.
- [ ] T010 [US1] Integrar en `OrderDetailView.tsx`: `canReview = supervisor ∧ pending_review ∧ useWideViewport`; tras 404 limpiar detalle + refrescar listado + foco estable (FR-008); orden decidida sale de la cola (FR-003); región `aria-live` de revisión + foco al estado (FR-014). Test de integración del camino feliz (aprobar/rechazar sin recarga).

## Phase 4 · US2 — Panel de resumen IA (P2)
**Objetivo**: resumen bajo demanda; `sufficient` decide; errores mapeados; no bloquea la revisión.
- [ ] T011 [P] [US2] Test (RED) de `IncidentSummaryPanel` en `src/features/orders/IncidentSummaryPanel.test.tsx`: estado **vacío** con botón; **cargando** (aria-busy, sin doble envío); `sufficient=true`→región "Resumen (IA)" (encabezado, **texto plano escapado**, distinguible de notas); `sufficient=false`→mensaje honesto **sin texto de resumen** (SC-005); 429→mensaje + botón deshabilitado durante `Retry-After`; 503/500→estado error con reintento; descartar respuesta fuera de orden.
- [ ] T012 [US2] Implementar `src/features/orders/IncidentSummaryPanel.tsx` (botón bajo demanda, estados, región con encabezado accesible, texto plano). Integrar en `OrderDetailView` con región `aria-live` **separada** + foco al encabezado del resumen; limpiar al cambiar de orden. Tests T011 verde. **Incluye test negativo de FR-016**: montar `OrderDetailView` de una orden `pending_review` y verificar que **NO** se llama a `ai-summary` al abrir (solo al pulsar el botón).

## Phase 5 · US3 — Rol/viewport, a11y y no-fuga (P3)
- [ ] T013 [P] [US3] Test de render por rol/viewport en `src/features/orders/OrderDetailView.test.tsx`: technician/dispatcher no ven revisión ni panel IA; supervisor bajo el breakpoint tampoco (aviso accesible de "revisión en escritorio"); supervisor en escritorio sí (SC-004/FR-001/015). **Test de bypass**: invocar `reviewOrder`/`summarizeIncident` con sesión no-supervisor → 403 manejado sin romper.
- [ ] T014 [P] [US3] Test de no-fuga en `src/features/orders/review-nolog.test.tsx`: espía de consola y de storage — `reason`/`last_rejection_reason`/`summary` no se emiten ni persisten durante/tras el flujo (FR-012/SC-006).
- [ ] T015 [P] [US3] Barrido **axe** (`src/features/orders`/`ui` a11y) de todos los estados nuevos (acciones, **alertdialog**, motivo, panel IA vacío/cargando/con-resumen/sin-material/error, en vuelo, éxito); teclado (foco atrapado + retorno); **contraste** ≥4.5:1/≥3:1 dirigido a disabled/focus; tap targets ≥44px (SC-003).

## Phase 6 · Verificación y cierre
- [ ] T016 Verificación total: `npm run typecheck` (incl. codegen:check) + `npm run lint` (incl. stylelint "sin estilos sueltos", también ConfirmDialog) + `npm test` (+axe) + `npm run build`, todo verde.
- [ ] T017 [P] (opcional, justificado) e2e Playwright del camino feliz (supervisor → orden pending_review → pedir resumen → aprobar con confirmación / rechazar con motivo) con backend mockeado por contrato (`page.route`) — SC-001. Validación contra stack real recomendada (006/007) en G3.
- [ ] T018 Trazabilidad `docs/traceability.md` (FR→tarea→test de FE-4) + Gate G3 (panel de front) en `specs/016-front-supervisor/gates/`.

## Dependencias
- Phase 2 bloquea US1/US2/US3. T002/T003 (ConfirmDialog) antes de US1 (T008 lo usa). T005 antes de T006/T007; T004 (i18n) antes de T006.
- US1 (T008-010) antes de US2 (T011-012)? Independientes salvo la integración: T010 y T012 tocan `OrderDetailView.tsx` → secuencial. US3 (T013-015) tras US1+US2.
- Phase 6 tras 1-5.

## MVP
US1 (aprobar/rechazar) es el incremento mínimo demostrable ("reviso y apruebo/rechazo con motivo"); US2 (resumen IA) completa el ítem 5 del brief; US3 endurece rol/viewport + a11y + no-fuga.

## Format validation
Todas las tareas siguen `- [ ] Txxx [P?] [US?] descripción con ruta`; setup/foundational/DS/polish sin etiqueta de story; fases de US con `[US1|US2|US3]`.
