# Feature Specification: Doble token de acento — fidelidad con el artifact (FE-7)

**Feature Branch**: `021-front-dual-accent`

**Created**: 2026-07-15

**Status**: Draft

**Input**: "Recuperar el naranja vivo del artifact de exploración (`#DC5A24`) donde no lleva texto, y mantener
un acento accesible en botones (texto blanco). Máxima fidelidad visual **sin romper WCAG AA**. Verificación
visual con Playwright MCP en claro y oscuro. Solo presentación (tokens/componentes base); no amplía alcance."

---

## Contexto y motivación *(no normativo)*

El reskin FE-5 (017) oscureció el acento a `--color-primary: #c2410c` (claro) para cumplir **AA 4.5:1** con
texto blanco en botones. Eso apagó el look respecto al artifact de exploración
(`docs/design-exploration/artifact-69806069.html`), cuyo acento es `#DC5A24` (claro) / `#FF7A45` (oscuro) —
más vivo, pero que **falla 4.5:1 con texto blanco** (≈3.4:1). La solución es un **doble token**: usar el
naranja **vivo** en superficies **sin texto encima** (donde basta **3:1** — componentes de UI, foco, marca,
indicadores, bordes/acentos decorativos) y mantener el acento **accesible** (`--color-primary`) donde hay
**texto** (botones con texto blanco, texto de acento pequeño). Así se recupera la fidelidad **sin bajar de AA**.

> **Alcance sin contrato ni IA**: es **presentación** (tokens + su consumo en `frontend/src/ui/`). No añade
> endpoints ni IA → se omiten *Contrato* y *Eval de objetivos*. Respeta el design system y
> `docs/front-architecture.md` (FE-6): token o nada, componentes base propios, sin estilos sueltos.

---

## Clarifications

### Session 2026-07-15

- Q (implícita del brief): ¿el acento vivo puede llevar texto blanco encima? → A: **No.** El vivo
  (`#DC5A24`/`#FF7A45`) solo se usa donde NO hay texto encima (o texto grande ≥18.66px/≥24px, o componente de
  UI), donde WCAG exige **≥3:1**. Donde hay texto blanco o texto pequeño de acento, se usa `--color-primary`
  (≥4.5:1). Regla dura verificada por test de contraste.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — El acento se ve como el artifact, en claro y oscuro (Priority: P1)

Una persona usuaria abre la app y percibe el **naranja vivo** del artifact en la marca, el foco, el paso
actual del Stepper y los acentos decorativos, en **tema claro y oscuro**, manteniéndose todo legible.

**Why this priority**: es el objetivo de la feature — cerrar la brecha estética con el artifact.

**Independent Test**: existe `--color-accent-vivid` (claro `#DC5A24` / oscuro `#FF7A45`) y las superficies
designadas lo consumen; capturas con Playwright MCP en claro/oscuro muestran el acento vivo en esas
superficies. Verificable por token + captura.

**Acceptance Scenarios**:

1. **Given** el tema claro, **When** se inspeccionan las superficies de acento sin texto (marca, foco, paso
   actual del Stepper, borde de fila seleccionada), **Then** usan `--color-accent-vivid` = `#DC5A24`.
2. **Given** el tema oscuro, **Then** esas superficies usan `#FF7A45`.
3. **Given** cualquier tema, **When** se inspecciona un botón primario (texto blanco), **Then** su fondo sigue
   siendo `--color-primary` (accesible), **no** el vivo.

### User Story 2 — Sigue cumpliendo WCAG AA en ambos temas (Priority: P1)

El cambio no introduce ninguna combinación por debajo de su umbral WCAG.

**Why this priority**: requisito duro; recuperar fidelidad **no** puede degradar accesibilidad.

**Independent Test**: el test determinista de contraste pasa: cada par texto/fondo ≥**4.5:1**; cada uso del
vivo (componente/gráfico/foco) vs su fondo adyacente ≥**3:1**; en **claro y oscuro**. 0 violaciones.

**Acceptance Scenarios**:

1. **Given** el token vivo sobre su fondo (superficie/ground), **When** se mide el ratio, **Then** ≥**3:1**
   en ambos temas.
2. **Given** los pares de texto existentes, **When** se re-mide, **Then** siguen ≥**4.5:1** (sin regresión).
3. **Given** las pantallas, **When** corre axe, **Then** **0** violaciones serias/críticas por pantalla y tema.

### User Story 3 — Cero regresión y alcance acotado (Priority: P2)

**Independent Test**: `tsc`/`eslint`/`stylelint`/`build`/`vitest` del front en verde; `git diff --name-only`
solo bajo `frontend/src/ui/` y `docs/design-system.md`; **0** ficheros bajo `backend/`, `contracts/`,
`src/domain/`, y sin tocar lógica (solo estilos/tokens).

**Acceptance Scenarios**:

1. **Given** la rama, **When** corren los gates de front, **Then** todos verdes (sin regresión funcional/visual).
2. **Given** el diff, **Then** 0 ficheros fuera de `frontend/src/ui/` + `docs/design-system.md` (+ tests).

### Edge Cases

- **Vivo con texto**: si una superficie que usa el vivo tuviera que llevar texto, se usa `--color-primary`
  (accesible) o un `on-vivid` con ≥4.5:1; **nunca** texto blanco pequeño sobre el vivo.
- **Foco**: el anillo de foco usa el vivo (≥3:1 vs adyacente) y **no** sustituye al indicador de foco visible.
- **Tema oscuro**: el vivo oscuro `#FF7A45` sobre `ground`/`surface` oscuros debe cumplir ≥3:1 (verificado).
- **prefers-reduced-motion / responsive**: sin cambios; se preservan.

