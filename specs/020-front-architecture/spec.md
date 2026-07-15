# Feature Specification: Arquitectura y buenas prácticas de front (gobernanza)

**Feature Branch**: `020-front-architecture`

**Created**: 2026-07-15

**Status**: Draft

**Input**: "Formalizar la arquitectura y buenas prácticas del front (que nunca se fijaron, a diferencia del
backend hexagonal de la constitution): `docs/front-architecture.md` explicativo que codifica la estructura
YA existente y fija reglas de React, con el *porqué* de cada una, y enforced por eslint donde sea razonable.
Gobernanza/documentación + config de lint; no cambia comportamiento, contrato, RBAC ni el design system."

---

## Contexto y motivación *(no normativo)*

El backend tiene su arquitectura **codificada y gobernada** por la constitution (hexagonal, `Result/Either`,
contract-first, config fail-fast). El **front, no**: FE-1..FE-5 construyeron una estructura *de facto*
razonable (carpetas por *feature*, kit propio en `ui/`, capa `api/` con TanStack Query, tokens, i18n) pero
**nunca se documentó ni se fijaron reglas de React**, y el equipo controla menos el front. Esta feature
**formaliza lo existente** (no reescribe) con un documento **explicativo** (el *porqué* de cada convención)
y **endurece el lint** de forma **proporcionada** (Constitution XV/YAGNI) para que las convenciones se
cumplan de forma **determinista**, no por vigilancia manual.

> **Alcance sin contrato ni IA**: es una feature de **presentación/gobernanza** (documentación + config de
> lint del front). **No añade ni modifica endpoints**, por lo que se omite la sección *Contrato (OpenAPI)*;
> **no tiene componente IA**, por lo que se omite *Eval de objetivos (promptfoo/IA)*. No cambia dominio,
> contrato, RBAC ni el design system visual (eso es **FE-7 · 021-front-dual-accent**, aparte).

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Entender la arquitectura del front y su porqué (Priority: P1)

Una persona desarrolladora (que controla menos el front) abre `docs/front-architecture.md` y comprende, con
justificación, **cómo se organiza el front** (responsabilidad de cada capa y qué NO va en cada una) y **qué
reglas de React** debe seguir, de modo que pueda construir o modificar una vista sin adivinar.

**Why this priority**: es el entregable central; sin el documento explicativo no hay gobernanza ni
aprendizaje. Es lo que cierra la brecha respecto al backend.

**Independent Test**: existe `docs/front-architecture.md` y cubre (1) las capas `features/`, `ui/`, `api/`,
`i18n/`, tipos derivados del contrato — cada una con su responsabilidad y su "qué NO va aquí"; y (2) las
reglas (a)–(i) de React, **cada una con un párrafo de justificación**. Verificable por checklist de
contenido.

**Acceptance Scenarios**:

1. **Given** el repo tras la feature, **When** se abre `docs/front-architecture.md`, **Then** documenta las
   **5 capas** con responsabilidad + "qué NO va aquí" cada una.
2. **Given** ese documento, **When** se buscan las reglas de React, **Then** aparecen las **9 reglas
   (a)–(i)**, cada una con su **justificación** (el *porqué*).
3. **Given** ese documento, **When** una regla se hace cumplir por eslint, **Then** el documento indica
   **qué regla de lint** la enforce; y si una convención **no** es enforceable, se marca explícitamente como
   **recomendación** (no bloqueante).

---

### User Story 2 - El lint hace cumplir las convenciones de forma determinista (Priority: P1)

Las convenciones enforceable se **verifican por eslint**, no a mano: una violación **falla el lint**, y el
código actual **queda en verde** sin reescritura masiva.

**Why this priority**: "deterministic-first" (constitution) — el valor real es que el equipo no tenga que
vigilar; la máquina lo hace. Sin enforcement, el documento es solo intención.

**Independent Test**: con las reglas nuevas, `eslint` del front corre **en verde (0 errores)** sobre el
código actual; e introducir a propósito una violación de cada regla **enforced** produce **un error de
eslint** (test negativo).

**Acceptance Scenarios**:

1. **Given** el front actual, **When** se ejecuta `eslint` con las reglas nuevas, **Then** **0 errores**
   (regresión cero).
2. **Given** un fichero con un `export default`, **When** se ejecuta `eslint`, **Then** **error**
   (regla "sin default exports").
3. **Given** una vista que importa el cliente `api` directamente (saltándose los hooks), **When** se ejecuta
   `eslint`, **Then** **error** (límite de importación entre capas) — **o**, si esa regla no puede quedar en
   verde sin refactor amplio, está **documentada como recomendación** y **no** se declara como error.
