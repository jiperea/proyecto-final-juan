# Implementation Plan: FE-1 · Front shell + acceso + listado (read-only)

**Branch**: `009-front-shell-listado` | **Date**: 2026-07-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/009-front-shell-listado/spec.md`

## Summary

Primera UI del proyecto: SPA responsive (React 18 + Vite, TypeScript strict) que **consume** los contratos
ya congelados (`auth.openapi.yaml`, `orders.openapi.yaml`) y el design system propio (`docs/design-system.md`).
Alcance read-side: acceso/sesión (login, `me`, logout, refresh silencioso con CSRF double-submit y dedup),
listado «mis órdenes» por rol y detalle solo-lectura por rol. Sin mutación de órdenes (FE-2/3/4). Enfoque
técnico: **contract-first en cliente** (tipos generados del OpenAPI + validación Zod), **estado de servidor**
gestionado (dedup/retry/invalidación de caché), **design tokens** (CSS variables) con lints deterministas
contra estilos sueltos, y a11y **WCAG 2.1 AA** verificada con axe-core + tests de teclado/reflow.

## Technical Context

**Language/Version**: TypeScript 5 (`strict`), Node 18+ (toolchain). Navegadores estándar actuales (sin IE).

**Primary Dependencies**: React 18 + Vite · React Router (rutas cliente) · TanStack Query (estado de
servidor: dedup, refetch-on-mount, invalidación de caché) · openapi-typescript (codegen de tipos desde el
contrato) + Zod (validación runtime de respuestas). UI propia (sin librería de componentes pesada).

**Storage**: Ninguno persistente en cliente. Access token **solo en memoria** (FR-003); refresh + `csrf_token`
en cookies gestionadas por el navegador (HttpOnly el refresh; `csrf_token` legible por JS para double-submit).
Estado de servidor en la caché en memoria de TanStack Query (purgada al logout/cambio de rol).

**Testing**: Vitest + React Testing Library (interacción/estados) · **axe-core** (`jest-axe`/`vitest-axe`) para
a11y (SC-003) · **Playwright** para teclado (SC-004), reflow 320px/zoom 200% (SC-007) y bfcache (FR-030) ·
**MSW** (Mock Service Worker) para simular los contratos congelados en tests (sin backend real en unit/comp.).

**Target Platform**: Web responsive. Campo (móvil, técnico) + oficina (escritorio master-detail,
dispatcher/supervisor). Servida por Vite en dev; build estático para prod (contenerización = fase DevOps).

**Project Type**: Web app (frontend nuevo `frontend/`, contra backend hexagonal ya existente).

**Performance Goals**: Interacción fluida; sin objetivos de throughput (es cliente). SC-001 (≤3 clics),
SC-006 (ningún estado colgado) y SC-007 (reflow) son los objetivos observables.

**Constraints**: Sin token en storage (FR-003); CSRF double-submit (FR-022); `Cache-Control: no-store` +
blanqueo en bfcache (FR-030); render escapado de texto libre (FR-011b); tokens del design system, sin estilos
sueltos (FR-017, lint en CI); WCAG 2.1 AA. Textos UI en español, código en inglés.

**Scale/Scope**: ~3 rutas (login, listado, detalle) · ~10 componentes base (`frontend/src/ui/`) · 3 roles ·
5 estados de orden · ~32 FR. Listado sin paginación (contrato). Slice pequeño (XV).

## Constitution Check

*GATE: pasa antes de Phase 0 y se re-comprueba tras Phase 1. FE-1 es front puro read-side; los gates de la
constitución están redactados para el backend, por lo que se **adaptan honestamente** al front — sin diluir
seguridad. La autoridad de acceso/PII/auditoría es del **backend** (001/002a/#010, ya verificados en sus gates).*

### Gate · Contract-First (Principio II) — adaptado a **consumo**

- [x] FE-1 **no crea** contrato; **consume** `contracts/auth.openapi.yaml` y `orders.openapi.yaml` congelados.
- [x] Tipos/validación **derivados del contrato por codegen** (openapi-typescript + Zod), no a mano; test de
  CI que **falla si divergen** (FR-016/SC-008b). `snake_case` externo del contrato → boundary tipado.
- [x] «Contract test» en cliente = handlers **MSW derivados del contrato** + tests de componente que ejercen
  cada `operationId` × código de respuesta consumido (200/401/403/404/500/503).

### Gate · RBAC y seguridad (Principios IV, IX, XI) — cliente

- [x] RBAC **espejo, no autoritativo** (FR-014); la validación real es del backend (ya testeada). La UI no
  asume autoridad propia; degrada ante 403/404 (FR-014) sin distinguirlos al usuario (404 uniforme, FR-013).
- [x] 401/403/404/409/503 distinguidos en el manejo de respuestas; mapeo por `code` a mensaje español + fallback
  (FR-015); test por código y rol (MSW).
- [x] PII en cliente: token solo en memoria (FR-003); **sin PII en logs de cliente** y **sin telemetría** en
  FE-1 (Assumptions); render **escapado** de texto libre (FR-011b, anti-XSS); purga de estado al logout/cambio
  de rol (FR-005/029); `Cache-Control: no-store` + bfcache (FR-030). Cifrado en reposo/URLs firmadas = backend.
- [x] Auditoría append-only = **backend** (#010 emite señal de accesos denegados; #009 forense). La UI no audita.

### Gate · Arquitectura por capas (Principio III) — análogo front

- [x] Separación de capas en `frontend/src/`: **ui/** (componentes+tokens, presentacional) · **features/**
  (vistas+hooks de aplicación) · **api/** (cliente HTTP, tipos codegen, MSW). Las vistas **no** hablan `fetch`
  directo: usan hooks/servicios (puertos) sobre el cliente de `api/`. Lógica de sesión aislada y testeable.
- [x] Dependencias por composición/inyección (provider de query client, contexto de auth); vistas testeables
  con MSW sin red real.

### Gate · Calidad y verificación (Principios V, VI, VII, XIII, XIV)

- [x] FRs en EARS (spec §Requirements); trazabilidad RF→endpoint→tarea→test (spec §Trazabilidad).
- [x] **TDD fase Red** (commit de test en rojo antes de implementar); cobertura de lógica de UI (hooks/servicios
  de sesión, mapeo de errores, RBAC espejo) ≥80%. **Equivalente front del "100% contratos/transiciones"
  (Principio VII)**: 100% de la matriz **operationId × código consumido** probada con MSW (login/me/refresh/
  logout · listOrders {200,401,403,503} · getOrderDetail {200,401,404,500,503}) y 100% de las **transiciones**
  de `bootStatus` (loading→authenticated/anonymous), sesión (login/logout/refresh/cambio-de-rol) y layout
  (campo↔master-detail al cruzar 1024px).
- [x] SC medibles verificados con **tooling determinista de front** (Vitest+RTL, axe-core, Playwright) — **no
  promptfoo** (FE-1 no tiene IA/NL; reconciliación XIV documentada en la spec §Success Criteria). Gates
  adversariales G1 (✅ verde) / G2 / G3 previstos, 0 bloqueantes.

**Resultado del gate**: PASA. Adaptaciones front declaradas arriba (consumo vs creación de contrato; capas de
front en vez de domain/handlers/infra; verificación con axe/RTL/Playwright en vez de promptfoo). Sin violaciones
que requieran Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/009-front-shell-listado/
├── plan.md              # Este fichero
├── research.md          # Phase 0 (decisiones técnicas)
├── data-model.md        # Phase 1 (view-models de cliente derivados del contrato)
├── quickstart.md        # Phase 1 (cómo levantar y validar FE-1)
├── contracts/
│   └── README.md        # Mapa de consumo (endpoints consumidos + codegen) — NO nuevos endpoints
└── tasks.md             # Phase 2 (/speckit-tasks — no lo crea /speckit-plan)
```

