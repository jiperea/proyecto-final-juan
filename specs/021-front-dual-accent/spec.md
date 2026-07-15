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
naranja **vivo** en superficies **sin texto encima** (donde basta **3:1** — anillo de foco, indicador del
Stepper, borde de selección) y mantener el acento **accesible** (`--color-primary`) donde hay **texto**
(botones con texto blanco, texto de marca/etiquetas). Así se recupera la fidelidad **sin bajar de AA**.

> **Alcance sin contrato ni IA**: es **presentación** (tokens + su consumo en CSS de `frontend/src/`). No añade
> endpoints ni IA → se omiten *Contrato* y *Eval de objetivos*. Respeta el design system y
> `docs/front-architecture.md` (FE-6): token o nada, componentes base propios, sin estilos sueltos.

---

## Clarifications

### Session 2026-07-15

- Q (implícita del brief): ¿el acento vivo puede llevar texto encima? → A: **No.** El vivo (`#DC5A24`/
  `#FF7A45`) solo se usa en **superficies de componente sin texto** (WCAG ≥3:1). Donde hay texto se usa
  `--color-primary` (≥4.5:1). Regla dura verificada por test de contraste.
- Q (G1, F-001/F-002): ¿cuáles son exactamente las superficies del vivo, dado que la "marca" es texto y el
  paso del Stepper colorea texto? → A: **solo 3 superficies sin texto**: anillo de foco (`--color-focus-ring`),
  **punto** del Stepper (`.stepper__dot`, no la etiqueta), y borde de selección. La marca y la etiqueta del
  Stepper **quedan en `--color-primary`**. Se **retira** el uso de "texto grande sobre vivo" (sin caso real).
- Q (G1, H-004): ¿cómo se acepta la fidelidad estética (US1), que es subjetiva? → A: la **aprobación humana**
  de las capturas Playwright (claro/oscuro de las 3 pantallas clave) es un **checkpoint vinculante en G3/PR**;
  el gate automatizado solo garantiza el AA.
- Q (G1, H-001/F-003): ¿contra qué fondos se mide el vivo? → A: lista **cerrada** — `--color-bg`,
  `--color-surface`, `--color-surface-2`, en ambos temas, cada uno ≥3:1.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — El acento se ve como el artifact, en claro y oscuro (Priority: P1)

Una persona usuaria abre la app y percibe el **naranja vivo** del artifact en el **anillo de foco**, el
**punto del paso actual** del Stepper y el **borde de la selección**, en **tema claro y oscuro**,
manteniéndose todo legible (el texto —marca, etiquetas— sigue en el acento accesible).

**Why this priority**: es el objetivo de la feature — cerrar la brecha estética con el artifact.

**Independent Test**: existe `--color-accent-vivid` (claro `#DC5A24` / oscuro `#FF7A45`) y las superficies
designadas lo consumen; capturas con Playwright MCP en claro/oscuro muestran el acento vivo en esas
superficies. Verificable por token + captura.

**Acceptance Scenarios**:

1. **Given** el tema claro, **When** se inspeccionan las 3 superficies de acento **sin texto** (anillo de
   foco `--color-focus-ring`, punto del Stepper `.stepper__dot`, borde de selección `.order-item[aria-current]`),
   **Then** usan `--color-accent-vivid` = `#DC5A24`.
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

**Independent Test**: `tsc`/`eslint`/`stylelint`/`build`/`vitest` del front en verde; `git diff --name-only`:
los únicos ficheros de **producción** cambiados son **`.css`** (`frontend/src/ui/*.css` +
`frontend/src/features/orders/orders.css`); **0** ficheros de producción `.ts`/`.tsx` (los `.ts` del diff son
solo **tests** bajo `tests/`), `docs/design-system.md` permitido; **0** bajo `backend/`/`contracts/`/`src/domain/`.

**Acceptance Scenarios**:

