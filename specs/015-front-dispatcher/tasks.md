# Tasks: FE-3 · Front del dispatcher (015)

**Spec**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · **Quickstart**: [quickstart.md](./quickstart.md)

Front sobre el shell de FE-1/FE-2. **TDD** (test en rojo antes de implementar). Verificación: Vitest + axe, tsc
strict (+codegen:check), lint. Rutas bajo `frontend/src/`. Consume el contrato 004 (`reassignOrder`), sin backend nuevo.

## Phase 1 · Setup
- [ ] T001 Verificar codegen del contrato al día: `cd frontend && npm run codegen` → `src/api/generated/orders.ts` incluye `ReassignmentRequest` y la operación `reassignOrder`; `npm run typecheck` verde (baseline).

## Phase 2 · Foundational — capa api reassign (bloquea US1, US2, US3)
- [ ] T002 [P] Zod de request/response en `src/api/schemas.ts`, derivado del contrato: `reassignmentRequestSchema` (`assignee_id` UUID RFC 4122 v1–v5; `reason` 1..500 code points con ≥1 imprimible), `additionalProperties:false`. Aserción Zod↔contrato (AssertAssignable con `ReassignmentRequest`) — falla tsc si diverge (FR-002/SC-005).
- [ ] T003 Verificar/extender el i18n de errores en `src/i18n/errors.ts`: **tabla cerrada de claves por código** para reasignación (`VALIDATION_ERROR`, `INVALID_ASSIGNEE`, `FORBIDDEN_ROLE`, `NOT_AVAILABLE`/404, `OFFLINE`/red→FR-016, `FALLBACK`/500→FR-015) — reutiliza las ya existentes; añade solo lo que falte (G1 diferido c). Sin texto inventado en UI.
- [ ] T004 Test (RED) de la capa api en `src/features/orders/reassign-api.test.ts`: `reassignOrder(orderId,{assignee_id,reason})` mapea **códigos reales** sobre el `client` mockeado — 200→Order (version+1, status sin cambio); 404 uniforme (FR-008); 422 `VALIDATION_ERROR`/`INVALID_ASSIGNEE` (FR-006/007); 403 `FORBIDDEN_ROLE` + 401→refresh (FR-009); **500→FALLBACK (FR-015)** y **sin respuesta HTTP→OFFLINE (FR-016)**.
- [ ] T005 Implementar `reassignOrder` en `src/features/orders/reassign-api.ts` (valida el body con `reassignmentRequestSchema` antes de enviar; sobre `client.ts`, reusa 401→refresh/CSRF) y `useReassign(orderId)` en `src/features/orders/useOrderMutations.ts` (invalida `['order',id]`+`['orders']`). Tests T004 en verde (FR-002/FR-003).

## Phase 3 · US1 — Reasignar una orden reasignable (P1)
**Objetivo**: dispatcher en orden `assigned`/`in_progress` → destino + motivo → Reasignar → nuevo `assigned_to` sin recarga, estado sin cambio. **Test independiente**: el formulario dispara `reassignOrder` y refleja el nuevo asignatario.
- [ ] T006 [US1] Test (RED) de `ReassignForm` (camino feliz + estado en vuelo) en `src/features/orders/ReassignForm.test.tsx`: campo destino vacío al inicio; `trim`+formato UUID (RFC 4122) válido habilita el envío; envía `{assignee_id,reason}`; en vuelo `aria-busy`+`aria-disabled` (no `disabled` nativo), sin doble envío; al éxito **cierra el formulario**, mueve el foco al asignatario del detalle y anuncia en `aria-live=polite` **nombrando el destino** (FR-003/004/013/014).
- [ ] T007 [US1] Implementar `src/features/orders/ReassignForm.tsx` (TextField DS para destino con hint "identificador obtenido fuera de la app" + TextArea motivo + Button confirmar; validación on blur/submit; `aria-live` de éxito). Tests T006 verde.
- [ ] T008 [US1] Integrar en `OrderDetailView.tsx`: ofrecer la acción de reasignar **solo** si `rol=dispatcher` ∧ estado `assigned`/`in_progress` ∧ `useWideViewport()` (FR-001/FR-018). Test de integración del camino feliz (reasignar refleja nuevo `assigned_to` sin recarga; status sin cambio).