4. **Given** un `useEffect`/`useMemo` con dependencias incompletas, **When** se ejecuta `eslint`, **Then**
   **error** (`react-hooks/exhaustive-deps` a nivel error).

---

### User Story 3 - Cero regresión y alcance acotado (Priority: P2)

El cambio **no toca** comportamiento de la app, contrato, dominio ni backend, y todos los gates de calidad
del front siguen en verde.

**Why this priority**: proporcionalidad y seguridad del cambio (XV). Una feature de gobernanza no debe
introducir riesgo funcional.

**Independent Test**: `tsc` + `eslint` + `stylelint` + `build` + `tests` del front en **verde**; y
`git diff --name-only` respecto a develop **no** contiene ficheros bajo `backend/`, `contracts/` ni de
dominio; solo `docs/` y config/artefactos del front.

**Acceptance Scenarios**:

1. **Given** la rama de la feature, **When** se corren los gates de front, **Then** todos en verde (sin
   regresión funcional ni visual).
2. **Given** el diff de la feature, **When** se listan los ficheros cambiados, **Then** **0** bajo
   `backend/`, `contracts/`, `src/domain/`.

---

### Edge Cases

- **Regla que exigiría refactor amplio**: si activar una convención como *error* marcaría muchos ficheros
  existentes (implicando reescritura amplia), **no** se fuerza como error: se **degrada a warning o
  recomendación documentada** y se justifica (proporcionalidad XV). El criterio "verde sin refactor masivo"
  manda sobre "máximo enforcement".
- **Código generado**: los tipos derivados del contrato (`src/api/generated`) están **excluidos** del lint de
  convenciones (no se reescriben; se regeneran desde el contrato).
- **Ficheros de test / mocks**: pueden requerir exenciones puntuales (como ya ocurre con `forbid-dom-props`),
  documentadas, sin relajar la regla para el código de producción.
- **Convención no mecanizable** (p. ej. "presentacional vs contenedor" es un juicio): se documenta como
  convención y solo se enforce la parte **objetivamente comprobable**; el resto queda como guía + revisión.

## Requirements *(mandatory)*

> **EARS + testeabilidad (Constitution V).** Cada FR tiene criterio pass/fail objetivo.

### Functional Requirements

- **FR-001**: THE feature SHALL entregar `docs/front-architecture.md` que documente **las 5 capas** del
  front (`features/` [auth, orders, shell], kit de componentes base `src/ui/`, capa `api/` [cliente + hooks
  TanStack Query], `i18n/`, tipos derivados del contrato en `src/api/generated`), indicando para **cada una**
  su **responsabilidad** y **qué NO va en ella**.
- **FR-002**: THE documento SHALL incluir las **9 reglas** de React (a)–(i) —(a) presentacional vs
  contenedor; (b) lógica en hooks `use*`, no en el JSX; (c) estado de servidor siempre vía TanStack Query
  con estados carga/error/vacío/sin-permiso; (d) componentes base propios en `ui/` consumiendo tokens; (e)
  "token o nada"; (f) accesibilidad WCAG 2.1 AA; (g) sin default exports; (h) RBAC en UI espejo del backend;
  (i) responsive campo↔oficina + `prefers-reduced-motion`— **cada una con su justificación** (el *porqué*).
- **FR-003**: WHEN se ejecuta `eslint` del front con las reglas nuevas sobre el código actual THE lint SHALL
  terminar con **0 errores** (sin reescritura masiva del código existente).
- **FR-004**: WHEN un fichero de producción del front contiene un `export default` THE `eslint` SHALL
  reportar **error** (regla "sin default exports", espejo de la disciplina del backend).
- **FR-005**: WHEN un `useEffect`/`useCallback`/`useMemo` declara dependencias incompletas THE `eslint` SHALL
  reportar **error** (`react-hooks/exhaustive-deps` elevado a error).
- **FR-006**: THE config de eslint SHALL incluir **al menos una** regla determinista de **límite de
  importación entre capas** (p. ej. una vista no importa el cliente `api` directamente sino vía hooks) que
  quede en **verde** sobre el código actual; SI tal regla no puede quedar en verde sin refactor amplio,
  THE documento SHALL registrarla como **recomendación no bloqueante** con su justificación (en vez de error).
- **FR-007**: WHEN una regla de convención se activa como **error** THE feature SHALL demostrar su
  enforcement con un caso negativo (una violación deliberada produce error de lint), verificable de forma
  reproducible.