1. **Given** la rama, **When** corren los gates de front, **Then** todos verdes (sin regresión funcional/visual).
2. **Given** el diff, **Then** los únicos ficheros de producción son `.css` (`frontend/src/ui/*.css` +
   `frontend/src/features/orders/orders.css`); 0 ficheros de producción `.ts`/`.tsx`; `.ts` solo en `tests/`;
   `docs/design-system.md` permitido; 0 bajo `backend/`/`contracts/`/`src/domain/`.

### Edge Cases

- **Vivo con texto**: no aplica en esta feature (las 3 superficies del vivo no llevan texto). Si en el futuro
  una superficie necesitara texto, se usa `--color-primary` (accesible); **nunca** texto sobre el vivo
  (coherente con FR-003; no se introduce ningún token `on-vivid` no especificado).
- **Foco**: el anillo de foco usa el vivo (≥3:1 vs adyacente) y **no** sustituye al indicador de foco visible.
  El `outline-offset` ≥2px asume que detrás del elemento enfocado hay `--color-bg`/`--color-surface`/
  `--color-surface-2` (el caso real en la app, con espaciado entre elementos). Los layouts existentes **no**
  colocan dos rellenos del mismo color pegados tras un foco; si un layout futuro lo hiciera, se re-verifica
  ese par (H-002-pase6). El test de FR-004 cubre esos 3 fondos de diseño.
- **Seleccionado + enfocado a la vez (H-003)**: en `.order-item[aria-current="true"]` con foco de teclado, el
  **anillo de foco** (un `outline` con offset, alrededor) y el **borde/acento de selección** (borde/inset del
  propio ítem) son **tratamientos visuales distintos** (outline separado vs borde pegado), por lo que siguen
  siendo perceptualmente distinguibles aunque compartan color; se comprueba en las capturas de FR-006.
- **`.stepper__dot` decorativo (H-005)**: el punto del Stepper es **no interactivo** (sin `tabindex`/rol), así
  que nunca recibe el anillo de foco encima de su relleno vivo. Si en el futuro se hiciera navegable, se
  re-evaluaría este par.
- **Tema oscuro**: el vivo oscuro `#FF7A45` sobre `ground`/`surface` oscuros debe cumplir ≥3:1 (verificado).
- **prefers-reduced-motion / responsive**: sin cambios; se preservan.

## Requirements *(mandatory)*

- **FR-001**: THE design system SHALL definir el token `--color-accent-vivid` con valor **`#DC5A24`** (claro)
  y **`#FF7A45`** (oscuro) en `frontend/src/ui/tokens.css` (los 4 bloques de tema: `:root`, `@media dark`,
  `[data-theme=dark]`, `[data-theme=light]`), verificado por un **test automatizado** que confirma que el
  token existe con el valor correcto en **los 4 bloques** (`#DC5A24` en `:root` y `[data-theme=light]`;
  `#FF7A45` en `@media dark` y `[data-theme=dark]`) — no basta la inspección manual (F-102), porque un usuario
  con el modo del SO (`@media prefers-color-scheme: dark` sin `data-theme`) debe ver el vivo. **NO se define
  variante hover del vivo** (H-006/F-005): las
  superficies designadas (FR-002) son **indicadores de estado**, no elementos con estado hover propio; si una
  (p. ej. fila seleccionada) tuviera hover, éste sigue usando los tokens existentes (`--color-primary-hover`/
  fondo de hover), **no** un hex suelto.