## Phase 4 · US2 — Errores mapeados a mensaje de UI, sin efecto ni fuga (P2)
**Objetivo**: cada error del contrato → mensaje de UI mapeado, asociado al campo cuando aplica, sin romper la vista.
- [ ] T009 [P] [US2] Test (RED) de validación de cliente en `ReassignForm.test.tsx`: motivo (1..500, ≥1 imprimible) y destino (UUID) inválidos → **ambos** errores a la vez, sin llamar al backend; error asociado con `aria-describedby` (ayuda+error coexistentes) + `aria-invalid`; el error se limpia al editar y re-evalúa on blur/submit (FR-005/014/017).
- [ ] T010 [US2] Test (RED) de mapeo de errores de backend en `ReassignForm.test.tsx`: `VALIDATION_ERROR`→campo motivo; `INVALID_ASSIGNEE`→campo destino (conserva lo introducido); `FORBIDDEN_ROLE`/401; **500→genérico sin boundary**; **red→conectividad con reintento**; todos sin exponer traza cruda (FR-006/007/009/010/015/016). Implementar el mapeo en `ReassignForm.tsx`/capa api hasta verde.
- [ ] T011 [US2] Integrar el 404 en `OrderDetailView.tsx`: tras 404 en el envío, mostrar mensaje uniforme (no-enumeración), **limpiar el panel de detalle** (estado vacío) y refrescar el listado (FR-008). Test de integración (AC US2.1).

## Phase 5 · US3 — Ocultación por rol/viewport y accesibilidad (P3)
**Objetivo**: la acción solo existe para dispatcher en escritorio; el flujo es accesible en todos los estados.
- [ ] T012 [P] [US3] Test de render por rol y viewport en `src/features/orders/OrderDetailView.test.tsx`: technician/supervisor no ven el control; dispatcher por debajo del breakpoint tampoco (mock de `useWideViewport`→false); dispatcher en escritorio sí (SC-004/FR-001/FR-018).
- [ ] T013 [P] [US3] Barrido **axe** de `ReassignForm` en los estados normal/error/en vuelo/éxito (0 violaciones); teclado (flujo completo); **contraste** ≥4.5:1 texto / ≥3:1 componentes y foco con comprobación dirigida a `disabled`/`focus` (estilos computados, G1 A08); **tap targets ≥44px** (SC-003).

## Phase 6 · Verificación y cierre
- [ ] T014 [P] Test de no-fuga en `src/features/orders/reassign-nolog.test.tsx`: espía de **consola** y de **storage** (localStorage/sessionStorage/IndexedDB) — `reason`/`assignee_id` no se emiten ni persisten durante/tras el flujo (éxito/error/desmontaje); si el shell tiene SDK de telemetría, espiarlo también (FR-011/SC-005, G1 diferido e).
- [ ] T015 Verificación total: `npm run typecheck` (incl. codegen:check) + `npm run lint` (incl. regla stylelint/eslint de "sin estilos sueltos" — G1 diferido d) + `npm test` (+ axe) + `npm run build`, todo verde.
- [ ] T016 [P] (opcional, justificado) e2e Playwright del **camino feliz** reasignar (dispatcher → destino UUID conocido → motivo → confirmar) con backend mockeado por contrato (`page.route`) — SC-001.
- [ ] T017 Trazabilidad `docs/traceability.md` (FR→tarea→test de FE-3) + Gate G3 (panel de front) en `specs/015-front-dispatcher/gates/`. Nota de runbook/CD del riesgo de despliegue por fases (404 infra vs negocio, G1 diferido b).

## Dependencias
- Phase 2 (api) bloquea US1/US2/US3. T002 antes de T004/T005; T003 (i18n) antes de T004.
- US1 (T006-008) antes de US2 (T009-011): US2 endurece el mismo `ReassignForm`/`OrderDetailView`. T007 antes de T008/T010/T011. T008 y T011 tocan `OrderDetailView.tsx` → secuencial.
- US3 (T012-013) tras US1 (necesita el componente e integración).
- Phase 6 tras 1-5.

## MVP
US1 (reasignar, camino feliz) es el incremento mínimo demostrable ("reasigno una orden reasignable a otro técnico"); US2 (errores) y US3 (rol/viewport + a11y) endurecen y completan la paridad con FE-2.

## Format validation
Todas las tareas siguen `- [ ] Txxx [P?] [US?] descripción con ruta`; setup/foundational/polish sin etiqueta de story; fases de US con `[US1|US2|US3]`.
