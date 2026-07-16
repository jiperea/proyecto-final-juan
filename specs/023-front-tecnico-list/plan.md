# Implementation Plan: Fidelidad lista del técnico + detalle (FE-9 · 023)

**Branch**: `023-front-tecnico-list` | **Date**: 2026-07-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/023-front-tecnico-list/spec.md`

> **Sin `research.md` / `data-model.md` / `contracts/`**: feature de **presentación (frontend)**, continuación de
> FE-8; consume los contratos ya congelados y los tokens del design system de FE-8. Igual criterio de
> proporcionalidad que FE-6/FE-8.

## Summary

Cerrar los detalles de fidelidad que FE-8 dejó en **2 pantallas**: la **tarjeta de la lista** del técnico
(código mono + chip + nombre + fila de meta cliente «—»/técnico «Tú») y el **detalle** (cabecera código mono +
nombre; notas en tarjeta; evidencia en tiles «Imagen N» por recuento). Todo **anclado al contrato verificado**
(`orders.openapi.yaml`): `Order.assigned_to` (uuid opaco), `OrderDetailResponse.notes` (por rol), `EvidenceMeta`
(`count == content_types.length`, enum de imágenes). Cambio concentrado en `features/orders/` + `orders.css`,
reutilizando tokens de FE-8. Verificación determinista + visual (Playwright MCP con login del seed).

## Technical Context

**Language/Version**: TypeScript 5 strict · React 18 · Vite
**Primary Dependencies**: design system de FE-8 (`ui/`, tokens) · TanStack Query (estado servidor, ya en uso) · `useSession` (contexto de sesión existente, solo lectura)
**Storage**: N/A
**Testing**: vitest + React Testing Library + vitest-axe · Playwright MCP (captura claro/oscuro)
**Target Platform**: navegador; móvil ≤390px (lista técnico) y escritorio/master-detail
**Project Type**: web app (solo `frontend/`)
**Performance Goals**: sin regresión; render sobre datos ya cargados
**Constraints**: «token o nada» (0 hex/px/font sueltos, reutiliza tokens FE-8) · sin scroll horizontal · **no toca backend/contratos/RBAC** · no inventar datos (placeholders honestos)
**Scale/Scope**: 2 pantallas · `OrderList`/`OrderItem`, `OrderDetailView` (+ `orders.css`) + tests

## Constitution Check

### Gate · Contract-First (Principio II)
- [x] **N/A**: no añade/cambia endpoints ni esquemas; **consume** el contrato verificado (`orders.openapi.yaml`): `Order.assigned_to`, `OrderDetailResponse.notes`, `EvidenceMeta.count/content_types`.

### Gate · RBAC y seguridad (Principios IV, IX, XI)
- [x] **Invariante**: listado y detalle **server-authoritative** (scope por rol; 401/403/404); la UI no relaja ni asume aislamiento (guarda defensiva UUID surface la anomalía). `rbac-reskin-regression` verde.
- [x] PII: `notes` escapadas, mostradas solo si el backend las entrega al rol; sin nueva superficie ni logs; evidencia sin URL firmada (solo metadatos → tiles placeholder).

### Gate · Arquitectura Hexagonal (Principio III)
- [x] **N/A backend**. En front se respeta `docs/front-architecture.md`: presentacional; `useSession` de solo lectura; tipos derivados del contrato (no redefinir).

### Gate · Calidad y verificación (Principios V, VI, VII, XIII, XIV)
- [x] FRs en EARS; trazabilidad FR→componente→test (docs/traceability, fila FE-9).
- [x] **TDD fase Red** para el comportamiento nuevo (meta condicional, cabecera, notas-card, tiles) antes de implementar.
- [x] SC por verificación **determinista + visual** (sin IA → sin promptfoo). G1 ✅; G2/G3 previstos (0 bloqueantes).

**Sin violaciones** → Complexity Tracking vacío.

## Project Structure

### Source Code (solo `frontend/`)
```text
frontend/src/features/orders/
├── OrderList.tsx        # OrderItem: fila superior (código mono + chip), nombre, fila de meta (cliente «—» / técnico condicional)
├── OrderDetailView.tsx  # cabecera (código mono + nombre), notas en tarjeta, evidencia en tiles «Imagen N»
└── orders.css           # estilos de tarjeta meta, cabecera, notas-card, evidence-grid tiles 4/3 (tokens FE-8)

frontend/tests/
├── unit/   # meta condicional (Tú/UUID/Sin asignar/loading), cabecera, notas (presente/vacío), tiles por count, count=0
└── a11y/   # sin regresión axe
```

**Structure Decision**: solo `frontend/src/features/orders/**` (+ `orders.css`); import de solo-lectura de `features/auth/session` (`useSession`) para el `userId`. Reutiliza tokens/componentes de FE-8 (StatusBadge, Stepper, chip); **no** redefine el design system.

## Resolución de puntos de G1 (→ implementación)
- **Técnico en meta**: helper puro `resolveAssignee(assigned_to, sessionUserId)` → `'Tú' | <uuid8> | 'Sin asignar'` (incluye caso `userId` no resuelto → «Sin asignar»). Unit-test directo (cubre guarda defensiva).
- **Evidencia**: `tiles = Array.from({length: count})`, etiqueta `Imagen ${i+1}` (1-based); `count===0` → nodo «sin evidencia». Apoyado en invariante `count==content_types.length`.
- **Notas**: render solo si `notes?.trim()`; `<section>` con tokens (surface/border/radius-md/shadow-1) + label «Notas del técnico», texto escapado (JSX por defecto).
- **UUID truncado**: `assigned_to.slice(0,8)` mono, sin desbordar (coherente con el código de la tarjeta).

## Phase 0 — Research
**N/A** (sin incógnitas; contrato y design system verificados). No se genera `research.md`.

## Phase 1 — Design & Contracts
- data-model / contracts: **N/A** (sin entidades/endpoints nuevos).
- quickstart: validación con `make dev` + Playwright MCP + vitest/axe (no se duplica en fichero aparte).
- Agent context: se actualiza el bloque gestionado de `CLAUDE.md` al cerrar (plan activo).

## Complexity Tracking
*(vacío — sin violaciones)*
