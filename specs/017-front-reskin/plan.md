# Implementation Plan: Reskin del front (refresh del design system + tema oscuro) — FE-5

**Branch**: `017-front-reskin` | **Date**: 2026-07-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/017-front-reskin/spec.md`

## Summary

Refresh **transversal de presentación** del front ya construido (FE-1..FE-4) hacia el lenguaje visual
explorado, **dentro del design system** y **sin ampliar el alcance funcional del brief**. Dos ejes:
(1) **re-tematizado** — nuevos valores de tokens (acento naranja, paleta de estados, radios/sombras) en
`frontend/src/ui/tokens.css`, consumidos por las vistas sin literales; (2) **tema oscuro CSS-first** con
conmutador (light/dark/system) persistido en `localStorage`, más dos componentes base nuevos
(**Stepper** del FSM, **ThemeToggle**) y el reestilo de la **tarjeta de resumen IA**. Verificación
**determinista**: `tsc`/`eslint`/`stylelint`, test de ratios de contraste sobre tokens (lista cerrada de
18 pares × 2 temas, spec §Pares de contraste), `vitest-axe` estructural, y la suite de front existente sin
regresión.

Sin `research.md`/`data-model.md`/`contracts/`: no hay entidades ni endpoints nuevos; los contratos ya
están congelados y la UI los sigue consumiendo sin redefinirlos. El único artefacto de diseño adicional
es `quickstart.md` (guía de validación).

## Technical Context

**Language/Version**: TypeScript 5 strict · React 18 + Vite (front existente)

**Primary Dependencies**: React, React Router, TanStack Query (ya presentes); **sin** librería de
componentes ni de theming nueva (constitución: sin librería pesada). CSS con custom properties.

**Storage**: `localStorage` (solo cliente) para la preferencia de tema (`light|dark|system`). Sin backend.

**Testing**: Vitest + Testing Library + `vitest-axe` (a11y estructural) + test determinista de ratios de
contraste (amplía `tests/a11y/contrast-tokens.test.ts` y `tests/unit/fe3-contrast.test.ts`); Playwright
e2e existente. Nota: vitest corre con `css:false` → el contraste se mide por ratios de token, no por axe.

**Target Platform**: navegador (móvil campo / escritorio oficina), responsive.

**Project Type**: web app (solo se toca `frontend/`).

**Performance Goals**: sin regresión; anti-FOUC (tema aplicado antes del primer pintado); build en verde.

**Constraints**: token o nada (0 estilos sueltos, lint verde); WCAG 2.1 AA en claro y oscuro; sin scroll
horizontal a 320px/zoom 200%; `prefers-reduced-motion` respetado; textos UI español.

**Scale/Scope**: ~5 pantallas ya existentes (login, listado, detalle, ejecución, revisión); 2 componentes
base nuevos; 1 fichero de tokens re-tematizado + tema oscuro; 1 doc de design system actualizado.

## Constitution Check

*GATE: presentación-only; los gates orientados a backend se marcan **N/A** con justificación (no hay
endpoints, dominio ni PII nuevos). Los gates de front/calidad sí aplican y se cumplen de forma determinista.*

### Gate · Contract-First (Principio II)

- [x] **N/A** — sin endpoints nuevos. La UI **consume** contratos congelados; los tipos siguen derivados
  del contrato (`src/api/generated/*`), no se redefinen (FR-011).
- [x] Sin cambios de `snake_case`/`camelCase` (no se toca el boundary).
- [x] Sin `operationId` nuevo → sin contract test nuevo.

### Gate · RBAC y seguridad (Principios IV, IX, XI)

- [x] **No se toca el RBAC backend.** El reskin **preserva el RBAC de UI espejo** (FR-015): controles por
  rol siguen ocultos/deshabilitados; verificado por test de regresión propio (SC-010) + no-cambio de
  aserciones en tests RBAC (SC-004).
- [x] 401/403/404/409: sin cambios (mapeo de errores del design system intacto).
- [x] PII: el reskin **no añade data-binding** (FR-008 tarjeta IA con mismas props; FR-014 componentes
  puros sin fetch); `localStorage` solo guarda la preferencia de tema (FR-016/SC-007).
- [x] Auditoría: sin cambios (no hay acciones nuevas).

### Gate · Arquitectura Hexagonal (Principio III)

- [x] **N/A backend.** Solo `frontend/`. Los componentes nuevos (Stepper/ThemeToggle) son de
  presentación pura (FR-014), sin acceso a datos fuera de props/localStorage-de-tema.

### Gate · Calidad y verificación (Principios V, VI, VII, XIII, XIV)

- [x] FRs en EARS (16) con trazabilidad RF→componente→tarea→test (spec §Trazabilidad).
- [x] TDD: fase Red por FR verificable (tests de tema, stepper, contraste, RBAC-regresión, localStorage)
  antes de implementar. Cobertura: se mantiene la suite existente en verde + tests nuevos por FR.
- [x] SC medibles **deterministas** (stylelint/eslint/tsc/build/vitest/axe/ratios). **promptfoo N/A**
  (sin componente IA). Gates G1✅/G2/G3 previstos (0 bloqueantes).

**Sin violaciones que justificar** → Complexity Tracking vacío.

## Project Structure

### Documentation (this feature)

```text
specs/017-front-reskin/
├── plan.md              # Este fichero
├── quickstart.md        # Guía de validación (Phase 1)
├── checklists/
│   └── requirements.md  # Checklist de calidad (G1)
├── gates/               # Informes de gate (G1 PASS)
└── tasks.md             # /speckit-tasks (siguiente paso)
```

(Sin `research.md`/`data-model.md`/`contracts/`: no aplican a una feature de presentación sin datos ni
endpoints nuevos.)

### Source Code (repository root) — solo `frontend/`

```text
frontend/
├── index.html                         # + script inline anti-FOUC (FR-013)
└── src/
    ├── ui/
    │   ├── tokens.css                  # re-tematizado + tema oscuro (@media + :root[data-theme])
    │   ├── components.css              # reestilo btn/badge/field/ai-summary/dialog + estilos stepper/toggle
    │   ├── theme.ts                    # utilidad única de tema (fuente de verdad: lee data-theme/localStorage)
    │   ├── Stepper.tsx                 # NUEVO componente base (FR-006)
    │   ├── ThemeToggle.tsx             # NUEVO componente base (FR-004b)
    │   ├── StatusBadge.tsx             # (badge re-tematizado vía tokens/clases)
    │   └── index.ts                    # barrel (+ Stepper, ThemeToggle)
    ├── features/
    │   ├── shell/AppShell.tsx          # monta el ThemeToggle en la cabecera
    │   └── orders/
    │       ├── OrderDetailView.tsx     # monta el Stepper
    │       └── IncidentSummaryPanel.tsx# tarjeta IA reestilada (mismas props, FR-008)
    └── (resto de vistas: sin cambios de lógica; solo consumen tokens actualizados)

tests/  (frontend)
├── a11y/contrast-tokens.test.ts        # AMPLIADO: lista cerrada de 18 pares × claro/oscuro
├── unit/fe3-contrast.test.ts           # ACTUALIZADO: reconciliado con la paleta nueva (claro+oscuro)
├── unit/  (nuevos)                     # theme-store, stepper, theme-toggle, rbac-reskin-regression, reduced-motion
├── e2e/reskin-responsive.spec.ts       # NUEVO: 320px/zoom200 sin overflow-x (SC-011)
└── (suite existente: debe seguir en verde)

docs/design-system.md                   # §2 tokens (acento + estados + hex/ratios), §2.4 tema oscuro
                                        # reescrito, §4 radios/sombras, §6 inventario (+Stepper, ThemeToggle)
```

**Structure Decision**: Web app hexagonal ya existente; esta feature **solo toca `frontend/` y
`docs/design-system.md`**. No hay cambios en `backend/`, `contracts/` ni `prisma/`.

## Enfoque de implementación (resumen; el detalle va a tasks.md)

1. **Tema CSS-first en `tokens.css`** (FR-004): `:root` claro; `@media (prefers-color-scheme:dark){
   :root:not([data-theme]) }`; `:root[data-theme="dark|light"]` override. Re-tematizar TODOS los tokens
   en ambos temas manteniendo nombres semánticos (las vistas no cambian).
2. **Paleta y fidelidad del acento** (FR-002, H-004): fijar acento naranja de la familia del artifact;
   si el par texto-blanco/acento no llega a 4.5:1, separar `--color-primary` (accesible para texto) del
   acento vivo para superficies ≥3:1. **Documentar hex + ratios medidos** en `docs/design-system.md §2`.
3. **Tests de ratios ampliados** (FR-005): recorrer la **lista cerrada de 18 pares** en claro y oscuro; es
   el guard determinista que hace fallar cualquier valor que no cumpla AA (fase Red primero). Se amplían
   **dos** ficheros: `contrast-tokens.test.ts` (parametrizado por tema) y `fe3-contrast.test.ts` (legacy,
   hoy hardcodea la paleta azul y solo claro → reconciliar con la paleta nueva en ambos temas para que
   siga en verde, SC-004).
4. **`theme.ts` (fuente de verdad única, CSS-first)** + **script inline anti-FOUC** en `index.html`
   (FR-013): `theme.ts` **solo** lee/escribe la elección del usuario (clave de tema) y aplica/quita
   `data-theme`; **no** calcula el tema "resuelto" en modo «sistema» ni usa `matchMedia`/`getComputedStyle`
   (ese caso lo gobierna la `@media`, FR-004). El `ThemeToggle` muestra la **elección** (claro/oscuro/
   sistema), no el tema resuelto. Misma lógica/clave que el script inline; el store de React lee el
   `data-theme` ya aplicado; `storage` event para sync entre pestañas; degradación si `localStorage` falla
   (FR-004b).
5. **Stepper** (FR-006) y **ThemeToggle** (FR-004b): componentes base propios, accesibles, puros
   (FR-014); montarlos en `OrderDetailView` y `AppShell`.
6. **Reestilo de la tarjeta IA** (FR-008): acento de revisión, guardián sin truncar, **mismas props**.
7. **Regresión RBAC del reskin** (FR-015): test propio por rol + no-cambio de aserciones en tests RBAC.
8. **`docs/design-system.md`** (FR-012): §2/§2.4/§4/§6 actualizadas antes de cerrar.

Orden TDD: primero los tests que fallan (contraste con nuevos pares, tema, stepper, toggle, RBAC), luego
la implementación hasta verde; lint/tsc/build en cada paso.