### Source Code (repository root)

```text
frontend/
├── src/
│   ├── ui/              # design system: tokens (CSS vars), componentes base (Button, TextField,
│   │                    #   StatusBadge, OrderCard/Row, MasterDetail, SkipLink, Toast, EmptyState, Spinner…)
│   ├── features/
│   │   ├── auth/        # login, sesión (context), bootstrap, logout, refresh-dedup, CSRF
│   │   ├── orders/      # listado por rol, detalle read-only, estados (loading/empty/error/forbidden)
│   │   └── shell/       # layout responsive campo↔oficina, skip-link, landmarks, focus de ruta
│   ├── api/             # cliente HTTP (interceptores 401/refresh/CSRF/AbortController), tipos codegen, Zod
│   ├── routes/          # React Router (/login, /orders, /orders/:id), guardas de sesión
│   └── i18n/            # textos español (constantes; i18n fuera de alcance)
├── tests/
│   ├── unit/            # hooks/servicios de sesión, mapeo de errores, RBAC espejo (Vitest+RTL, MSW)
│   ├── a11y/            # axe-core por pantalla
│   └── e2e/             # Playwright: teclado, reflow 320px/zoom200, bfcache, flujos por rol
├── mocks/               # handlers MSW derivados del contrato
├── package.json         # scripts: dev, build, test, test:a11y, test:e2e, codegen, lint (stylelint+eslint)
├── vite.config.ts       # proxy /v1 → backend en dev
└── tsconfig.json        # strict
```

**Structure Decision**: Web app con `frontend/` nuevo (Constitution §Stack: React 18 + Vite). Capas de front
(`ui/` presentacional · `features/` aplicación · `api/` infra) como análogo de la hexagonal del backend: las
vistas no tocan `fetch`; la lógica de sesión/errores/RBAC-espejo vive en hooks/servicios testeables con MSW.
El design system se materializa en `frontend/src/ui/` (tokens + componentes), consumido por las features.

## Complexity Tracking

> Sin violaciones de la Constitución que justificar. Las adaptaciones front (consumo de contrato, capas de
> front, verificación axe/RTL/Playwright) están declaradas en el Constitution Check, no son excepciones.
