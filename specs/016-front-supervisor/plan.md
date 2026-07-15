# Plan: FE-4 · Front del supervisor (016)

**Branch**: `016-front-supervisor` | **Date**: 2026-07-15 | **Spec**: [spec.md](./spec.md)

## Summary
Write-side del supervisor sobre el shell de FE-1: **revisar** una orden `pending_review` (aprobar→`closed` con confirmación / rechazar→`in_progress` con motivo) y un **panel de resumen IA** bajo demanda. Consume los contratos 006 (`reviewOrder`) y 007 (`summarizeOrderIncident`), sin backend nuevo. Reutiliza toda la infraestructura de FE-1/2/3 (client, i18n de errores, invalidación react-query, `useWideViewport`, detalle read-only con notas/evidencia). **Novedad**: primer **componente de diálogo modal del design system** (`ConfirmDialog`, `role=alertdialog`), para la confirmación de aprobar. La lógica/eval de la IA es del backend 007; FE-4 solo muestra el resultado (distingue por `sufficient`, no inventa).

## Technical Context
- **Stack**: React 18 + TS strict + Vite (el de FE-1). Vitest + Testing Library + axe; e2e Playwright (opcional). Sin dependencias nuevas.
- **Reutiliza (ya en develop)**:
  - `src/api/client.ts` (`apiFetch`, `ApiError` con `userMessage`, 401→refresh, `OFFLINE`/`FALLBACK`), `src/api/generated/orders.ts` (**`reviewOrder`/`summarizeOrderIncident` + `ReviewRequest`/`IncidentSummaryResponse` ya generados**).
  - `src/i18n/errors.ts`: ya tiene `INVALID_REASON`, `RATE_LIMITED`, `SERVICE_UNAVAILABLE`, `INTERNAL`, `NOT_AVAILABLE`, `FORBIDDEN_ROLE`; **falta `EVIDENCE_MISSING`** → añadir.
  - `src/ui/`: `Button`, `TextArea` (con `hint`+`error` de FE-3), `StatusBadge`, `MasterDetail`+`useWideViewport`, states.
  - `src/features/orders/`: `OrderDetailView` (se **extiende**; ya muestra `notes`/`evidence`/`last_rejection_reason` por presencia — FE-1), `useOrders`, `useOrderMutations` (patrón invalidación), `write-api.ts` (se **extiende**), `features/auth/session`.
- **Nuevo (FE-4)**:
  - **Componente DS** `src/ui/ConfirmDialog.tsx` (+ tokens en `components.css`/`tokens.css`): `role="alertdialog"`, `aria-modal`, foco inicial dentro, **foco atrapado**, `Esc`/Cancelar cierran, **retorno de foco** al disparador, **click-outside NO cierra**. Primitiva reutilizable (FR-017/G1-A08).
  - **Capa api**: `reviewRequestSchema` (Zod: `decision` enum, `reason` 1..1000 code points ≥1 imprimible, opcional pero exigido en reject en el componente) + `reviewOrder(orderId, body)` y `summarizeIncident(orderId)` en `write-api.ts`. Mutaciones `useReview(orderId)` (invalida `['order',id]`+`['orders']`; onError 404→invalida) y `useSummary(orderId)` (POST bajo demanda; **descarta respuestas fuera de orden**; 401→refresh sin auto-retry).
  - **Componentes**: `ReviewActions` (Aprobar→`ConfirmDialog`; Rechazar→motivo `TextArea` + envío; aria-busy/aria-disabled en vuelo; mapeo de errores por campo/alerta; deshabilita Aprobar si `evidence.count===0`); `IncidentSummaryPanel` (botón "Resumir con IA" bajo demanda; estados vacío/cargando/con-resumen/sin-material/error; región "Resumen (IA)" con encabezado, texto **plano escapado**; 429 deshabilita durante `Retry-After`).
  - **Integración en `OrderDetailView`**: `canReview = supervisor ∧ pending_review ∧ useWideViewport`; regiones `aria-live` **separadas** (revisión / resumen); foco a estado / encabezado del resumen; aviso accesible bajo el breakpoint; limpiar el resumen al cambiar de orden.
- **Sin cambios**: `contracts/`, backend, workflows.

