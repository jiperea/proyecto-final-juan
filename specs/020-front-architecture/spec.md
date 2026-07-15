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

## Clarifications

### Session 2026-07-15

- Q: ¿Qué nivel de enforcement por eslint aplicamos a las convenciones nuevas? → A: **Seguras como error +
  resto proporcionado**, **confirmado por el baseline de FR-003a** (no "incondicional" — H-015): `no-default-exports`
  y `react-hooks/exhaustive-deps` son las **candidatas prioritarias** a `enforced` y se **espera** que estén
  verdes; el **baseline** (que se aplica a **todas** las reglas candidatas por igual) confirma su nivel — si
  alguna superara el umbral (≤3 ficheros/≤10 líneas), se registra como `recomendación` con evidencia en vez de
  forzarla. El límite de importación entre capas y las convenciones no mecanizables se clasifican igual por el
  baseline. "Verde sin refactor masivo" manda. *(Baseline preliminar 2026-07-15: `no-default-exports` = **0
  violaciones** en `src` → enforced confirmado.)*
- Q: ¿Cómo demostramos que el enforcement funciona (FR-007, casos negativos)? → A: **Test-fixture de lint en
  CI** — un test versionado que corre eslint sobre snippets "malos" y asserta que producen error (reproducible
  y verificable en CI).
- Q: ¿Puede la feature modificar código de producción del front existente? → A: **Solo fixes mínimos y
  localizados** para dejar una regla razonable en verde; si exigiera refactor amplio, se **degrada la regla**
  a recomendación (proporcionalidad XV).

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
**10 reglas candidatas (a)–(j)** ((a)–(i) de React + (j) límite de importación entre capas), **cada una con
un párrafo de justificación**. Verificable por checklist de contenido.

**Acceptance Scenarios**:

1. **Given** el repo tras la feature, **When** se abre `docs/front-architecture.md`, **Then** documenta las
   **5 capas** con responsabilidad + "qué NO va aquí" cada una.
2. **Given** ese documento, **When** se buscan las reglas, **Then** aparecen las **10 reglas candidatas
   (a)–(j)** (las 9 de React + el límite de importación entre capas), cada una con su **nivel** y su
   **justificación** (el *porqué*).
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
dominio; los cambios se limitan a `docs/`, config de lint, tests de fixture y **fixes de código de producción
mínimos dentro del umbral de FR-008/FR-003b** (≤3 ficheros/≤10 líneas por regla, ≤6/≤20 en agregado) — sin
alterar lógica RBAC (FR-008a). *(Coherente con SC-005 — T-005.)*

**Acceptance Scenarios**:

1. **Given** la rama de la feature, **When** se corren los gates de front, **Then** todos en verde (sin
   regresión funcional ni visual).
2. **Given** el diff de la feature, **When** se listan los ficheros cambiados, **Then** **0** bajo
   `backend/`, `contracts/`, `src/domain/`.

---

### Edge Cases

- **Regla que exigiría refactor amplio**: si activar una convención como *error* exigiera cambiar **>3
  ficheros de producción o >10 líneas** en total (umbral de FR-003a/FR-008), **no** se fuerza como error: se
  **degrada a `recomendación` documentada** con el conteo del baseline como evidencia (proporcionalidad XV).
  El criterio "verde sin refactor masivo" manda sobre "máximo enforcement", pero el corte es **numérico y
  reproducible**, no un juicio.
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
  (i) responsive campo↔oficina + `prefers-reduced-motion`— **más la regla (j)** = límite de importación entre
  capas (FR-006). Las **10 reglas candidatas (a)–(j)** se documentan **cada una con su justificación** en
  prosa (el *porqué*), con el mismo rigor (H-030/T-001).
