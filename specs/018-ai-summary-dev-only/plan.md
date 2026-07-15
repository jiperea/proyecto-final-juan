# Implementation Plan: 018 — Resumen IA dev-only + indisponibilidad honesta

**Branch**: `018-ai-summary-dev-only` | **Date**: 2026-07-15 | **Spec**: [spec.md](./spec.md)

## Summary

Distinguir "proveedor IA no operable en este entorno" de un fallo transitorio, de forma **honesta** en el
producto desplegado, **sin API de pago**. Cambio acotado backend + frontend + docs. G1 ✅ PASS (2 rondas).

## Enfoque (hexagonal, deterministic-first)

**Backend:**
1. **DomainError `AI_UNAVAILABLE`**: añadir al tipo `ErrorCode`/`DomainError` y a `error-mapper` `STATUS`
   como **501** (Record 1:1). Mensaje genérico.
2. **Adaptador `claude-cli-provider`** (única capa que decide, FR-002/FR-006):
   - **Guard dev-only** (deny-by-default): la config inyectada trae `operable: boolean` (= `NODE_ENV==='development'`).
     Si `!operable` → `err(AI_UNAVAILABLE)` **sin invocar** el binario.
   - **Clasificación del error nativo**: en el `catch`, inspeccionar `error.code`: `ENOENT|EACCES|ENOEXEC|ENOTDIR`
     (spawn no ejecutable) → `err(AI_UNAVAILABLE)`; resto (timeout/`killed`/exit≠0) → `err(SERVICE_UNAVAILABLE)`.
   - El dominio sigue puro: recibe el `DomainError` por el puerto (`AiSummaryProviderPort.generate`).
3. **Handler `ai-summary`**: el orden de guards ya es authz(403)→rate-limit(429) (existente); el gate de
   material y la invocación del proveedor van después (dominio) → `AI_UNAVAILABLE` sólo puede surgir al final
   (FR-002b). Añadir outcome de log **`unavailable`** cuando el error es `AI_UNAVAILABLE` (sin PII).
4. **`AccessOutcome`**: añadir `'unavailable'` (tipo TS del logger, sin migración).
5. **Config** (`config.ts`): derivar `aiOperable` de `NODE_ENV`/`AI_PROVIDER` (Zod, fail-fast); inyectar en
   el provider vía `container.ts`.
6. **Contrato** `contracts/orders.openapi.yaml`: respuesta **501 `AI_UNAVAILABLE`** en `ai-summary`.

**Frontend:**
7. `write-api`/`api/client`: mapear `code:AI_UNAVAILABLE` (o el 501) a un `userMessage` propio.
8. `IncidentSummaryPanel`: nuevo estado `unavailable` → muestra «El resumen por IA no está disponible en este
   entorno», **deshabilita** el botón, sin reintento. `i18n/errors`: añadir el mensaje.

**Docs:** design-system §8 (tabla de errores), roadmap (BL-072 cerrado), constitution/ADR (nota dev-only).

## Estructura afectada

```
backend/src/domain/result.ts            # ErrorCode + AI_UNAVAILABLE
backend/src/handlers/error-mapper.ts    # STATUS[AI_UNAVAILABLE]=501
backend/src/infra/ai/claude-cli-provider.ts  # guard dev-only + clasificación de error
backend/src/domain/ai/summary-ports.ts  # AccessOutcome += 'unavailable'
backend/src/handlers/orders/ai-summary.ts    # outcome 'unavailable'
backend/src/infra/config.ts + container.ts   # aiOperable inyectado
contracts/orders.openapi.yaml           # 501 AI_UNAVAILABLE
frontend/src/features/orders/IncidentSummaryPanel.tsx  # estado unavailable + botón deshabilitado
frontend/src/api/*  · src/i18n/errors.ts               # mapeo del código/mensaje
docs/design-system.md · docs/06-roadmap.md · .specify/memory/constitution.md
```

## Verificación

`npm run typecheck && npm run lint && npm run test` (backend, host contra db-test) + front
(`typecheck/lint/test`). Tests nuevos por SC (ver tasks). promptfoo N/A (no cambia la lógica IA). G3 al final.