- **FR-008**: THE feature SHALL **no** modificar comportamiento de la app, endpoints, contrato, dominio,
  RBAC ni el design system visual; los ficheros cambiados SHALL limitarse a `docs/` y a configuración/
  documentación del front, **sin** ficheros bajo `backend/`, `contracts/` ni `src/domain/` (verificable por
  `git diff --name-only`). Cualquier ajuste de código de front SHALL ser mínimo, localizado y justificado.
- **FR-009**: WHEN se ejecutan los gates de calidad del front (`tsc`, `eslint`, `stylelint`, `build`, tests)
  tras la feature THE resultado SHALL ser **verde** en todos (0 regresiones).

### Key Entities

- **`docs/front-architecture.md`**: documento de gobernanza del front (capas + reglas + justificaciones +
  qué regla de lint enforce cada convención). No es la fuente de verdad última (lo es la constitution); la
  refleja para el front.
- **Configuración de eslint del front** (`frontend/.eslintrc.cjs`): reglas deterministas nuevas
  (default-exports, `exhaustive-deps` como error, límite de importación entre capas) sobre las ya activas
  (`react`, `react-hooks`, `jsx-a11y` recommended + FR-017c "token o nada").

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: `docs/front-architecture.md` existe y cubre **5/5 capas** (responsabilidad + "qué NO va aquí")
  y **9/9 reglas** (a)–(i), cada regla con **≥1 párrafo de justificación**. (Checklist de contenido: 14
  ítems, todos presentes.)
- **SC-002**: `eslint` del front con las reglas nuevas devuelve **0 errores** sobre el código actual.
- **SC-003**: por **cada** regla activada como **error** (mínimo: default-exports y `exhaustive-deps`),
  existe una demostración de **test negativo** (violación deliberada ⇒ error de lint). ≥2 reglas con caso
  negativo verificado.
- **SC-004**: `tsc` + `eslint` + `stylelint` + `build` + tests del front: **5/5 en verde** (0 regresiones).
- **SC-005**: `git diff --name-only` frente a `develop`: **0** ficheros bajo `backend/`, `contracts/`,
  `src/domain/`; todos los cambios en `docs/` o `frontend/` (config/doc).

## Trazabilidad (RF → artefacto/regla → tarea → test) *(obligatorio — Constitution VI)*

> No hay endpoints (feature de front); la columna "endpoint" se sustituye por el **artefacto o regla de
> lint** que satisface el FR.

| FR | Artefacto / regla de lint | Tarea(s) | Test / verificación |
|----|---------------------------|----------|---------------------|
| FR-001 | `docs/front-architecture.md` §capas | T0xx | checklist de contenido (5 capas) |
| FR-002 | `docs/front-architecture.md` §reglas | T0xx | checklist de contenido (9 reglas + justificación) |
| FR-003 | `.eslintrc.cjs` (reglas nuevas) | T0xx | `eslint` front = 0 errores |
| FR-004 | regla no-default-export | T0xx | test negativo: `export default` ⇒ error |
| FR-005 | `react-hooks/exhaustive-deps: error` | T0xx | test negativo: deps incompletas ⇒ error |
| FR-006 | `no-restricted-imports` (límite de capa) | T0xx | verde sobre el código actual / o recomendación documentada |
| FR-007 | casos negativos de enforcement | T0xx | violación deliberada ⇒ error (reproducible) |
| FR-008 | alcance acotado | T0xx | `git diff --name-only` sin backend/contracts/domain |
| FR-009 | gates de front | T0xx | tsc/eslint/stylelint/build/tests verdes |

## Assumptions

- La estructura de front **ya es en gran medida conforme** (heredada de FE-1..FE-5); esta feature
  **documenta y endurece**, **no reescribe**. Por eso el objetivo es "verde sin refactor masivo".
- Las convenciones **ya enforced** ("token o nada" FR-017c + stylelint; `react`/`react-hooks`/`jsx-a11y`
  recommended) se **dan por base**; la feature **añade** encima (default-exports, `exhaustive-deps` como
  error, límite de importación entre capas) de forma proporcionada.
- **Qué reglas concretas** pasan a *error* frente a *recomendación documentada* se decide en `/speckit-plan`
  e `/speckit-implement` según lo que quede **en verde** sobre el código actual (criterio: no forzar
  refactor amplio). El principio rector es la **proporcionalidad** (XV).
- Se permiten **ajustes de código de front mínimos y localizados** solo si son necesarios para dejar una
  regla razonable en verde; si el ajuste fuese amplio, se **degrada la regla** a recomendación en su lugar.
- `src/api/generated` y ficheros de test/mocks pueden llevar **exenciones documentadas** de lint, sin
  relajar reglas para el código de producción.