- **FR-002a** *(clasificación — H-006; conteo sincronizado a 10 — H-030/T-001)*: THE documento SHALL etiquetar
  **cada una** de las **10 reglas candidatas (a)–(j)** con **exactamente uno** de estos niveles:
  **`enforced`** (regla de eslint que da error), **`recomendación`** (documentada, no bloqueante) o **`guía`**
  (no mecanizable, sujeta a revisión humana). El checklist de contenido (SC-001) verifica que las **10 reglas**
  tienen nivel asignado y justificación.
- **FR-002b** *(regla (h), seguridad — S-001)*: THE justificación de la regla (h) "RBAC en UI espejo del
  backend" SHALL declarar **explícitamente** que la UI **NUNCA** es la fuente de autorización: el backend es
  el **único** que autoriza (rol + `assigned_to` + estado de origen) y **rechaza aunque se fuerce la
  petición** (Constitution IV); ocultar/deshabilitar un control en la UI es **UX, no un control de
  seguridad**.
- **FR-002c** *(regla (c), seguridad — S-002, S-004, H-011)*: THE justificación de la regla (c) SHALL exigir
  que los hooks de datos **reflejen el código que el backend envía**, distinguiendo **401** (sesión
  caducada/revocada → reautenticar), **403** (autenticado sin permiso → estado "sin permiso") y **404** (no
  encontrado), en lugar de un genérico "sin-permiso" que los mezcle. **Excepción de anti-enumeración por
  recurso (OBLIGATORIA)**: la decisión de **enmascarar existencia** es del **backend**, no de la UI — para
  lecturas/mutaciones de un **recurso concreto** (p. ej. detalle de una orden, reasignar/revisar por
  `orderId`) el backend puede devolver **404 en vez de 403** para no confirmar que el recurso existe; en esos
  casos **el front respeta el 404 tal cual y NO reconstruye un estado 403 distinto**. Es decir: se distingue
  403 de 404 **solo donde el backend los distingue** (p. ej. listado por rol), nunca "corrigiendo" el 404 de
  enmascaramiento. El documento SHALL citar el patrón ya implementado en `OrderDetailView`/`useOrderMutations`
  (403 plegado en 404) como el comportamiento correcto a preservar.
- **FR-003**: WHEN se ejecuta `eslint` del front con las reglas nuevas sobre el código actual THE lint SHALL
  terminar con **0 errores** (sin reescritura masiva del código existente).
- **FR-003a** *(baseline determinista — H-003; hace falsable a H-001; resuelve H-015)*: ANTES de fijar el
  nivel de **cada** regla candidata —**incluidas** las "seguras" `no-default-exports` y
  `react-hooks/exhaustive-deps`, sin excepción—, THE feature SHALL ejecutar un **baseline**: correr esa regla
  contra el código actual y
  **contar** ficheros de producción con violación y líneas a cambiar. **Método de conteo (T-001, único y
  determinista)**: se aplica el fix (manual o `eslint --fix`) y se mide con **`git diff --numstat`** sobre ese
  diff: "**líneas**" = **añadidas + eliminadas** (suma de las dos columnas de numstat) y "**ficheros**" =
  ficheros de producción con ≥1 línea en numstat (excluye `src/api/generated`, tests y fixtures). La
  clasificación es **determinista**:
  la regla se activa como **`enforced`** (error) **si y solo si** el código ya está verde **o** queda verde
  con **≤3 ficheros de producción y ≤10 líneas** cambiadas en total; **si excede ese umbral**, se registra
  como **`recomendación`** en el documento (con el conteo del baseline como evidencia). El resultado del
  baseline (conteo por regla) SHALL quedar registrado **en `docs/front-architecture.md`** (artefacto
  versionado; sobrevive a squash-merge — H-014), no solo en el mensaje de commit, para que la decisión sea
  **reproducible y auditable** en cualquier momento futuro. **Reversión de la medición (H-026)**: los fixes
  aplicados **solo para medir** una regla que acaba **degradada** a `recomendación` SHALL **revertirse**
  (`git checkout` de ese diff); solo persisten en el código los fixes de reglas que quedan `enforced`.
  **Medición secuencial y aislada (H-031)**: cada regla se mide **de una en una sobre base limpia**
  (revertir por completo antes de medir la siguiente, en el orden canónico (a)–(j)); una vez decidido el
  conjunto `enforced`, sus fixes se aplican **una sola vez al final** sobre la base limpia — así ningún
  `git checkout` de una regla degradada borra el fix de otra que quedó `enforced`.