## Constitution Check
- **Contract-first**: ✅ `ReviewRequest`/`IncidentSummaryResponse` derivados de `contracts/` (codegen) + Zod↔contrato; sin redefinir.
- **RBAC en backend**: ✅ el backend es la autoridad (403/404/409); el front oculta acciones por rol+estado+breakpoint (doble capa, FR-001/015/SC-004). Scope del supervisor = backend (assumption).
- **Seguridad/PII**: ✅ `reason`/`last_rejection_reason`/`summary` fuera de logs/telemetría/**storage** (FR-012, SC-006); 404 genérico no-enumerante; sin auto-retry de mutación irreversible tras 401.
- **IA (Constitution VIII)**: ✅ FE-4 **solo muestra** el resultado; distingue por `sufficient` (no inventa, no re-evalúa el texto); el eval de faithfulness/no-PII es del backend 007 (promptfoo allí). promptfoo **N/A** en FE-4.
- **a11y (WCAG 2.1 AA)**: ✅ SC-003 (axe 0, teclado, alertdialog con foco atrapado/retorno, contraste, tap targets); solo tokens (nuevo `ConfirmDialog` tokenizado).
- Gates de backend (dominio hexagonal/Prisma): **N/A** (feature de front).

## Fases (para tasks)
1. **DS `ConfirmDialog`**: primitiva accesible (alertdialog, foco atrapado/inicial/retorno, Esc, click-outside no cierra) + tokens. Tests (teclado/foco) + axe.
2. **Capa api**: `reviewRequestSchema` (Zod) + `reviewOrder`/`summarizeIncident` en `write-api.ts` + `useReview`/`useSummary` (invalidación; 404→invalida; descarte de respuestas fuera de orden; 401 sin auto-retry). i18n: añadir `EVIDENCE_MISSING`. Tests de la capa (mapeo de códigos reales, incl. 500 en ai-summary).
3. **US1 · ReviewActions**: aprobar (con `ConfirmDialog`) / rechazar (motivo 1..1000, validación cliente + INVALID_REASON al campo); aria-busy/aria-disabled en vuelo; 409 EVIDENCE_MISSING + deshabilitar aprobar si `evidence.count===0`; 404 limpia detalle + foco estable; conservar motivo en 500/503; no reintentar tras 401 sin re-confirmar. Integración en `OrderDetailView` (rol+estado+viewport). Tests + axe.
4. **US2 · IncidentSummaryPanel**: botón bajo demanda; estados (vacío/cargando/con-resumen/sin-material/error); `sufficient` decide (SC-005); 429 (Retry-After, deshabilitar) / 503 / 500; región "Resumen (IA)" texto plano; descartar respuesta fuera de orden; limpiar al cambiar de orden; regiones aria-live separadas. Tests + axe.
5. **US3 · Rol/viewport + a11y + no-fuga**: render por rol/viewport (SC-004) + test de bypass 403; espía consola/storage de reason/last_rejection_reason/summary (SC-006); barrido axe de todos los estados (incl. alertdialog y éxito) + contraste dirigido + tap targets.
6. **Verificación**: typecheck (+codegen:check) + lint (stylelint sin estilos sueltos) + `npm test` (+axe) + build; e2e opcional del camino feliz (revisar aprobar/rechazar + pedir resumen) por contrato. Gate G3 (panel front) + trazabilidad.

## Complexity Tracking
| Desviación | Por qué | Alternativa rechazada |
|---|---|---|
| Nuevo componente `ConfirmDialog` en el DS | no existe diálogo modal en `ui/`; FR-017 exige alertdialog accesible para una acción irreversible | confirmación inline sin foco atrapado (frágil, G1 F-001) / `window.confirm` (no accesible ni tokenizado) |
| `useSummary` descarta respuestas fuera de orden | master-detail: navegar entre órdenes con una petición en vuelo contaminaría el panel (G1 H-003) | ignorar el orden (muestra resumen de otra orden) |
| Sin auto-retry de approve tras 401 | `closed` es irreversible; anti-fat-finger (G1 H-007) | reintento automático (aplica aprobación sin confirmación vigente) |

## Riesgos / diferidos
- **Scope del supervisor (RBAC por equipo)**: responsabilidad del backend; si se requiere, es una feature de backend futura (backlog). FE-4 no lo decide.
- **Mock↔contrato real**: el mock por contrato se ancla a los tipos generados (`codegen:check`); una deriva rompe typecheck. Validación contra stack real como en FE-3 (contra 006/007 reales) recomendada en G3.
- **Regla lint de estilos** y **verificación de telemetría** según el SDK del shell: reusar lo de FE-2/FE-3.

## Artefactos de diseño
- **research.md / data-model.md / contracts/**: **N/A** — el contrato ya existe (006/007); no hay entidades de dominio nuevas (front). El "diseño" es el spec + este plan.
- **quickstart.md**: ver [quickstart.md](./quickstart.md).
