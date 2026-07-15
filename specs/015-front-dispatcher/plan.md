# Plan: FE-3 · Front del dispatcher (015)

**Branch**: `015-front-dispatcher` | **Date**: 2026-07-15 | **Spec**: [spec.md](./spec.md)

## Summary
Write-side del dispatcher sobre el shell de FE-1: **reasignar** una orden reasignable (`assigned`/`in_progress`) a otro técnico desde el master-detail de escritorio, con motivo, reflejando el nuevo asignatario **sin recarga**. Reutiliza toda la infraestructura de FE-1/FE-2 (capa api con 401→refresh/CSRF/token en memoria, invalidación de react-query, design system, router, i18n de errores, `useWideViewport`). Sin backend ni contrato nuevos: consume `reassignOrder` (`POST /orders/{id}/reassignments`) del contrato 004. El técnico destino se introduce **manualmente** (UUID validado en cliente; obtenido fuera de banda — deuda de backend registrada).

## Technical Context
- **Stack**: React 18 + TS strict + Vite (el de FE-1). Vitest + Testing Library + axe; e2e Playwright (opcional, camino feliz). Sin dependencias nuevas.
- **Reutiliza (ya en develop, FE-1/FE-2)**:
  - `src/api/client.ts` (`apiFetch`, `ApiError` con `userMessage`, 401→refresh dedup, CSRF, `OFFLINE_MESSAGE` sin respuesta HTTP → **FR-016**, `FALLBACK_MESSAGE` código no mapeado → **FR-015**).
  - `src/api/generated/orders.ts` (**`ReassignmentRequest` ya generado** del contrato) + `src/api/schemas.ts` / `types.ts` (Zod↔contrato).
  - `src/i18n/errors.ts`: **ya** contiene `FORBIDDEN_ROLE`, `INVALID_ASSIGNEE`, `VALIDATION_ERROR`, `OFFLINE_MESSAGE`, `NOT_AVAILABLE_MESSAGE`, `FALLBACK_MESSAGE` (mapeo por código, FR-006..010/015/016).
  - `src/ui/`: `Button`, `TextField`/`TextArea` (label + `aria-describedby` + `error`/`aria-invalid`), `MasterDetail` + **`useWideViewport()` (`min-width:1024px`) → FR-018**, `StatusBadge`, states.
  - `src/features/orders/`: `OrderDetailView` (se **extiende**), `OrdersView`, `useOrders`, `useOrderMutations` (patrón de invalidación), `write-api.ts` (se **extiende**), `features/auth/session`.
- **Nuevo (FE-3)**:
  - **Capa api**: `reassignmentRequestSchema` (Zod: `assignee_id` UUID RFC 4122 v1–v5, `reason` 1..500 code points con ≥1 imprimible) derivado del contrato + envoltorio `reassignOrder(orderId, {assignee_id, reason})` sobre el client (respuesta `Order`, `version`+1). Mutación `useReassign(orderId)` (invalida `['order',id]` + `['orders']`).
  - **Componente** `ReassignForm`: campo destino (entrada manual, inicialmente vacío, `trim` antes de validar formato UUID **on blur/submit**, hint "el identificador se obtiene fuera de la app"), campo motivo (`TextArea`, 1..500 imprimible), botón confirmar (**no** deshabilitado por validez; en vuelo `aria-busy`+`aria-disabled`, no `disabled` nativo → FR-004); validación de cliente que muestra **ambos** errores a la vez (FR-017), `aria-describedby` con ayuda+error coexistentes y `aria-invalid`, error limpiado al editar; al éxito **cierra** el formulario, mueve el foco al asignatario del detalle y anuncia en `aria-live=polite` **nombrando el destino** (FR-013).
  - **Integración en `OrderDetailView`**: la acción de reasignar se ofrece **solo** a rol `dispatcher`, en estados `assigned`/`in_progress`, **y solo** con `useWideViewport()` verdadero (FR-001/FR-018); tras 404 en el envío, limpiar el panel de detalle + refrescar el listado.
- **Sin cambios**: `contracts/`, backend, workflows.