- **FR-002** *(conjunto acotado a superficies SIN texto — F-001/F-002/H-002/H-003)*: THE feature SHALL aplicar
  `--color-accent-vivid` **solo** a estas superficies de **componente/decorativas sin texto encima** (umbral
  WCAG **≥3:1** vs su fondo adyacente): (1) el **anillo de foco** — token `--color-focus-ring` (GLOBAL: lo
  consumen `.btn`, `.field__input`, `.order-item`, `.theme-toggle__option`) pasa al vivo, dibujado **con
  `outline-offset` ≥2px en TODOS sus consumidores** (H-001/F-104) para que su fondo adyacente sea siempre
  `--color-bg`/`--color-surface`/`--color-surface-2`, **nunca** el relleno del propio componente; se
  **normaliza** `.field__input:focus-visible` (hoy `outline-offset: 1px`) a ≥2px; (2) el **punto del paso
  actual** del Stepper — selector real **`.stepper__step--current .stepper__dot`** (el círculo indicador,
  **NO** la etiqueta de texto de `.stepper__step--current`); (3) el **borde/acento del ítem seleccionado** del
  master-detail — selector real **`.order-item[aria-current="true"]`** (en
  `frontend/src/features/orders/orders.css`, reutilizado por dispatcher y supervisor; H-002/F-105/F-110). En los 3 sitios el vivo se consume por
  **`var(--color-accent-vivid)`** (referencia al token, **nunca** duplicando el hex `#DC5A24`/`#FF7A45` como
  literal — H-007), para que el check inverso de FR-003a sea real. Todo vía tokens/componentes, sin estilos
  sueltos.
  **Exclusiones explícitas** (siguen en `--color-primary`): el **texto de la marca** `.shell__brand`
  ("FieldOps", es texto, no logo) y la **etiqueta de texto** del paso actual del Stepper.
- **FR-003**: WHERE una superficie lleva **texto** (blanco sobre acento, o texto de acento de tamaño normal)
  —botón primario, texto de marca, etiqueta del Stepper— THE feature SHALL usar **`--color-primary`**
  (≥4.5:1); el token vivo **SHALL NOT** usarse como fondo bajo texto ni como color de texto. **No** hay uso de
  "texto grande sobre vivo" en esta feature (se retira esa autorización teórica — H-003/F-004).
- **FR-003a** *(sustitución, no coexistencia — H-005)*: en cada superficie designada de FR-002, el uso del
  token nuevo SHALL **sustituir** el uso previo de `--color-primary`/color anterior (cambiar el valor del
  token `--color-focus-ring` o la regla del componente), **sin dejar reglas antiguas** que puedan ganar por
  especificidad/orden CSS. **Verificación determinista** (usando los selectores REALES del código —
  `--color-focus-ring`, `.stepper__step--current .stepper__dot`, `.order-item[aria-current="true"]`): un
  check (grep/test) confirma que en esas reglas **no** queda un valor de color previo (`--color-primary`/hex)
  compitiendo (F-105). Y un **check inverso**: `--color-accent-vivid` se usa **solo** en esos 3 sitios (+ la
  definición en `tokens.css`) — un grep falla si aparece en otro selector no autorizado. **Ámbito del grep
  (H-001-pase6)**: los checks anti-hex e inverso corren **solo sobre CSS de producción**
  (`frontend/src/**/*.css`), **excluyendo** `docs/design-system.md` (que SÍ lista el hex por FR-009) y
  `tests/`; así no chocan con FR-009/SC-007.
- **FR-004** *(pares de contraste enumerados — H-001/F-003)*: WHEN se ejecuta el test determinista de
  contraste THE resultado SHALL ser **0** violaciones: (a) cada par **texto/fondo ≥4.5:1** (los existentes,
  sin regresión); (b) el **vivo vs cada fondo adyacente real** ≥**3:1** — a testear como lista cerrada:
  `accent-vivid` vs `--color-bg`, vs `--color-surface` y vs `--color-surface-2`, en **claro y oscuro**. Se
  extiende `tests/a11y/contrast-tokens.test.ts` para soportar el **umbral 3:1** en los pares del vivo (no solo
  4.5:1 texto).
- **FR-005**: WHEN corre axe sobre cada pantalla en cada tema THE resultado SHALL ser **0** violaciones
  serias/críticas (sin regresión respecto a FE-5).
