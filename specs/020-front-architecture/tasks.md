# Tasks: Arquitectura y buenas prácticas de front (FE-6 · 020)

**Spec**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · **Feature**: gobernanza doc + lint (sin endpoints/IA/backend).

> Proporcionalidad (XV): la implementación real es mínima. No añadir maquinaria más allá de lo que los FR
> exigen. Fixes de código de producción esperados = **0** (baseline preliminar: `no-default-exports` = 0).

## Phase 1: Baseline (bloquea la clasificación de reglas)

- [x] T001 Ejecutar el **baseline determinista** (FR-003a) con la config del front (`cd frontend && npm run
  lint` / API ESLint), **secuencial y aislado** sobre base limpia, midiendo con `git diff --numstat`
  (añadidas+eliminadas; ficheros de producción, excl. `src/api/generated`/tests/fixtures). **Solo las reglas
  mecanizables** por eslint pasan por baseline —candidatas: `no-default-exports` (g), `react-hooks/exhaustive-deps`
  (parte de b), `no-restricted-imports`/límite de capas (j), y cualquier otra de (a)–(i) con regla eslint real.
  Las **reglas NO mecanizables** (juicio humano: p. ej. (a) presentacional/contenedor, (i) responsive) se
  clasifican directamente como **`guía`** y se deja constancia explícita ("sin baseline: no mecanizable"),
  **sin** intentar correr eslint sobre ellas (H-003). Clasificar cada regla mecanizable `enforced` (verde o
  ≤3 fich/≤10 líneas) vs `recomendación` (>umbral), revertir los fixes de medición de las degradadas, y anotar
  el **conteo por regla** para T004. **El conjunto `enforced` resultante fija el nº de fixtures de T005.**

## Phase 2: User Story 1 — Documento explicativo (Priority: P1)

**Objetivo**: `docs/front-architecture.md` explica la arquitectura y las reglas con su porqué.
**Test independiente**: checklist de contenido — 5 capas + 10 reglas (a)–(j) con nivel + justificación (≥2 oraciones Y ≥30 palabras).

- [x] T002 [US1] Crear `docs/front-architecture.md` §**Capas**: `features/` (auth/orders/shell), kit `ui/`,
  capa `api/` (cliente + hooks TanStack Query), `i18n/`, tipos derivados del contrato (`src/api/generated`) —
  cada una con **responsabilidad** y **"qué NO va aquí"** (FR-001, SC-001).
- [x] T003 [US1] En `docs/front-architecture.md` §**Reglas**: documentar las **10 reglas (a)–(j)**, cada una
  con **nivel** (`enforced`/`recomendación`/`guía`) + **justificación ≥2 oraciones Y ≥30 palabras**; regla (h)
  = "la UI nunca autoriza; backend único (Const. IV)"; regla (c) = distinguir 401/403/404 + excepción de
  anti-enumeración por recurso (respetar el 404 de enmascaramiento; citar `OrderDetailView`/`useOrderMutations`)
  (FR-002/002a/002b/002c, SC-001).
- [x] T004 [US1] En `docs/front-architecture.md` §**Baseline e inventario**: registrar el conteo del baseline
  (T001) por regla (evidencia de degradaciones), el **inventario de ficheros RBAC-sensibles** (route guards,
  `OrderDetailView`, `useOrderMutations`, `ProtectedRoute`…) con la regla fail-safe + grep, y notas de
  cualquier `eslint-disable` (FR-003a, FR-008a).

## Phase 3: User Story 2 — Enforcement determinista (Priority: P1)

**Objetivo**: las reglas `enforced` se hacen cumplir por eslint; una violación falla; el código actual queda verde.
**Test independiente**: `eslint` front = 0 errores; el test-fixture detecta una violación por cada regla `enforced`.

- [x] T005 [US2] **[Fase Red · depende de T001]** Crear `frontend/tests/lint-fixtures/` con un snippet "malo"
  por **cada regla que T001 haya clasificado `enforced`** (el conjunto EXACTO del baseline, no una lista fija;
  típicamente `no-default-exports` + `react-hooks/exhaustive-deps`, y (j) si quedó enforced) + un test Vitest
  que corre ESLint **programático** sobre cada snippet y **asserta que produce error**. El **nº de fixtures =
  nº de reglas enforced** (FR-007): ni de más (una regla degradada no lleva fixture, nunca pasaría) ni de menos.
  Commit del test en **rojo** (aún sin las reglas activas en `.eslintrc.cjs`) (FR-007/FR-007a, SC-003).
