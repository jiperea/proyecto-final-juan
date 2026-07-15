# Implementation Plan: Arquitectura y buenas prácticas de front (FE-6)

**Branch**: `020-front-architecture` | **Date**: 2026-07-15 | **Spec**: [spec.md](./spec.md)

**Input**: `specs/020-front-architecture/spec.md`

## Summary

Formalizar la arquitectura de front **ya existente** en un documento **explicativo** (`docs/front-architecture.md`)
y **endurecer eslint** de forma **proporcionada** (Constitution XV), clasificando las **10 reglas candidatas
(a)–(j)** por un **baseline determinista** (umbral ≤3 ficheros/≤10 líneas por regla; ≤6/≤20 agregado). Un
**test-fixture de lint en CI** demuestra el enforcement de cada regla `enforced`. **Invariante conservador:**
no se modifica lógica de control de acceso; no se toca contrato/dominio/backend ni el design system visual.

> **Sin research/data-model/contracts** — feature de **gobernanza/presentación sin endpoints ni IA** (igual
> que FE-5/017). No hay Phase 0 (nada que investigar: el stack de front ya está fijado) ni Phase 1 de
> contratos/entidades. El único "diseño" es el baseline (que se ejecuta en implement) y el contenido del doc.

## Technical Context

**Language/Version**: TypeScript 5 strict · React 18 + Vite (frontend existente).

**Primary Dependencies**: eslint 8 (`.eslintrc.cjs` legacy) con `@typescript-eslint`, `eslint-plugin-react`,
`react-hooks`, `jsx-a11y` (ya instalados) + stylelint; TanStack Query, react-router-dom (ya en uso). Test:
Vitest + Testing Library + vitest-axe (ya en uso); la API programática de ESLint para el test-fixture.

**Storage**: N/A. **Target Platform**: navegador (SPA). **Project Type**: web app (solo la mitad `frontend/`).

**Testing**: Vitest (unit) para el test-fixture de lint; los gates de front existentes (`tsc`, `eslint`,
`stylelint`, `build`, `vitest`) como no-regresión.

**Performance/Scale**: N/A (documentación + config). **Scope**: 1 documento nuevo, edición de
`frontend/.eslintrc.cjs`, 1 test-fixture, y **fixes de producción mínimos** (≤6 ficheros/≤20 líneas agregado)
solo si el baseline los exige — se **espera 0** (baseline preliminar: `no-default-exports` = 0 violaciones).

## Constitution Check

*GATE: 0 casillas sin resolver. Las N/A llevan justificación; ninguna afecta a seguridad.*

### Gate · Contract-First (Principio II) — **N/A justificado**

- [x] **N/A**: la feature **no añade ni modifica endpoints** (gobernanza de front). Sin `contracts/*.yaml`,
  sin Zod nuevo, sin contract tests. Los tipos de UI existentes siguen derivándose del contrato ya congelado.

### Gate · RBAC y seguridad (Principios IV, IX, XI) — **N/A por diseño (invariante conservador)**

- [x] **N/A**: la feature **no modifica lógica de control de acceso** (FR-008a): no toca backend, ni las
  guardas/visibilidad por rol del front. El documento **refuerza** la doctrina de seguridad (regla (h): la UI
  nunca autoriza, backend único, Const. IV; regla (c): 401/403/404 + anti-enumeración). Sin PII, sin
  auditoría nueva. Verificado por el gate `revisor-rbac-seguridad` en G1 (APROBADA).

### Gate · Arquitectura Hexagonal (Principio III) — **N/A**

- [x] **N/A**: feature de **frontend**; no toca `backend/domain|handlers|infra`. Documenta la disciplina de
  capas *del front* (features/ · ui/ · api/), espejo conceptual del back, sin alterar el backend.

### Gate · Calidad y verificación (Principios V, VI, VII, XIII, XIV)

- [x] FRs en **EARS** con criterio pass/fail; trazabilidad **RF→artefacto/regla→tarea→test** en la spec
  (columna "endpoint" sustituida por artefacto/regla, al no haber endpoints).
- [x] **TDD (fase Red)**: el **test-fixture de lint** se escribe primero en rojo (una violación debe fallar)
  y se pone en verde al activar la regla; cobertura no aplica al modo clásico de dominio (no hay dominio),
  se mide por "0 errores + fixtures que detectan violaciones".
- [x] **SC medibles** por herramienta determinista (`eslint`/`git diff --numstat`/checklist de contenido);
  **sin promptfoo** (no hay componente IA ni Success Criteria de IA). Gates adversariales **G1 (PASS) / G2 /
  G3** previstos con 0 bloqueantes.

**Resultado**: PASS (3 gates N/A justificados sin afectar seguridad; el gate de calidad aplica y se cumple).

## Project Structure

### Documentation (this feature)

```text
specs/020-front-architecture/
├── spec.md              # ✅ (con Clarifications)
├── plan.md              # este fichero
├── tasks.md             # /speckit-tasks (siguiente)
├── checklists/          # requirements.md (✅)
└── gates/               # gate-G1-020.md (✅ PASS)
# sin research.md / data-model.md / contracts/ — no aplican (ver Summary)
```

### Source Code (repository root) — solo `frontend/` + `docs/`

```text
docs/
└── front-architecture.md     # NUEVO — documento explicativo (5 capas + 10 reglas (a)–(j) + baseline)

frontend/
├── .eslintrc.cjs             # EDITADO — reglas nuevas según baseline (enforced/recomendación)
├── src/                      # SOLO si el baseline exige fixes mínimos (≤6 fich/≤20 líneas); se espera 0
└── tests/
    └── lint-fixtures/        # NUEVO — snippets "malos" + test que corre ESLint programático (fase Red)
```

**Structure Decision**: intervención acotada a `docs/` (el documento) y `frontend/` (config de lint + test
de fixture, y fixes mínimos solo si el baseline los exige). **Cero** ficheros bajo `backend/`, `contracts/`,
`src/domain/` (SC-005, verificable por `git diff --name-only`).

## Complexity Tracking

| Punto | Nota |
|-------|------|
| Spec detallada vs implementación pequeña | La spec quedó muy detallada tras un G1 de 8 pases (ver memoria `gate-remediation-spiral`); la **implementación real es mínima** (1 doc + reglas eslint + 1 fixture, fixes esperados = 0). Se aplica proporcionalidad (XV) en tasks/implement: no añadir maquinaria más allá de lo que los FR exigen; preferir simplificar. |
| `eslint.config.mjs` raíz vs `.eslintrc.cjs` de front | El baseline se corre con la config **del front** (`frontend/.eslintrc.cjs`), no la flat-config raíz (que dio `ERR_MODULE_NOT_FOUND` al invocarla desde `frontend/`). Tarea de implement: usar `npm run lint` del front. |