- **FR-006** *(evidencia visual + checkpoint vinculante — H-004)*: THE feature SHALL producir **capturas con
  el Playwright MCP** (o Playwright) en **claro y oscuro** de las **3 pantallas clave** que exhiben las
  superficies del vivo: **detalle de técnico** (Stepper), **revisión de supervisor** (Stepper + selección),
  **listado del dispatcher** (selección + foco). La aceptación de US1 (fidelidad estética) requiere la
  **aprobación humana explícita** de esas capturas en **G3/PR**. Es un **gate manual de proceso** (no un check
  de CI ni branch-protection nueva; H-002): un **ítem de checklist en el PR** que **la persona dueña del
  brief/quien pidió la fidelidad** marca con un comentario "fidelidad OK" (H-004/T-001); nadie mergea sin él.
  **Modo autónomo (H-006)**: si el pipeline corre sin humano en G3, la aprobación **no se salta ni cuelga** —
  coincide con el **merge manual del PR por parte del usuario** (rama protegida: el usuario siempre mergea, y
  ese acto ES la aprobación de fidelidad, con las capturas adjuntas al PR). **Proceso de rechazo
  (H-003/H-004/H-008)**: si apunta a la **implementación**, se iteran los tokens/su consumo y se re-captura,
  **máx. 2 rondas**; si tras 2 rondas persiste, o si apunta a un **valor ya fijado en la spec** (p. ej. el
  propio `#DC5A24`), se trata como **cambio de spec** → se **reabre** brevemente `/speckit-specify` (no bucle
  infinito). El gate automatizado solo garantiza el AA, no el parecido.
- **FR-007** *(alcance de solo-CSS — F-107/T-001)*: THE feature SHALL **no** ampliar alcance funcional (sin
  endpoints/roles/estados/lógica). Criterio **objetivo y verificable** por `git diff --name-only`: los únicos
  ficheros de **producción** modificados SHALL ser **`.css`** —`frontend/src/ui/*.css` (incl. `tokens.css`) y
  `frontend/src/features/orders/orders.css`—; **0** ficheros de producción **`.ts`/`.tsx`** (ningún cambio de
  lógica; los `.ts` del diff son solo **tests** bajo `tests/`); `docs/design-system.md` permitido; **0**
  ficheros bajo `backend/`, `contracts/`, `src/domain/`. El token nuevo vive en `tokens.css` (que stylelint
  **ignora**) y se consume por `var()` → **no requiere cambiar la config de lint** (H-009); "token o nada"
  (FR-017c) y las reglas de FE-6 quedan en verde.
- **FR-008**: WHEN se ejecutan los gates del front (`tsc`, `eslint`, `stylelint`, `build`, `vitest`) THE
  resultado SHALL ser **verde** en todos (0 regresiones).