- [x] T006 [US2] Editar `frontend/.eslintrc.cjs`: activar como **error** las reglas `enforced` del baseline
  (T001) — `no-default-exports`, `react-hooks/exhaustive-deps`, y el límite de importación entre capas
  (`no-restricted-imports`) **si el baseline lo dejó enforced**; **excluir del run principal solo**
  `tests/lint-fixtures/**` (glob acotado). Pone T005 en **verde** (FR-003/004/005/006).
- [x] T007 [US2] Añadir dos comprobaciones **automatizables** (test o script en CI):
  (a) **doc↔config** (FR-010/SC-006): cada regla etiquetada `enforced` en `docs/front-architecture.md` existe
  **como error** en `.eslintrc.cjs`;
  (b) **cupo/formato de `eslint-disable`** (FR-005a/SC-002, cierra K-003/H-005/S-002): el nº total de
  `eslint-disable` de reglas de la feature es **≤3**, cada uno con formato `-- <razón>` de **≥15 caracteres**,
  y se respeta la **prioridad RBAC** (los disables RBAC no ceden ante genéricos; H-016/H-019). Si el conteo es
  0 (esperado), la comprobación pasa trivialmente.

## Phase 4: User Story 3 — Cero regresión y alcance acotado (Priority: P2)

**Objetivo**: sin regresión ni cambios fuera de alcance.
**Test independiente**: gates de front verdes; `git diff --name-only` sin backend/contracts/domain.

- [x] T008 [US3] **Aplicación final + gates.** Si el baseline (T001) exigió fixes, **re-aplicarlos todos en un
  solo paso sobre base limpia** (no asumir que la suma de mediciones aisladas es el diff final) y **re-medir el
  agregado** `git diff --numstat develop -- frontend/src` (dedup): debe cumplir **≤6 ficheros/≤20 líneas**; si
  excede, degradar reglas en el orden canónico hasta cumplir (FR-003b/H-006/H-031). Correr los gates del front
  y dejarlos **verdes**: `npm run lint`, `tsc --noEmit`, `stylelint`, `build`, `vitest`. **Salvaguardas RBAC
  ejecutables (FR-008a — cierra K-002/H-004/S-001):** (1) correr un **grep de patrones RBAC**
  (`role`/`assignedTo`/`status`/`permission`/`useAuth`/`useSession`) sobre el **diff final**; si toca un
  fichero no listado en el inventario (T004), detenerse y reclasificarlo; (2) para cualquier fix en un fichero
  del inventario, aplicar el criterio de **nodo AST** (no tocar el `CallExpression` completo con lógica de
  rol); (3) **nombrar explícitamente** el subconjunto de **tests de vista por rol** (dispatcher/technician/
  supervisor) y confirmar que quedan **verdes** (no basta el `vitest` genérico). Nunca alterar lógica RBAC
  (FR-008/FR-009, SC-002/SC-004).
- [x] T009 [US3] Verificar **alcance**: `git diff --name-only develop` no contiene ficheros bajo `backend/`,
  `contracts/`, `src/domain/`; solo `docs/` y `frontend/` (FR-008, SC-005).

## Phase 5: Polish / cierre

- [x] T010 Reconciliar/cerrar trazabilidad y estado: (a) la tabla de trazabilidad de **`spec.md`** ya lleva
  los IDs reales (T001–T010) — verificar 0 `T0xx` residuales (cierra K-001/H-007/T-002); (b) actualizar
  `docs/traceability.md` (fila FE-6/020: RF→artefacto/regla→test) y `docs/06-roadmap.md` (estado FE-6); (c)
  confirmar `checklists/requirements.md` sincronizado a 10 reglas. Preparar G3 (informe del gate).

## Dependencias

- **T001** (baseline) bloquea T003/T004 (nivel de cada regla), **T005** (nº y conjunto de fixtures = enforced)
  y T006 (qué activar).
- **T005 (Red)** antes de **T006 (verde)**. T007 tras T006.
- US1 (T002–T004) y US2 (T005–T007) pueden solaparse salvo las dependencias de T001 → {T003, T004, **T005**,
  T006}.
- US3 (T008–T009) tras US1+US2. T010 al final.

## MVP y obligatoriedad

**MVP = orden de prioridad de implementación**, NO alcance de cierre: US1 (documento) + US2 (enforcement)
entregan primero el valor central. **US3 (T008–T009) es OBLIGATORIA para mergear** (H-002): FR-008, FR-009,
SC-004 y SC-005 son requisitos de cierre (no incrementales) — la feature **no** está lista para PR sin correr
los gates de front y verificar el alcance/las salvaguardas RBAC.