## Requirements *(mandatory)*

- **FR-001**: THE design system SHALL definir un token `--color-accent-vivid` (y, si hace falta, su variante
  hover) con valor **`#DC5A24`** en claro y **`#FF7A45`** en oscuro, en `frontend/src/ui/tokens.css`
  (los 4 bloques de tema: `:root`, `@media dark`, `[data-theme=dark]`, `[data-theme=light]`).
- **FR-002**: THE feature SHALL aplicar `--color-accent-vivid` **solo** a superficies **sin texto encima**
  (o texto grande / componente de UI, umbral **≥3:1**): al menos la **marca** (`.mark`/logo), el **anillo de
  foco** (`:focus-visible`), el **indicador del paso actual** del Stepper, y el **borde/acento de selección**
  (p. ej. fila seleccionada). Todo vía tokens/componentes de `src/ui/`, sin estilos sueltos.
- **FR-003**: WHERE una superficie lleva **texto blanco** o **texto de acento pequeño** (botón primario,
  texto de acento de tamaño normal) THE feature SHALL seguir usando **`--color-primary`** (≥4.5:1); el token
  vivo **SHALL NOT** usarse como fondo bajo texto blanco ni como color de texto pequeño.
- **FR-004**: WHEN se ejecuta el test determinista de contraste THE resultado SHALL ser: cada par
  **texto/fondo ≥4.5:1** y cada uso del **vivo (componente/foco/gráfico) vs su fondo adyacente ≥3:1**, en
  **claro y oscuro**; **0** violaciones. (Se extiende `tests/a11y/contrast-tokens.test.ts`.)
- **FR-005**: WHEN corre axe sobre cada pantalla en cada tema THE resultado SHALL ser **0** violaciones
  serias/críticas (sin regresión respecto a FE-5).
- **FR-006**: THE feature SHALL producir **capturas con el Playwright MCP** (o Playwright) de las pantallas
  clave en **claro y oscuro** como evidencia de fidelidad al artifact, para revisión humana (la fidelidad
  estética la juzga la persona; el test solo garantiza el AA).
- **FR-007**: THE feature SHALL **no** ampliar alcance funcional (sin endpoints/roles/estados/lógica): los
  ficheros cambiados SHALL limitarse a `frontend/src/ui/` (tokens/componentes/estilos), `docs/design-system.md`
  y tests; **0** ficheros bajo `backend/`, `contracts/`, `src/domain/` (verificable por `git diff --name-only`).
  El lint de "token o nada" (FR-017c) y las reglas de FE-6 SHALL quedar en verde (sin estilos sueltos).
- **FR-008**: WHEN se ejecutan los gates del front (`tsc`, `eslint`, `stylelint`, `build`, `vitest`) THE
  resultado SHALL ser **verde** en todos (0 regresiones).

## Success Criteria *(mandatory)*

- **SC-001**: `--color-accent-vivid` existe con `#DC5A24` (claro) y `#FF7A45` (oscuro) en los 4 bloques de
  tema; ≥4 superficies designadas (marca, foco, paso actual del Stepper, selección) lo consumen vía token.
- **SC-002**: test de contraste: **0** violaciones — todo par texto/fondo ≥4.5:1 y todo uso del vivo vs fondo
  ≥3:1, en claro **y** oscuro. Los botones primarios siguen usando `--color-primary` (≥4.5:1 con texto blanco).
- **SC-003**: axe **0** serias/críticas por pantalla × tema (suite existente en verde).
- **SC-004**: capturas Playwright (claro+oscuro) de ≥3 pantallas clave generadas para revisión.
- **SC-005**: `tsc`/`eslint`/`stylelint`/`build`/`vitest` **5/5 verdes** (0 regresiones; 0 estilos sueltos).
- **SC-006**: `git diff --name-only` frente a develop: **0** ficheros bajo `backend/`/`contracts/`/`src/domain/`;
  solo `frontend/src/ui/` + `docs/design-system.md` + tests.

## Trazabilidad (RF → artefacto/regla → tarea → test) *(obligatorio — Constitution VI)*

| FR | Artefacto | Tarea(s) | Test / verificación |
|----|-----------|----------|---------------------|
| FR-001 | `tokens.css` (`--color-accent-vivid`) | T0xx | inspección token + contrast test |
| FR-002 | `src/ui/` (marca, foco, stepper, selección) | T0xx | `unit` de uso de token |
| FR-003 | botón primario usa `--color-primary` | T0xx | `unit/accent-primary` |
| FR-004 | `tests/a11y/contrast-tokens.test.ts` (ampliado) | T0xx | contrast ≥4.5 texto / ≥3 vivo, 2 temas |
| FR-005 | suite axe | T0xx | `a11y/*` |
| FR-006 | capturas Playwright MCP | T0xx | screenshots claro/oscuro |
| FR-007 | alcance acotado + token o nada | T0xx | `git diff` + `lint` |
| FR-008 | gates de front | T0xx | tsc/eslint/stylelint/build/vitest |

## Assumptions

- La fidelidad estética final la **juzga la persona** (con las capturas); el test garantiza el **AA**, no el
  "se parece". El `#DC5A24`/`#FF7A45` son los valores exactos del artifact (`docs/design-exploration/`).
- Se reutiliza el harness de contraste de FE-5 (`contrast-tokens.test.ts`), añadiendo el par del vivo.
- Regla de fidelidad AA: el vivo **nunca** bajo texto blanco pequeño; ahí manda `--color-primary`.
- Depende de FE-6 (020, ya en develop): sigue `docs/front-architecture.md` y el lint endurecido.