## Constitution Check
- **Contract-first (§Stack)**: ✅ `ReassignmentRequest` derivado de `contracts/` (codegen) + Zod↔contrato; sin redefinir tipos.
- **RBAC en backend**: ✅ el backend es la autoridad (403/404 uniforme, 422 INVALID_ASSIGNEE); el front **oculta** la acción (rol + breakpoint) como doble capa, no decide acceso (FR-001/SC-004).
- **Seguridad/PII**: ✅ `reason`/`assignee_id` fuera de logs/telemetría/**SDKs de terceros**/**storage** del navegador (FR-011, SC-005); 404 genérico no-enumerante (FR-008); rate-limit de intentos = backend (FR-017).
- **a11y (design system, WCAG 2.1 AA)**: ✅ SC-003 (axe 0 violaciones, teclado, foco/anuncio en éxito **y error**, contraste ≥4.5:1/≥3:1 con comprobación dirigida a disabled/focus, tap targets ≥44px); solo tokens, sin estilos sueltos.
- **Frontend hexagonal/mismo-origen**: ✅ reutiliza la capa api de FE-1 (`/v1` mismo origen, sin secretos en bundle).
- Gates de backend (dominio hexagonal/Prisma): **N/A** (feature de front).

## Fases (para tasks)
1. **Capa api**: `reassignmentRequestSchema` (Zod) + `reassignOrder` + `useReassign` (mapeo de códigos reales: 404, VALIDATION_ERROR, INVALID_ASSIGNEE, FORBIDDEN_ROLE, 401→refresh, **500→FALLBACK (FR-015)**, **red→OFFLINE (FR-016)**). Tests de la capa (mocks del client) — incl. i18n **tabla cerrada de claves por código** (G1 diferido c).
2. **ReassignForm**: campos destino/motivo, validación de cliente (trim + UUID RFC 4122 v1–v5 + motivo 1..500; **ambos errores a la vez**; on blur/submit), `aria-describedby` ayuda+error + `aria-invalid`, `aria-busy`/`aria-disabled` en vuelo, cierre + foco + `aria-live=polite` nombrando destino al éxito. Tests + axe (estados normal/error/en vuelo/éxito) incl. **contraste dirigido a disabled/focus** y **tap targets** (G1 A08).
3. **Integración en `OrderDetailView`/`OrdersView`**: ofrecer reasignar por rol `dispatcher` + estado reasignable + `useWideViewport` (FR-001/FR-018); limpiar detalle + refrescar listado tras 404 (FR-008). Tests de render por rol y por viewport (SC-004).
4. **Seguridad/no-fuga**: test con espía de **consola y de storage** (y del **SDK de telemetría** si el shell lo tiene — G1 diferido e) de que `reason`/`assignee_id` no se emiten ni persisten (SC-005/FR-011).
5. **Verificación**: Vitest (unit/componente) + axe verde; typecheck strict (+codegen:check) + lint (**regla stylelint/eslint de "sin estilos sueltos"** — G1 diferido d, reusar la de FE-1/FE-2); build; e2e opcional del camino feliz (reasignar con UUID conocido, backend mockeado por contrato — SC-001).
6. Gate G3 (panel de front) + trazabilidad `docs/traceability.md` (FR→tarea→test de FE-3).

## Complexity Tracking
| Desviación | Por qué | Alternativa rechazada |
|---|---|---|
| Entrada manual de UUID del técnico | el contrato no expone listado de técnicos (deuda de backend) | inventar endpoint (amplía backend) / bloquear FE-3 |
| UUID obtenido fuera de banda | `assigned_to` es UUID desnudo sin nombre (G1 B01) | fingir que SC-001 es demostrable sin el dato (spec theater) |
| `aria-disabled` (no `disabled`) en vuelo | no perder el foco al pasar a en vuelo (G1 F-101) | `disabled` nativo (el foco cae al body, foco impredecible) |

## Riesgos / diferidos de G1 (recogidos aquí)
- **Mock↔contrato real (a)**: el mock por contrato del e2e/tests se ancla a los tipos generados de `contracts/orders.openapi.yaml` (mismo `reassignOrder`), de modo que una deriva del contrato rompe `codegen:check`/typecheck. Tarea de test que use los tipos generados, no formas ad-hoc.
- **CD por fases (b)**: si FE-3 se despliega en un entorno donde 004 aún no está, el 404 será de infraestructura (endpoint inexistente), indistinguible del 404 de negocio. Nota de runbook/CD (ADR-0004/010), no FR de producto.
- **i18n (c)**, **lint de estilos (d)**, **verificación de telemetría (e)**: recogidos en las fases 1/5/4 respectivamente.

## Artefactos de diseño
- **research.md / data-model.md / contracts/**: **N/A** — el contrato ya existe (`contracts/orders.openapi.yaml`, `reassignOrder` + `ReassignmentRequest`); no hay entidades de dominio nuevas (front). El "diseño" es el spec + este plan.
- **quickstart.md**: ver [quickstart.md](./quickstart.md) (validación local del flujo reasignar).
