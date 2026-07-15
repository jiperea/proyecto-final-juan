# Tasks: Arquitectura y buenas prácticas de front (FE-6 · 020)

**Spec**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · **Feature**: gobernanza doc + lint (sin endpoints/IA/backend).

> Proporcionalidad (XV): la implementación real es mínima. No añadir maquinaria más allá de lo que los FR
> exigen. Fixes de código de producción esperados = **0** (baseline preliminar: `no-default-exports` = 0).

## Phase 1: Baseline (bloquea la clasificación de reglas)

- [ ] T001 Ejecutar el **baseline determinista** (FR-003a) de las 10 reglas candidatas (a)–(j) con la config
  del front (`cd frontend && npm run lint` / API ESLint), **secuencial y aislado** sobre base limpia, midiendo
  con `git diff --numstat` (añadidas+eliminadas; ficheros de producción, excl. `src/api/generated`/tests/
  fixtures). Clasificar cada regla `enforced` (verde o ≤3 fich/≤10 líneas) vs `recomendación` (>umbral), y
  revertir los fixes de medición de las degradadas. Anotar el **conteo por regla** para T004.

## Phase 2: User Story 1 — Documento explicativo (Priority: P1)

**Objetivo**: `docs/front-architecture.md` explica la arquitectura y las reglas con su porqué.
**Test independiente**: checklist de contenido — 5 capas + 10 reglas (a)–(j) con nivel + justificación (≥2 oraciones Y ≥30 palabras).

- [ ] T002 [US1] Crear `docs/front-architecture.md` §**Capas**: `features/` (auth/orders/shell), kit `ui/`,
  capa `api/` (cliente + hooks TanStack Query), `i18n/`, tipos derivados del contrato (`src/api/generated`) —
  cada una con **responsabilidad** y **"qué NO va aquí"** (FR-001, SC-001).
- [ ] T003 [US1] En `docs/front-architecture.md` §**Reglas**: documentar las **10 reglas (a)–(j)**, cada una
  con **nivel** (`enforced`/`recomendación`/`guía`) + **justificación ≥2 oraciones Y ≥30 palabras**; regla (h)
  = "la UI nunca autoriza; backend único (Const. IV)"; regla (c) = distinguir 401/403/404 + excepción de
  anti-enumeración por recurso (respetar el 404 de enmascaramiento; citar `OrderDetailView`/`useOrderMutations`)
  (FR-002/002a/002b/002c, SC-001).
- [ ] T004 [US1] En `docs/front-architecture.md` §**Baseline e inventario**: registrar el conteo del baseline
  (T001) por regla (evidencia de degradaciones), el **inventario de ficheros RBAC-sensibles** (route guards,
  `OrderDetailView`, `useOrderMutations`, `ProtectedRoute`…) con la regla fail-safe + grep, y notas de
  cualquier `eslint-disable` (FR-003a, FR-008a).

## Phase 3: User Story 2 — Enforcement determinista (Priority: P1)

**Objetivo**: las reglas `enforced` se hacen cumplir por eslint; una violación falla; el código actual queda verde.
**Test independiente**: `eslint` front = 0 errores; el test-fixture detecta una violación por cada regla `enforced`.

- [ ] T005 [P] [US2] **[Fase Red]** Crear `frontend/tests/lint-fixtures/` con un snippet "malo" por regla
  candidata a `enforced` (mínimo `no-default-exports`, `react-hooks/exhaustive-deps`) + un test Vitest que
  corre ESLint **programático** sobre cada snippet y **asserta que produce error**. Commit del test en **rojo**
  (aún sin las reglas activas) (FR-007/FR-007a, SC-003).
- [ ] T006 [US2] Editar `frontend/.eslintrc.cjs`: activar como **error** las reglas `enforced` del baseline
  (T001) — `no-default-exports`, `react-hooks/exhaustive-deps`, y el límite de importación entre capas
  (`no-restricted-imports`) **si el baseline lo dejó enforced**; **excluir del run principal solo**
  `tests/lint-fixtures/**` (glob acotado). Pone T005 en **verde** (FR-003/004/005/006).
- [ ] T007 [US2] Añadir la comprobación **doc↔config** (FR-010/SC-006): test o script que verifica que cada
  regla etiquetada `enforced` en `docs/front-architecture.md` existe **como error** en `.eslintrc.cjs`.

## Phase 4: User Story 3 — Cero regresión y alcance acotado (Priority: P2)

**Objetivo**: sin regresión ni cambios fuera de alcance.
**Test independiente**: gates de front verdes; `git diff --name-only` sin backend/contracts/domain.

- [ ] T008 [US3] Correr los gates del front y dejarlos **verdes**: `cd frontend && npm run lint`, `tsc --noEmit`,
  `stylelint`, `build`, `vitest`. Aplicar fixes de producción **solo** si el baseline los exigió, dentro del
  umbral (≤3 fich/≤10 líneas por regla, ≤6/≤20 agregado sobre el diff dedup) y **sin tocar lógica RBAC**
  (FR-008a); si excede, degradar la regla (FR-003b/FR-008/FR-009, SC-002/SC-004).
- [ ] T009 [US3] Verificar **alcance**: `git diff --name-only develop` no contiene ficheros bajo `backend/`,
  `contracts/`, `src/domain/`; solo `docs/` y `frontend/` (FR-008, SC-005).

## Phase 5: Polish / cierre

- [ ] T010 Actualizar `docs/traceability.md` (fila FE-6/020: RF→artefacto/regla→test) y `docs/06-roadmap.md`
  (estado FE-6). Preparar G3 (informe del gate).

## Dependencias

- **T001** (baseline) bloquea T003/T004 (nivel de cada regla) y T006 (qué activar).
- **T005 (Red)** antes de **T006 (verde)**. T007 tras T006.
- US1 (T002–T004) y US2 (T005–T007) pueden solaparse salvo la dependencia T001→{T003,T004,T006}.
- US3 (T008–T009) tras US1+US2. T010 al final.

## MVP

US1 (el documento) + US2 (enforcement de al menos `no-default-exports` y `exhaustive-deps`) ya entregan el
valor central; US3 es la red de no-regresión/alcance.