- **FR-003b** *(tope agregado — H-013)*: ADEMÁS del umbral por regla, el **total** de código de producción
  tocado por TODA la feature SHALL ser **≤6 ficheros y ≤20 líneas** en agregado, medido sobre el **diff final
  deduplicado** de la rama frente a `develop` (`git diff --numstat develop -- frontend/src`, excluyendo
  generated/tests/fixtures) — un fichero tocado por dos reglas **cuenta una sola vez** (no doble conteo —
  H-024). SI la suma de fixes "mínimos
  por regla" excediera ese techo, se **degradan reglas a `recomendación`** en **orden determinista**: primero
  la de **mayor coste marginal** (más líneas a cambiar; empate → más ficheros; empate → **orden inverso** del
  **orden canónico de reglas candidatas** = `(a)…(i)` de FR-002 **seguido del límite de importación entre
  capas de FR-006 como posición (j)** — H-021), y se repite hasta cumplir el techo. Así el conjunto final de
  reglas `enforced` es **único y reproducible** (no queda a criterio de quién implemente). Este mismo orden
  canónico (a)…(j) rige cualquier desempate de degradación en la feature (incluido el de FR-005a/H-019).
- **FR-004**: WHEN un fichero de producción del front contiene un `export default` THE `eslint` SHALL
  reportar **error** (regla "sin default exports", espejo de la disciplina del backend). *(Baseline: **0**
  violaciones actuales → `enforced` confirmado sin tocar código.)*
- **FR-005**: WHILE la regla quede clasificada `enforced` por el baseline (FR-003a) — se espera que sí —,
  WHEN un `useEffect`/`useCallback`/`useMemo` declara dependencias incompletas THE `eslint` SHALL reportar
  **error** (`react-hooks/exhaustive-deps` elevado de `warn` a `error`); si el baseline la superara, se
  degrada a `recomendación` (H-015) en vez de forzar refactor.
