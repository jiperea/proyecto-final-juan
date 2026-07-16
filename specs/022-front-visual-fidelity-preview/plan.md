# Implementation Plan: Fidelidad visual del front al preview (FE-8 · 022)

**Branch**: `022-front-visual-fidelity-preview` | **Date**: 2026-07-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/022-front-visual-fidelity-preview/spec.md`

> **Sin `research.md` / `data-model.md` / `contracts/`**: feature de **presentación (frontend)**, sin
> endpoints, IA, backend, contratos ni entidades nuevas. Consume los contratos ya congelados y el dominio
> existente. Igual criterio de proporcionalidad que FE-6 (020). Fuente de verdad visual: el artifact de
> exploración (ver spec).

## Summary

Llevar el front a **fidelidad visual literal** con el artifact en todas las pantallas (login, lista de
técnico, detalle, registrar ejecución, master-detail de oficina), ajustando **tokens** y **componentes** y
**construyendo** el *chrome* de oficina que falte — todo en frontend, sin tocar backend/RBAC. Enfoque: cambio
concentrado en `frontend/src/ui/*.css` (tokens + componentes base) + ajustes puntuales en vistas de
`features/`, con **dos comportamientos nuevos de UI** (filtro por segmento y buscador, ambos en cliente).
Verificación **determinista + visual** (tsc/eslint/stylelint/build/vitest+axe + capturas Playwright MCP con
aprobación humana). Excepción **AA acotada y anotada** para el acento-en-botón (decisión de clarify, avalada por G1).

## Technical Context

**Language/Version**: TypeScript 5 strict · React 18 · Vite

**Primary Dependencies**: design system propio (`frontend/src/ui/`, CSS variables) · TanStack Query (estado de
servidor, ya en uso) · React Router · vitest + React Testing Library + **vitest-axe**

**Storage**: N/A (sin persistencia nueva; datos vía contratos existentes)

**Testing**: vitest (unit/componente) · vitest-axe (a11y) · **Playwright MCP** (captura visual claro/oscuro por viewport)

**Target Platform**: navegador; responsive móvil (≤390px) · tablet (391–1023px) · escritorio (≥1024px)

**Project Type**: web app (solo se toca `frontend/`)

**Performance Goals**: sin regresión perceptible; filtro/búsqueda en cliente sobre el conjunto ya cargado

**Constraints**: **token o nada** (0 hex/px/font sueltos en vistas) · WCAG 2.1 AA salvo la excepción única de
FR-010 · `prefers-reduced-motion` · sin scroll horizontal 360–1440px · **no toca backend/contratos/RBAC**

**Scale/Scope**: 5 pantallas · ~1 fichero de tokens + ~2 de componentes/vistas CSS + ajustes de componentes
`.tsx` de presentación + config de a11y + tests

## Constitution Check

*GATE: pasa antes de Phase 0 y se re-comprueba tras Phase 1.*

### Gate · Contract-First (Principio II)
- [x] **N/A**: la feature **no añade ni cambia endpoints ni esquemas**; consume los contratos ya congelados (FR-013).

### Gate · RBAC y seguridad (Principios IV, IX, XI)
- [x] **Invariante, sin cambios**: RBAC sigue en backend (401/403); la UI solo muestra acciones por rol+estado según la lógica existente (FR-013a). No se relaja.
- [x] PII: capturas con **datos seed/sintéticos**, sin PII real (FR-014). Miniaturas de evidencia mantienen **URL firmada ≤300 s**, sin cache/persistencia/fuga en logs (invariante de datos, S-005).
- [x] El conjunto cargado ya viene **role-scoped** por backend; el filtro en cliente no amplía visibilidad (S-004).

### Gate · Arquitectura Hexagonal (Principio III)
- [x] **N/A backend**. En frontend se respeta `docs/front-architecture.md` (FE-6): presentacional vs contenedor, lógica de filtro en hook, tipos derivados del contrato, estados carga/error/vacío.

### Gate · Calidad y verificación (Principios V, VI, VII, XIII, XIV)
- [x] FRs en EARS; trazabilidad FR→componente/archivo→test (se completa en `docs/traceability.md`, fila FE-8).
- [x] **TDD fase Red** para el **comportamiento nuevo** (filtro por segmento y buscador, estados vacíos, FR-007c) y para los **tokens** (test de `getComputedStyle` que falla antes del cambio). El reskin puro (CSS) se cubre con tests de token/estructura + axe.
- [x] SC medibles por **verificación determinista + visual** (no promptfoo: sin IA en esta feature). Gates G1 ✅ / G2 / G3 previstos (0 bloqueantes).

**Sin violaciones** → Complexity Tracking vacío.

## Project Structure

### Documentation (this feature)
```text
specs/022-front-visual-fidelity-preview/
├── plan.md              # (este archivo)
├── spec.md
├── checklists/requirements.md
├── gates/               # gate-G1-022.md · dispositioned.md · *.json
└── tasks.md             # (lo genera /speckit-tasks)
```
(sin research/data-model/contracts — justificado arriba)

### Source Code (solo `frontend/`)
```text
frontend/src/
├── ui/
│   ├── tokens.css          # fondo/superficie/borde, acento vivo, paleta de estado (incl. teal), pending_review-bg, radios/sombras
│   ├── components.css      # badge (+punto), btn (acento), stepper (morado+halo/verde/pending), field, card, .seg (segmentado)
│   ├── StatusBadge.tsx     # punto de color (::before / currentColor)
│   ├── Stepper.tsx         # colores por estado del paso (fijos)
│   └── Segmented.tsx       # (nuevo) control «Activas/Todas» accesible (tablist/radiogroup)
├── features/
│   ├── auth/LoginPage.tsx          # hero centrado (marca/wordmark/tagline/campos/botón)
│   ├── orders/
│   │   ├── orders.css              # tarjetas, fila seleccionada (barra de acento), rejilla evidencia, tabla oficina
│   │   ├── OrdersView.tsx / OrderList.tsx   # segmentado + filtro cliente; estados vacíos (3)
│   │   ├── OrderDetailView.tsx     # stepper, notas, evidencia, acciones por rol
│   │   ├── ExecutionForm.tsx / EvidencePicker.tsx  # rejilla 3-col + tile «+» + píldora de requisito
│   │   └── IncidentSummaryPanel.tsx  # tarjeta IA (morado pending_review) — solo supervisor/pending_review
│   └── shell/ (o nuevo)            # chrome de oficina: topbar (marca+buscador+rol+avatar) + cabecera de tabla
├── ui/MasterDetail.tsx             # layout por viewport; selección persistente (FR-007c)
└── (config a11y)                   # supresión axe ACOTADA y anotada para el botón primario (FR-010)

frontend/tests/
├── unit/         # tokens (getComputedStyle), filtro/segmento/buscador, estados vacíos, selección persistente
└── a11y/         # vitest-axe (contraste ≥AA salvo excepción FR-010; ≥3:1 no-textual)
```

**Structure Decision**: web app, **solo `frontend/`**. Núcleo del cambio en `ui/` (tokens + componentes base,
disciplina «token o nada»); vistas de `features/` consumen tokens/componentes; dos hooks de filtro en cliente.

## Resolución de los detalles dispuestos en G1 (→ aquí)

- **H-004 (acento del «+» de evidencia)**: en el artifact el tile «+» (`.add`) es **borde discontinuo + color muted**, NO acento; el botón primario «Enviar ejecución» sí es acento. Decisión: el «+» **no** lleva acento vivo (coherente con la enumeración cerrada de FR-002).
- **H-005 (filtro cliente ↔ refetch/invalidación TanStack Query)**: el estado de filtro (segmento + término) es **UI-local**; la lista visible se **deriva** (`useMemo`) del `data` de la query. Tras refetch/invalidación/mutación, se **re-deriva** sobre el nuevo conjunto; la **selección persiste** (FR-007c) aunque el ítem salga del filtro; «sin coincidencias» deja de mostrarse si el refetch trae coincidencias.
- **H-006 (umbral de paginación)**: se documenta un **umbral operativo blando** (revisar paginación por servidor si un rol supera ~**200 órdenes** cargadas); por debajo, filtro/render en cliente es aceptable. Es guía, no requisito duro; la deuda de paginación (cursor, backend) queda diferida.
- **T-002 (ancla de `kicker`)**: el `kicker` es un recurso de la **página de exploración**, no de la app; **no** se replica como componente. Si alguna vista usa un rótulo tipo kicker, usará el token tipográfico `--font-kicker` ya existente.

## Phase 0 — Research
**N/A**: sin incógnitas técnicas (stack y design system ya establecidos; fuente visual = artifact). No se genera `research.md`.

## Phase 1 — Design & Contracts
- **data-model / contracts**: **N/A** (sin entidades ni endpoints nuevos).
- **quickstart**: la validación end-to-end se hace con `make dev` (HMR) + Playwright MCP (capturas claro/oscuro por viewport) + `vitest`/`axe`; no se duplica en un `quickstart.md` aparte (el flujo está en spec §Success Criteria y se detallará en `tasks.md`).
- **Agent context**: se actualiza el bloque gestionado de `CLAUDE.md` para apuntar a este plan.

## Complexity Tracking
*(vacío — sin violaciones de constitución)*
