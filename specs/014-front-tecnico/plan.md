# Plan: FE-2 · Front del técnico (014)

**Branch**: `014-front-tecnico` | **Date**: 2026-07-14 | **Spec**: [spec.md](./spec.md)

## Summary
Write-side del técnico sobre el shell de FE-1: **iniciar trabajo** (`startOrderWork`), **registrar ejecución**
con notas + ≥1 evidencia (metadato) y **enviar a revisión** (`submitOrderExecution`). Reutiliza toda la
infraestructura de FE-1 (capa api con 401→refresh/CSRF/token en memoria, design system, router, estados). Sin
backend ni contrato nuevos; evidencia a nivel de metadato (`object_ref` = UUID; binario = deuda #007).

## Technical Context
- **Stack**: React 18 + TS strict + Vite (el de FE-1). Vitest + Testing Library + axe. Sin dependencias nuevas
  salientes de peso (UUID: `crypto.randomUUID()` nativo).
- **Reutiliza (FE-1, ya en develop)**:
  - `src/api/client.ts` (401→refresh dedup, CSRF double-submit, token en memoria, mapeo de error+offline),
    `session-store.ts` (bootstrap/eventos/purga — base para FR-010), `schemas.ts` (Zod↔contrato), `generated/`
    (tipos del contrato → `ExecutionRequest`/`EvidenceRef`).
  - `src/ui/` (Button, TextField, StatusBadge, states, MasterDetail, SkipLink, tokens) + design system §8 (mapeo de errores).
  - `src/features/orders/` (OrderDetailView, OrdersView, useOrders) — se **extienden** con las acciones write.
- **Nuevo (FE-2)**:
  - **Capa api**: envoltorios `startOrderWork(orderId)` y `submitOrderExecution(orderId, {notes, evidence[]})`
    sobre el client, con mapeo de códigos **reales** (422 INVALID_TRANSITION/EVIDENCE_REQUIRED/INVALID_EVIDENCE/
    VALIDATION_ERROR, 404, 403 FORBIDDEN_ROLE, 401→refresh). Zod de request/response derivado del contrato.
  - **Componentes**: acción `StartWorkButton` (aria-busy); `ExecutionForm` (notas + `EvidencePicker`);
    `EvidencePicker` (input cámara/archivo, validación al añadir, preview thumbnail, eliminar por ítem,
    nombre accesible, límite 10, aviso honesto role=status, object_ref=UUID); integración en `OrderDetailView`
    según estado (`assigned`→iniciar; `in_progress`→formulario) y rol (`technician` dueño).
  - **Borrador**: hook de persistencia de **notas** en `sessionStorage` (clave `sub`+`orderId`), purga por
    identidad (FR-010, colgado de los eventos de `session-store`).
- **Sin cambios**: `contracts/`, backend, workflows.

## Constitution Check
- **Contract-first (§Stack)**: ✅ tipos derivados de `contracts/` (codegen) + aserción Zod↔contrato; sin redefinir.
- **RBAC en backend**: ✅ el backend es la autoridad (403/404 uniforme); el front oculta acciones como doble capa (FR-007), no decide acceso.
- **Seguridad/PII**: ✅ notas/object_ref fuera de logs/errores/telemetría (SC-006); object_ref UUID sin PII; borrador purgado por identidad (FR-010); residual de sessionStorage documentado.
- **a11y (design system, WCAG AA)**: ✅ SC-004 (axe, teclado, aria-busy, nombres accesibles, tap targets ≥44px).
- **Frontend hexagonal/mismo-origen**: ✅ reutiliza la capa api de FE-1 (sin secretos en bundle; `/v1` mismo origen).
- Gates de backend (dominio hexagonal/Prisma): **N/A** (feature de front).

## Fases (para tasks)
1. **Capa api**: `startOrderWork` + `submitOrderExecution` (mapeo de códigos reales + Zod). Tests de la capa (mocks del client).
2. **EvidencePicker**: añadir/validar/preview/eliminar/límite/aviso honesto/object_ref UUID + a11y. Tests + axe.
3. **ExecutionForm** (notas + picker + enviar, aria-busy, foco tras error) + borrador (sessionStorage, purga FR-010). Tests.
4. **Integración en OrderDetailView/OrdersView**: acción Iniciar (assigned) / formulario (in_progress) por estado y rol; estados carga/error del detalle (reuso FE-1). Tests.
5. **Verificación**: Vitest (unit/componente) + axe verde; typecheck strict + lint; e2e opcional del camino feliz (iniciar→enviar) con backend mockeado por contrato (SC-002).
6. Gate G3 (panel front) + trazabilidad.

## Complexity Tracking
| Desviación | Por qué | Alternativa rechazada |
|---|---|---|
| Evidencia metadato-only (binario no viaja) | el contrato no tiene endpoint de subida (deuda #007) | simular subida inexistente (deshonesto) / bloquear FE-2 |
| `object_ref` = UUID aleatorio | evita colisión falsa y PII del nombre (G1 H-003/S-002) | derivar de nombre+tamaño (colisiona, filtra PII) |
| Borrador solo-notas en sessionStorage | el object URL del preview no sobrevive al remount (G1 H-101) | persistir EvidenceRef (refs huérfanos sin imagen) |

## Artefactos de diseño
- **research.md / data-model.md / contracts/**: **N/A** — el contrato ya existe (`contracts/orders.openapi.yaml`),
  no hay entidades de dominio nuevas (front). El "diseño" es el spec + este plan.
- **quickstart.md**: ver abajo (validación local del flujo iniciar→ejecutar→enviar).