- **FR-005a** *(escape controlado — H-007)*: WHERE el código actual tenga un caso legítimo que requiera
  `eslint-disable-next-line` para una regla `enforced` (p. ej. una dependencia intencionalmente estable),
  THE excepción SHALL llevar un **comentario justificativo en la misma línea** y quedar registrada. **Criterio
  de "justificativo" (T-002, pass/fail)**: el comentario usa la sintaxis `// eslint-disable-next-line <regla>
  -- <razón>` donde `<razón>` tiene **≥15 caracteres** y **nombra la causa concreta** (p. ej. "ref estable
  intencional; añadirla re-suscribiría"), no un relleno tipo "ok"/"disable". El número total de
  `eslint-disable` de reglas de esta feature SHALL ser **≤3** (por encima de ese conteo, la regla se considera
  no aplicable en verde y se degrada a `recomendación` en vez de sembrar exenciones).
  **Prioridad del cupo (H-016)**: los `eslint-disable` de casos **RBAC-sensibles** (FR-008a) tienen
  **preferencia** sobre los genéricos; si el cupo de ≤3 se contendiera, se **cede primero un disable
  genérico** (esa regla genérica se degrada a `recomendación`) antes que sacrificar un caso RBAC — nunca se
  degrada una regla por haber gastado el cupo en exenciones de menor criticidad. **Contención RBAC-vs-RBAC
  (H-019)**: si el cupo ≤3 se agota **solo** con casos RBAC-sensibles y aparece otro, se degrada la regla en
  el **mismo orden determinista de FR-003b** (mayor coste marginal → empate ficheros → empate orden inverso
  (a)–(i)), de modo que el resultado sea reproducible y no arbitrario.
- **FR-006**: THE config de eslint SHALL incluir una regla determinista de **límite de importación entre
  capas** (p. ej. una vista no importa el cliente `api` directamente sino vía hooks). Su nivel (`enforced`
  vs `recomendación`) lo decide el **baseline de FR-003a** con su umbral numérico (no queda a juicio): si el
  baseline la deja `enforced`, FR-007 exige su fixture negativo; si la deja `recomendación`, el documento
  registra el conteo del baseline que lo justifica. (Así el requisito es **falsable**: un baseline que
  muestre ≤3 ficheros/≤10 líneas y NO active la regla como error sería un fallo del requisito.)
- **FR-007** *(FR-007↔SC-003 atados al nº de reglas enforced — cierra H-002)*: THE feature SHALL incluir un
  **test-fixture de lint versionado y ejecutable en CI** que, por **cada** regla activada como **`enforced`**
  (error) —el conjunto exacto lo fija el baseline de FR-003a—, corra eslint sobre un snippet "malo" y
  **asserte que produce error**; el test SHALL pasar (confirma que las violaciones se detectan). El nº de
  fixtures negativos SHALL **igualar** el nº de reglas `enforced` nuevas (no un "≥2" fijo).
- **FR-007a** *(aislamiento del fixture — H-004)*: THE snippets "malos" SHALL vivir en un directorio dedicado
  (`frontend/tests/lint-fixtures/**` o equivalente) **excluido del run principal de eslint** mediante un glob
  **acotado a ese único directorio**; el test los lintará de forma **programática** (API de ESLint). La
  exclusión SHALL **no** cubrir ninguna ruta de código de producción (verificable: el patrón de exclusión
  nombra solo el directorio de fixtures).
- **FR-008**: THE feature SHALL **no** modificar comportamiento de la app, endpoints, contrato, dominio,
  RBAC ni el design system visual; los ficheros cambiados SHALL limitarse a `docs/` y a configuración/
  documentación del front, **sin** ficheros bajo `backend/`, `contracts/` ni `src/domain/` (verificable por
  `git diff --name-only`). Cualquier ajuste de código de producción del front SHALL ser **mínimo y
  localizado**, con el **mismo umbral** que FR-003a: **≤3 ficheros de producción y ≤10 líneas** por regla; si
  se excediera para una regla, se **degrada la regla a `recomendación`** en vez de tocar más código (T-002).
- **FR-008a** *(invariante conservador RBAC — S-001..S-005, H-012/H-020/H-022/H-023/H-025/H-027; sustituye la
  maquinaria de snapshot por proporcionalidad XV)*: THE feature SHALL **no modificar la lógica de control de
  acceso** (visibilidad/guardas por rol) de ningún fichero. El baseline (`docs/front-architecture.md`) SHALL
  incluir un **inventario** de los ficheros RBAC-sensibles conocidos (route guards, render condicional por
  permiso, hooks/componentes con lógica de rol o estado — p. ej. `OrderDetailView`, `useOrderMutations`, la
  guarda de rutas), con **regla fail-safe**: ante la duda, un fichero se trata como RBAC-sensible.
  **Complemento objetivo del inventario (S-004)**: además del inventario curado, se corre un **grep sobre el
  diff final** de patrones RBAC (`role`, `assignedTo`, `status`, `permission`, `useAuth`/`useSession`); si el
  diff toca una línea con esos patrones en un fichero **no** listado, se **detiene** y se reclasifica ese
  fichero como RBAC-sensible (el fail-safe deja de depender solo del juicio humano). **El grep es una red de
  seguridad complementaria (S-006), no el criterio primario**: el criterio suficiente es el **nodo AST**
  (H-032), que trata el `CallExpression` completo de un `useEffect` (cuerpo + array de dependencias) como un
  solo nodo — así un `--fix` que solo toque las deps de un efecto con lógica de rol/sesión en su cuerpo queda
  cubierto por el freeze aunque la línea del diff no contenga los patrones grep. WHEN una regla
  `enforced` marcaría una **línea de lógica RBAC**, el fix SHALL **NO** alterar esa lógica; en su lugar se
  aplica un `eslint-disable-next-line` justificado (line-level, contado contra el cupo ≤3 de FR-005a) **o** se
  degrada la regla — nunca se cambia el comportamiento de acceso. **Criterio de "línea de lógica RBAC"
  (H-032/T-002)**: una línea es RBAC si su **nodo AST** contiene un chequeo de `role`/`assignedTo`/`status`/
  `permission` o llamada a `useAuth`/`useSession`; si en el **mismo nodo** se mezcla el chequeo de rol con
  código no relacionado, se trata **todo el nodo** como RBAC (fail-safe → freeze). **Alcance del "freeze"
  (H-027)**: solo las líneas/nodos de lógica RBAC; una violación **no relacionada** en otra parte del fichero
  (otro nodo, p. ej. un `export default`) **sí** puede corregirse con normalidad. Como **no se modifica lógica
  RBAC**, no hace falta snapshot de tests ni prueba de cobertura; los tests de vista por rol existentes SHALL
  permanecer **verdes**. Cada `eslint-disable` sobre lógica RBAC SHALL quedar registrado como nota en
  `docs/front-architecture.md`.
- **FR-009**: WHEN se ejecutan los gates de calidad del front (`tsc`, `eslint`, `stylelint`, `build`, tests)
  tras la feature THE resultado SHALL ser **verde** en todos (0 regresiones).
- **FR-010** *(sincronía doc↔config — H-009)*: THE feature SHALL incluir una comprobación (test o ítem de
  checklist verificable) de que **cada** regla que el documento etiqueta como **`enforced`** existe realmente
  y **como error** en `.eslintrc.cjs`, evitando que documento y config diverjan.

### Key Entities

- **`docs/front-architecture.md`**: documento de gobernanza del front (capas + reglas + justificaciones +
  qué regla de lint enforce cada convención). No es la fuente de verdad última (lo es la constitution); la
  refleja para el front.
- **Configuración de eslint del front** (`frontend/.eslintrc.cjs`): reglas deterministas nuevas cuyo **nivel
  final lo fija el baseline** (FR-003a) — `no-default-exports` (baseline: 0 → `enforced`),
  `react-hooks/exhaustive-deps` (esperado `enforced`) y **límite de importación entre capas** (`enforced` **si
  el baseline lo confirma**, si no `recomendación` — H-018) — sobre las ya activas (`react`, `react-hooks`,
  `jsx-a11y` recommended + FR-017c "token o nada").

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: `docs/front-architecture.md` existe y cubre **5/5 capas** (responsabilidad + "qué NO va aquí")
  y **las 10 reglas candidatas** = (a)–(i) **+ (j) límite de importación entre capas** (H-028), cada una con
  (i) un **nivel** asignado (`enforced`/`recomendación`/`guía`, FR-002a) y (ii) una **justificación de ≥2
  oraciones Y ≥30 palabras** (ambas condiciones) que explique el porqué o el trade-off (no vale una
  frase-etiqueta); y, para toda regla **degradada**, la **evidencia de baseline** (conteo). (Checklist de
  contenido: 5 capas + 10 reglas × [nivel + justificación] = todos los ítems presentes.)
- **SC-002**: `eslint` del front con las reglas nuevas devuelve **0 errores** sobre el código actual, con
  **≤3** `eslint-disable` justificados en total (FR-005a) y el **baseline de FR-003a registrado**.
- **SC-003**: existe un **test-fixture de lint en CI** con un caso negativo por **cada** regla `enforced`
  nueva. El **conjunto `enforced` lo fija el baseline registrado** (FR-003a), no una lista fija: es **≥1**
  (`no-default-exports` está confirmado verde → enforced) y se espera que incluya `react-hooks/exhaustive-deps`;
  el **nº de casos negativos = nº de reglas `enforced` nuevas** (coherente con lo que el baseline decida, sin
  exigir una regla como "mínimo" que el baseline pudiera degradar). El test **pasa** (todas las violaciones se
  detectan) y el directorio de fixtures es el **único** excluido del run principal (FR-007a).
- **SC-004**: `tsc` + `eslint` + `stylelint` + `build` + tests del front: **5/5 en verde** (0 regresiones);
  y si algún fix mínimo tocó un fichero RBAC-sensible, sus tests de vista por rol siguen verdes (FR-008a).
- **SC-005** *(reformulado para permitir fixes mínimos de código — cierra H-005)*: `git diff --name-only`
  frente a `develop`: **0** ficheros bajo `backend/`, `contracts/`, `src/domain/`. Los cambios se limitan a
  `docs/` y `frontend/` (documentación + config de lint + tests de fixture + **fixes de código de producción
  mínimos** dentro del umbral de FR-008: ≤3 ficheros/≤10 líneas por regla y **≤6 ficheros/≤20 líneas en
  agregado**, FR-003b).
- **SC-006** *(sincronía doc↔config — FR-010)*: por **cada** regla etiquetada `enforced` en el documento,
  una comprobación confirma que existe como **error** en `.eslintrc.cjs` (0 divergencias doc↔config).

## Trazabilidad (RF → artefacto/regla → tarea → test) *(obligatorio — Constitution VI)*

> No hay endpoints (feature de front); la columna "endpoint" se sustituye por el **artefacto o regla de
> lint** que satisface el FR.

| FR | Artefacto / regla de lint | Tarea(s) | Test / verificación |
|----|---------------------------|----------|---------------------|
| FR-001 | `docs/front-architecture.md` §capas | T002 | checklist de contenido (5 capas) |
| FR-002 | `docs/front-architecture.md` §reglas | T003 | checklist de contenido (10 reglas (a)–(j) + justificación) |
| FR-002a | doc: nivel por regla | T001, T003 | checklist: 10/10 reglas (a)–(j) con nivel enforced/recomendación/guía |
| FR-002b | doc: justif. regla (h) | T003 | checklist: cita "UI nunca autoriza; backend único (Const. IV)" |
| FR-002c | doc: justif. regla (c) | T003 | checklist: distingue 401/403/404 + anti-enumeración |
| FR-003 | `.eslintrc.cjs` (reglas nuevas) | T006, T008 | `eslint` front = 0 errores |
| FR-003a | baseline registrado en el doc | T001, T004 | conteo por regla (ficheros/líneas) en `front-architecture.md` |
| FR-003b | tope agregado | T001, T008 | total ≤6 ficheros/≤20 líneas en el diff dedup de la feature |
| FR-004 | regla no-default-export | T005, T006 | test negativo: `export default` ⇒ error |
| FR-005 | `react-hooks/exhaustive-deps: error` | T005, T006 | test negativo: deps incompletas ⇒ error |
| FR-005a | `eslint-disable` ≤3 justificados | T004, T007 | conteo ≤3 + formato `-- <razón>` ≥15 chars + prioridad RBAC |
| FR-006 | `no-restricted-imports` (límite de capa) | T001, T006 | nivel decidido por baseline (falsable) |
| FR-007 | fixtures negativos en CI | T005, T006 | nº fixtures = nº reglas enforced; test pasa |
| FR-007a | aislamiento del fixture | T005 | exclusión = solo dir de fixtures; lint programático |
| FR-008 | alcance acotado + umbral | T008, T009 | `git diff` sin backend/contracts/domain; ≤3 fich/≤10 líneas por regla |
| FR-008a | no regresión RBAC (grep + AST + tests rol) | T004, T008 | grep RBAC sobre diff final + tests de vista por rol verdes |
| FR-009 | gates de front | T008 | tsc/eslint/stylelint/build/tests verdes |
| FR-010 | sincronía doc↔config | T007 | cada regla `enforced` del doc existe como error en `.eslintrc.cjs` |

## Assumptions

- La estructura de front **ya es en gran medida conforme** (heredada de FE-1..FE-5); esta feature
  **documenta y endurece**, **no reescribe**. Por eso el objetivo es "verde sin refactor masivo".
- Las convenciones **ya enforced** ("token o nada" FR-017c + stylelint; `react`/`react-hooks`/`jsx-a11y`
  recommended) se **dan por base**; la feature **añade** encima reglas candidatas de forma proporcionada.
- **Reglas decididas (Clarifications 2026-07-15) — TODAS sujetas al baseline de FR-003a (H-017)**:
  `no-default-exports` y `react-hooks/exhaustive-deps` son **candidatas prioritarias** a `enforced` y se
  **espera** que estén verdes (no "incondicional"); el **baseline confirma** su nivel igual que para el límite
  de importación entre capas — si alguna superara el umbral, se registra como `recomendación`. Las
  convenciones **no mecanizables** quedan como guía. Criterio rector: **verde con ≤3 ficheros/≤10 líneas por
  regla** (proporcionalidad XV). *(Baseline preliminar: `no-default-exports` = 0 violaciones → `enforced`.)*
- **Umbral (Clarifications 2026-07-15)**: se permiten **ajustes de código de producción mínimos y
  localizados** (**≤3 ficheros y ≤10 líneas por regla**) solo si dejan una regla razonable en verde; si el
  ajuste excediera el umbral, se **degrada la regla** a `recomendación`. Los `eslint-disable` se limitan a
  **≤3** y se justifican en línea (FR-005a).
- `src/api/generated` y ficheros de test/mocks/fixtures pueden llevar **exenciones documentadas** de lint,
  sin relajar reglas para el código de producción; el directorio de fixtures de lint es el **único** excluido
  del run principal (FR-007a).
- **Cobertura de ramas de rol (S-005, seguimiento no bloqueante)**: el baseline anota si los tests de vista
  por rol existentes cubren las ramas de autorización de los ficheros del inventario; los huecos se registran
  como **deuda**. No bloquea G1 porque, por el invariante conservador de FR-008a, la feature **no modifica**
  lógica RBAC (no hay comportamiento nuevo que regresar); el riesgo se mitiga además con el diff diminuto
  (≤6 ficheros/≤20 líneas) revisable línea a línea en PR.
- **Coordinación con 021-front-dual-accent (H-008, H-029)**: 021 (siguiente feature de front) puede tocar los
  mismos ficheros de componentes. Se asume **orden de merge 020→021** (020 primero); 021 saldrá de un
  `develop` que ya incluya los fixes/reglas de 020, evitando que revierta un fix mínimo (p. ej. reintroducir
  un `export default`). Si 021 se solapara, hará rebase sobre 020. **Es una garantía de proceso/roadmap
  (orden de merge + rama protegida), NO verificable por los gates de 020** (que terminan al mergear 020) — se
  acepta como riesgo residual documentado; mitigado además porque 021 correrá el mismo `eslint` con las reglas
  ya en `develop`, que reportaría la reintroducción.
- **Conjunto de reglas (a)–(i) — cerrado para esta feature (H-010)**: (a)–(i) es el conjunto **acordado**
  para cerrar la brecha inicial con el backend, **no** exhaustivo. Convenciones adicionales que surjan
  (error boundaries, memoización de listas, composición de contexto, best practices de testing-library) se
  registran como **deuda** para una feature futura, no reabren esta. El documento lo declara explícitamente.