- **FR-009** *(documentar el token — F-006)*: THE feature SHALL añadir en `docs/design-system.md` una entrada
  para `--color-accent-vivid` (valor claro/oscuro + **regla de uso**: "solo en superficies sin texto, ≥3:1;
  nunca bajo texto") como fuente de verdad para features futuras.

## Success Criteria *(mandatory)*

- **SC-001**: `--color-accent-vivid` existe con `#DC5A24` (claro) y `#FF7A45` (oscuro) en los **4 bloques de
  tema**; las **3 superficies sin texto** designadas (anillo de foco, punto del paso actual del Stepper, borde
  de selección) lo consumen vía token; el texto de marca y la etiqueta del Stepper **siguen** en
  `--color-primary`.
- **SC-002**: test de contraste: **0** violaciones — todo par texto/fondo ≥4.5:1 (sin regresión) y el vivo vs
  **`--color-bg`, `--color-surface`, `--color-surface-2`** ≥**3:1**, en claro **y** oscuro. Los botones
  primarios siguen usando `--color-primary` (≥4.5:1 con texto blanco).
- **SC-003**: axe **0** serias/críticas por pantalla × tema (suite existente en verde).
- **SC-004**: capturas Playwright (claro+oscuro) de las **3 pantallas clave** (detalle técnico, revisión
  supervisor, listado dispatcher) generadas y **aprobadas por revisión humana** en G3/PR (acepta US1).
- **SC-005**: `tsc`/`eslint`/`stylelint`/`build`/`vitest` **5/5 verdes** (0 regresiones; 0 estilos sueltos).
- **SC-006**: `git diff --name-only` frente a develop: únicos ficheros de producción = **`.css`**
  (`frontend/src/ui/*.css` + `frontend/src/features/orders/orders.css`); **0** ficheros de producción
  `.ts`/`.tsx`; `.ts` solo bajo `tests/`; **0** bajo `backend/`/`contracts/`/`src/domain/`; `docs/design-system.md`
  permitido.
- **SC-007**: `docs/design-system.md` incluye la entrada de `--color-accent-vivid` con su regla de uso
  ("solo sin texto, ≥3:1").

## Trazabilidad (RF → artefacto/regla → tarea → test) *(obligatorio — Constitution VI)*

| FR | Artefacto | Tarea(s) | Test / verificación |
|----|-----------|----------|---------------------|
| FR-001 | `tokens.css` (`--color-accent-vivid`, sin hover) | T0xx | **test automatizado** de los 4 bloques (mismo valor por tema) + contrast test |
| FR-002 | `src/ui/` + `orders.css`: foco (`--color-focus-ring`), `.stepper__step--current .stepper__dot`, `.order-item[aria-current="true"]` | T0xx | `tests/unit/accent-vivid.test.ts` (uso de `var()` en los 3 sitios) |
| FR-003/003a | texto en `--color-primary`; sustitución + check inverso/anti-hex | T0xx | `tests/unit/accent-vivid.test.ts` (grep: sin `#DC5A24`/`#FF7A45` literal fuera de tokens.css; vivo solo en los 3 selectores) + `unit/accent-primary` |
| FR-004 | `tests/a11y/contrast-tokens.test.ts` (umbral 3:1) | T0xx | vivo vs bg/surface/surface-2 ≥3:1, 2 temas |
| FR-005 | suite axe | T0xx | `a11y/*` |
| FR-006 | capturas Playwright MCP + aprobación humana | T0xx | screenshots claro/oscuro (3 pantallas), OK en G3/PR |
| FR-007 | alcance acotado + token o nada (sin cambio de lint) | T0xx | `git diff` + `lint` |
| FR-008 | gates de front | T0xx | tsc/eslint/stylelint/build/vitest |
| FR-009 | entrada de `--color-accent-vivid` en design-system.md | T0xx | inspección del doc |

## Assumptions

- La fidelidad estética final la **juzga la persona** (aprobación de capturas en G3/PR, FR-006); el test
  garantiza el **AA**, no el "se parece". `#DC5A24`/`#FF7A45` son los valores exactos del artifact
  (`docs/design-exploration/`).
- **Tokens sin colisión (H-007)**: no existe hoy `--color-accent-vivid`; `--color-primary` (accesible) y
  `--color-accent-vivid` (vivo) tienen roles distintos y documentados (FR-009). `--color-focus-ring` cambia de
  valor al vivo (era `#c2410c`).
- **Harness de contraste (H-008)**: `contrast-tokens.test.ts` es una lista cerrada de pares texto/fondo (4.5:1);
  ampliarlo para el vivo requiere **soportar un umbral 3:1** para los pares de componente (no solo añadir una
  fila) — previsto en FR-004/tasks.
- Regla de fidelidad AA: el vivo **nunca** bajo texto **blanco**; ahí manda `--color-primary`.
- **Decisión sobre el botón primario (H-001, documentada, no olvido)**: en **oscuro** el artifact logra su
  botón vivo con **tinta oscura** (`--accent-ink: #1A1005`, ~7.2:1) y el repo ya tiene ese mecanismo
  (`--color-text-on-accent: #1a1005` en oscuro). AUN ASÍ, esta feature **mantiene el botón primario en
  `--color-primary` en AMBOS temas** a propósito: (a) un **único token de acento por botón** (más simple,
  menos ramas por tema, proporcionalidad XV); (b) el alcance de FE-7 son las **3 superficies sin texto**. El
  "botón primario vivo en oscuro (vivid + tinta oscura)" queda como **refinamiento futuro** — si al revisar
  las capturas (FR-006) se desea, es el camino de "cambio de spec" ya previsto, no un bug.
- Depende de FE-6 (020, ya en develop): sigue `docs/front-architecture.md` y el lint endurecido. El token nuevo
  vive en `tokens.css` (ignorado por stylelint) → sin cambio de config de lint (H-009).
