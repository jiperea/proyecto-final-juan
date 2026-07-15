# Feature Specification: Reskin del front (refresh del design system + tema oscuro)

**Feature Branch**: `017-front-reskin`

**Created**: 2026-07-15

**Status**: Draft

**Input**: User description: "Reskin del front hacia el lenguaje visual explorado (artifact no vinculante 69806069): refresh transversal del design system (acento naranja, paleta de estados, radios/sombras suaves, stepper, control segmentado, tarjeta de resumen IA) + tema oscuro, sin ampliar el alcance funcional del brief y sin estilos sueltos."

---

## Contexto y motivación *(no normativo)*

El front real (FE-1..FE-4) se construyó por SDD contra `docs/design-system.md` (acento azul, sin tema
oscuro, componentes planos). Al usuario se le mostró previamente un **artifact de exploración no
vinculante** (69806069) con un lenguaje visual más pulido (acento naranja, tema oscuro, *stepper* del
ciclo de vida, tarjeta de resumen IA con acento de revisión). Esta feature **acerca el front a ese
lenguaje visual dentro del design system**.

**Alcance — definición precisa (resuelve la tensión "solo presentación" vs "alcance nuevo"):** la feature
**no amplía el alcance funcional del brief**: no añade endpoints, roles, estados de la FSM, lógica de
negocio ni cambios de backend/dominio/contratos; no toca el RBAC ni las mutaciones/queries. Sí amplía el
**design system** (reescribe §2.4 para introducir tema oscuro) y añade **dos** elementos de UI nuevos,
ambos **client-side** y **sin datos de negocio propios**: (1) un **Stepper** de presentación del estado ya
autorizado, y (2) un **conmutador de tema**. El conmutador es una pequeña **capacidad interactiva nueva**
(estado light/dark/system persistido en cliente) y **se especifica y testea como tal** (no como "CSS
puro"): tiene FRs, criterios de aceptación y tests de su lógica de estado. Respeta las reglas duras de la
constitución (token o nada, sin librería pesada, WCAG 2.1 AA, textos en español).

---

## Clarifications

### Session 2026-07-15

- Q: ¿Cómo se cambia entre tema claro y oscuro? → A: Conmutador visible en el shell (claro/oscuro/sistema)
  con la elección **persistida en `localStorage`** (solo cliente, sin backend); por defecto sigue la
  preferencia del SO.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Front re-tematizado en tema claro (Priority: P1)

Cualquier rol (técnico, dispatcher, supervisor) usa las mismas pantallas ya existentes, ahora con el
lenguaje visual renovado en **tema claro**: acento naranja en acciones primarias/foco, badges de estado
con la paleta re-tematizada (color **+** texto), tarjetas con radios y sombras más suaves. Ninguna
función cambia: los mismos controles hacen lo mismo, con los mismos permisos.

**Why this priority**: Es el núcleo del encargo del usuario ("no se parece a lo que me mostraste") y no
depende del tema oscuro. Entregable por sí sola: un reskin en claro ya cumple la petición.

**Independent Test**: Cargar cada pantalla (login, listado, detalle, ejecución, revisión) en tema claro
y verificar que (a) los controles primarios usan el acento nuevo, (b) los estados se ven con la paleta
nueva **con etiqueta de texto**, (c) `stylelint` reporta **0 estilos sueltos**, (d) todos los tests de
front existentes siguen en verde.

**Acceptance Scenarios**:

1. **Given** un usuario en tema claro, **When** abre cualquier pantalla con una acción primaria, **Then**
   esa acción se muestra con el token de acento nuevo y su foco visible usa el token de anillo de foco.
2. **Given** una orden en cualquier estado del FSM, **When** se muestra su badge, **Then** el badge
   incluye **fondo tintado + etiqueta de texto en español** (el color no es el único indicador).
3. **Given** el árbol de fuentes del front, **When** se ejecuta el lint de estilos, **Then** hay **0**
   literales de color/tamaño/tipografía fuera de `frontend/src/ui/tokens.css`.

---

### User Story 2 - Tema oscuro con contraste AA (Priority: P1)

Un usuario cuyo sistema operativo está en modo oscuro ve toda la app en **tema oscuro** por defecto, con
el mismo lenguaje visual y **contraste WCAG 2.1 AA** en todas las pantallas. Además, un **conmutador de
tema** en el shell (claro/oscuro/sistema) permite forzar el tema; la elección se **persiste en
`localStorage`** y sobrevive a la recarga. El tema es un **swap de valores de tokens semánticos**: las
vistas no cambian.

**Why this priority**: El usuario eligió explícitamente "reskin claro **+ tema oscuro**". Amplía el
**design system** (reescribe la exención §2.4, hoy "fuera del MVP") e introduce el conmutador de tema
(único control client-side nuevo); **no** amplía el alcance funcional del brief (backend/dominio/contratos).

**Independent Test**: (a) El test determinista de ratios de contraste sobre `tokens.css` recorre la lista
cerrada de pares (ver «Pares de contraste a verificar») en **ambos** temas: 0 pares por debajo del
umbral AA. (b) El barrido axe estructural por pantalla da 0 serias/críticas (axe se ejecuta una vez por
pantalla; como los tests corren con `css:false`, axe **no** discrimina tema — el contraste por tema lo
cubre (a), no axe). (c) Test de la lógica del conmutador: elegir claro/oscuro fija `data-theme`, persiste
y sobrevive a recarga; «sistema» revierte.

**Acceptance Scenarios**:

1. **Given** el SO en modo oscuro y sin elección previa del usuario, **When** el usuario abre la app,
   **Then** la app se renderiza en tema oscuro (respeta `prefers-color-scheme`).
2. **Given** el conmutador de tema, **When** el usuario elige «claro» u «oscuro», **Then** ese valor
   **gana** sobre la preferencia del SO y se refleja de inmediato (via `data-theme` en la raíz).
3. **Given** que el usuario eligió un tema en el conmutador, **When** recarga la página, **Then** se
   conserva su elección (persistida en `localStorage`); elegir «sistema» vuelve a seguir al SO.
4. **Given** cualquier pantalla en tema oscuro, **When** se calculan los ratios de contraste de los
   tokens, **Then** el contraste texto ≥4.5:1 y texto grande/componentes ≥3:1 se cumple (0 pares por
   debajo del umbral).

---

### User Story 3 - Componentes del lenguaje visual (stepper, tarjeta IA) (Priority: P2)

En el **detalle** de una orden se muestra un **Stepper** del ciclo de vida
(draft→assigned→in_progress→pending_review→closed) que resalta el estado actual; y la **tarjeta de
resumen IA** (revisión del supervisor) se presenta con el acento de revisión y su nota de guardián. Son
componentes base propios en `frontend/src/ui/`, accesibles.

**Why this priority**: P2 indica **orden de entrega** (US1/US2 primero); **no** significa opcional. FR-006
(Stepper) y FR-008 (tarjeta IA) son **obligatorios** y sus criterios (SC-005) **bloquean G3**. La tarjeta
IA, además, ya existe (`IncidentSummaryPanel`): aquí solo se **reestiliza**, no se crea data-binding nuevo.

> **Descartado del artifact — control segmentado de filtros.** El artifact mostraba un control segmentado
> «Activas/Todas» y «Pendientes de revisión/Todas». En el producto real **no existe ese filtro**: el
> alcance del listado lo determina el backend por rol y **ignora** cualquier parámetro de consulta. Añadir
> un segmentado implicaría **inventar una función de filtrado en cliente** (amplía alcance, prohibido por
> el encargo) o un control vacío/engañoso. Por eso **queda fuera** de esta feature.

**Independent Test**: En el detalle de una orden en `pending_review`, el stepper marca «revisión» como
paso actual y los anteriores como completados; pasa axe-core sin violaciones serias/críticas.

**Acceptance Scenarios**:

1. **Given** el detalle de una orden en estado `X`, **When** se renderiza el stepper, **Then** los pasos
   previos a `X` se marcan como completados, `X` como actual, y el estado se comunica **además** por
   texto (no solo por color/posición).
2. **Given** un resumen IA presente, **When** se muestra la tarjeta, **Then** conserva su texto de
   guardián y no altera el comportamiento de "evidencia insuficiente → no inventa" de la feature 006/007.

---

### Edge Cases

- **Sin `prefers-color-scheme` (navegador antiguo)**: la app cae a **tema claro** por defecto (sin error).
- **`prefers-reduced-motion: reduce`**: cualquier transición añadida por el reskin se desactiva (regla
  global en `tokens.css` que neutraliza `transition`/`animation` en `*`, aplicable a todo componente).
- **Zoom 200% / ancho 320px**: el reskin no introduce scroll horizontal del body ni pérdida de contenido.
- **Estado `draft`/`closed` en el stepper**: el stepper cubre los 5 estados del FSM. El acceso al detalle
  de una orden sigue **gateado por el backend** (rol + `assigned_to` + estado) sin cambios: el stepper solo
  pinta el estado del detalle que el backend **ya autorizó** a ese rol; no habilita navegación nueva ni
  expone órdenes fuera de alcance (p. ej. un technician no accede al detalle de una orden no suya por URL).
- **Flash de tema al cargar (FOUC)**: si el usuario eligió un tema distinto al del SO, aplicar `data-theme`
  **antes del primer pintado** (script inline en `<head>`, previo a React) para que no haya parpadeo
  claro↔oscuro en cada carga (FR-013).
- **`localStorage` no disponible/escritura falla** (modo privado, cuota, política): el conmutador **aplica
  igualmente** el tema en la sesión actual (en memoria) y **no** lanza error ni rompe el shell (degradación
  aceptable; FR-004b).
- **Cambio de tema en caliente** (el SO cambia de claro a oscuro con la app abierta y el usuario en modo
  «sistema»): la UI refleja el nuevo tema **sin JS y sin recargar**, porque en modo «sistema» no hay
  `data-theme` y gobierna la `@media (prefers-color-scheme)` de `tokens.css` (repinta solo variables CSS,
  no remonta nodos → el foco se conserva). Es una **garantía arquitectónica** (CSS puro): no se afirma un
  test JS de este escenario del SO en jsdom (con CSS desactivado no habría evento que interceptar); la
  preservación de foco **sí** se testea para el cambio disparado por el conmutador (SC-006), que ejerce el
  mismo mecanismo de swap sobre `:root`.
- **Dos pestañas del mismo navegador**: al cambiar el tema en una, las demás se sincronizan vía el evento
  `storage` (FR-004b); no quedan pestañas con temas distintos hasta recargar.

## Requirements *(mandatory)*

> **EARS OBLIGATORIO (Constitution V).** FRs de presentación; el criterio pass/fail es una herramienta
> determinista (stylelint/eslint/tsc/axe-core/vitest) o una aserción de render, no un juicio subjetivo.

### Functional Requirements

- **FR-001**: WHEN una vista referencia un valor de `color|background|background-color|border|
  border-color|fill|stroke|box-shadow` (color/sombra) o de `font-size|padding|margin|gap|width|height|
  border-radius|line-height` (tamaño) o cualquier `font-family` THE front SHALL tomarlo de un **token
  semántico** de `frontend/src/ui/tokens.css`, de modo que `stylelint` (regla
  `declaration-property-value-disallowed-list` ya existente) y `eslint` (FR-017c) reporten **0** literales
  fuera de `src/ui/`. («tamaño» = exactamente esa lista de propiedades; el patrón exacto es el del
  `.stylelintrc.json` vigente, que esta feature no relaja.)
- **FR-002**: WHEN se renderiza una acción **primaria** o un anillo de foco THE front SHALL usar el token
  de **acento** re-tematizado y su token de texto-sobre-acento (clase `btn--primary` / token
  `--color-focus-ring`), sin literales. Verificable por render: cada acción primaria de cada pantalla
  expone la clase de acento (no un token semántico distinto preexistente).
- **FR-003**: WHEN se renderiza el badge de estado de una orden THE front SHALL mostrar **fondo tintado +
  etiqueta de texto en español** para los 5 estados del FSM (draft/assigned/in_progress/pending_review/
  closed), cumpliendo WCAG 1.4.1 (el color no es el único portador de significado).
- **FR-004**: El tema es **CSS-first** (sin doble fuente de verdad). Las reglas de `tokens.css` son:
  `:root` = tokens claros; `@media (prefers-color-scheme: dark) { :root:not([data-theme]) { tokens
  oscuros } }`; `:root[data-theme="dark"] { tokens oscuros }`; `:root[data-theme="light"] { tokens claros }`.
  De ahí la precedencia **elección del usuario (`data-theme`) > `prefers-color-scheme` > claro**. WHILE el
  usuario está en modo «sistema» (sin atributo `data-theme` en la raíz) THE front SHALL depender de la
  `@media` query, que reacciona **sola** a los cambios de `prefers-color-scheme` del SO **sin JS y sin
  recargar** (no hace falta listener `matchMedia`). Como el cambio de tema es un **swap de variables CSS en
  `:root`** (no se remonta ningún componente), el **foco actual se preserva** por construcción.
- **FR-004b**: WHEN el usuario acciona el **conmutador de tema** del shell THE front SHALL, para «claro»/
  «oscuro», fijar `data-theme` en la raíz y **persistir** la elección en `localStorage` (solo cliente); para
  «sistema», **eliminar** el atributo `data-theme` de la raíz y **borrar** la clave de `localStorage` (a
  partir de ahí gobierna la `@media`). IF la escritura/lectura en `localStorage` falla (modo privado/cuota)
  THE front SHALL aplicar igualmente el tema en la sesión (atributo en el DOM) **sin** lanzar error. WHEN
  cambia la clave de tema en `localStorage` desde otra pestaña THE front SHALL sincronizar el atributo
  `data-theme` de la raíz vía el evento `storage`. El conmutador es un control accesible (nombre accesible,
  operable por teclado, foco visible) y muestra la elección activa (claro/oscuro/sistema).
- **FR-005**: WHILE cualquier pantalla se muestra en tema claro **o** oscuro THE front SHALL cumplir
  contraste WCAG 2.1 AA (texto ≥4.5:1; texto grande ≥18.66px bold/≥24px, componentes y estados ≥3:1) para
  **cada** par de la lista cerrada de «Pares de contraste a verificar» (ver más abajo), verificado por el
  test determinista de ratios sobre `tokens.css` en **ambos** temas, con **0** pares por debajo del umbral.
- **FR-006**: WHEN se muestra el detalle de una orden en estado `X` THE front SHALL renderizar un
  **Stepper** de los 5 estados del FSM marcando los previos como completados, `X` como actual, y
  comunicando el estado **también por texto** (no solo color/posición). *(Obligatorio; SC-005 bloquea G3.)*
- **FR-007**: WHEN se ejecuta el barrido de a11y **estructural** (axe) sobre cada pantalla THE front SHALL
  reportar **0** violaciones serias/críticas. *(axe se ejecuta una vez por pantalla; con `css:false` no
  discrimina tema — la cobertura por tema del contraste la da FR-005, no axe.)*
- **FR-008**: WHEN se muestra el resumen IA en la revisión THE front SHALL presentarlo en una **tarjeta**
  con el acento de revisión y su **nota de guardián completa** (sin altura fija, `overflow:hidden` ni
  line-clamp que trunquen el texto), consumiendo **exactamente las mismas props/campos** que
  `IncidentSummaryPanel` hoy (reskin sin data-binding nuevo) y sin alterar la lógica de "evidencia
  insuficiente → no inventa" (features 006/007).
- **FR-009**: WHILE el reskin está activo THE front SHALL **preservar** el layout responsive campo↔oficina
  (móvil una columna para el técnico; master-detail ≥1024px para oficina) y **no** introducir scroll
  horizontal del `body` a 320px ni con zoom 200%.
- **FR-010**: WHEN el usuario tiene `prefers-reduced-motion: reduce` THE front SHALL neutralizar
  `transition` y `animation` mediante la **regla global** de `tokens.css` sobre `*` (aplica a todo
  componente nuevo o existente, no a un selector aislado).
- **FR-011**: WHEN se ejecutan `tsc`, `eslint`, `stylelint` y la suite de tests de front existente THE
  repositorio SHALL terminar en **verde** sin regresiones funcionales (el reskin no cambia función, RBAC
  de UI ni contratos consumidos).
- **FR-012**: WHEN se añade cualquier token o componente base nuevo (**Stepper**, **ThemeToggle**) THE
  cambio SHALL quedar documentado en `docs/design-system.md` (tokens §2, componentes §6, tema oscuro §2.4
  reescrito) antes de considerarse hecho. *(El control segmentado de filtros queda explícitamente fuera —
  ver US3; no debe implementarse bajo esta feature.)*
- **FR-013**: WHEN el documento carga THE front SHALL aplicar el tema efectivo **antes del primer pintado**
  mediante un script inline en `<head>` previo a React: si hay elección guardada en `localStorage` fija
  `data-theme`, si no, no toca la raíz (gobierna la `@media`). **Fuente de verdad única**: el store de tema
  de React **no recalcula** el tema al montar; **lee el `data-theme` ya presente en la raíz** (el que fijó
  el script inline) como estado inicial, y comparte con el script inline la **misma** utilidad/clave de
  lectura. Así no hay un segundo swap tras la hidratación (no hay FOUC "de segunda mano").
- **FR-014**: WHILE se implementa el **Stepper** THE front SHALL mantenerlo **puro de presentación**: recibe
  por props solo el estado de la orden ya autorizado y obtenido por la vista padre, **no** hace llamadas de
  red ni accede a datos fuera del alcance filtrado por rol/`assigned_to` por el backend. WHILE se implementa
  el **ThemeToggle** THE front SHALL mantenerlo sin datos de negocio: **no** hace llamadas de red ni consume
  datos de orden/rol; su única E/S es la preferencia de tema (store + `localStorage`, acotada por FR-016).
- **FR-015**: WHILE el reskin se aplica THE front SHALL **preservar el RBAC de UI espejo del backend**: los
  controles ocultos/deshabilitados por rol (reasignar=dispatcher, aprobar/rechazar=supervisor, acciones de
  técnico) siguen ocultos/deshabilitados tras el cambio de clases/estructura. Se verifica de forma
  determinista: (a) los ficheros de test de RBAC de UI existentes (`fe3-detail-rbac`, `fe4-detail-rbac`,
  etc.) **no cambian de aserción** (su diff no toca expectativas) y siguen en verde; (b) un test de
  regresión propio del reskin confirma, para ≥1 control por rol, que el ocultamiento/deshabilitación se
  mantiene.
- **FR-016**: WHEN el store de tema escribe en `localStorage` THE front SHALL escribir **únicamente** la
  preferencia de tema (`light|dark|system`) bajo una única clave dedicada, sin adjuntar datos de sesión,
  usuario ni orden. Verificable por test.

### Pares de contraste a verificar *(lista cerrada — base del test de FR-005/SC-003a)*

El test de ratios recorre **exactamente** estos pares (token texto/primer plano vs token fondo), en
**cada** tema (claro y oscuro). Umbral: ≥4.5:1 salvo donde se indica ≥3:1 (texto grande, bordes,
componentes y estados de foco, WCAG 1.4.3/1.4.11). Un par nuevo solo entra si se añade un token con
superficie de texto/fondo real; el test **falla** si algún par cae por debajo de su umbral.

| # | Primer plano | Fondo | Umbral |
|---|---|---|---|
| 1 | `--color-text` | `--color-bg` | 4.5:1 |
| 2 | `--color-text` | `--color-surface` | 4.5:1 |
| 3 | `--color-text-muted` | `--color-bg` | 4.5:1 |
| 4 | `--color-text-muted` | `--color-surface` | 4.5:1 |
| 5 | `--color-text-on-accent` | `--color-primary` (acento; y `--color-primary-hover`) | 4.5:1 |
| 6 | `--color-text-on-accent` | `--color-danger` | 4.5:1 |
| 7 | `--color-text-on-accent` | `--color-success` | 4.5:1 |
| 8 | `--color-warning-fg` | `--color-surface` (y `--color-bg`) | 4.5:1 |
| 9 | `--color-focus-ring` | `--color-bg` (y `--color-surface`) | 3:1 |
| 10 | `--color-border` | `--color-surface` (y `--color-bg`) | 3:1 |
| 11–15 | `--status-{estado}-fg` | `--status-{estado}-bg` (los 5 estados del FSM) | 4.5:1 |
| 16 | acento de revisión de la tarjeta IA (fg) | su fondo tintado (reusa `--status-pending_review-*`) | 4.5:1 |
| 17 | color del paso **actual**/**completado** del Stepper | su fondo | 3:1 |

> Si el naranja de acento no llega a 4.5:1 con texto blanco (par #5), la solución NO es bajar el umbral:
> ver Assumptions (regla de fidelidad del acento) — se ajusta el token de acento manteniendo el matiz.

### Key Entities *(no aplica)*

No introduce entidades de datos. Los "datos" visuales (estados de la orden, roles) ya están definidos por
los contratos congelados y los consume la UI sin redefinirlos.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: `stylelint` reporta **0** estilos sueltos (0 literales de color/tamaño/tipografía fuera de
  `frontend/src/ui/tokens.css`).
- **SC-002**: `tsc --noEmit` y `eslint` terminan con **0 errores**; `npm run build` del front termina con
  éxito.
- **SC-003**: (a) el test de ratios sobre `tokens.css` recorre la **lista cerrada** de «Pares de contraste
  a verificar» en **ambos** temas y encuentra **0** pares por debajo de su umbral; (b) axe reporta **0
  violaciones serias/críticas** en **cada** pantalla (login, listado, detalle, ejecución, revisión).
- **SC-004**: **100%** de los tests de front existentes siguen en verde tras el reskin (0 regresiones). El
  «no se modifica ninguna aserción de RBAC/comportamiento» se verifica de forma determinista sobre el
  `git diff` de los ficheros de test de RBAC/comportamiento (`tests/unit/fe*-detail-rbac.*`,
  `fe*-review-actions.*`, `fe*-reassign-*`, `*-rbac*`). Definición precisa de **«línea de aserción»
  (protegida, no puede cambiar)**: cualquier línea que contenga `expect(`, un matcher
  (`toBeVisible|toBeDisabled|toBeEnabled|toBeInTheDocument|toHaveAttribute|toHaveTextContent|not\.`), o una
  **query usada por una aserción** con nombre accesible (`getByRole|queryByRole|findByRole|getByText|
  queryByText` con opción `name`/texto). **Único cambio permitido** en esos ficheros: literales de clase
  CSS (`className=...`, `.btn--*`). El diff que toque una línea de aserción **falla** el gate; el residuo se
  respalda además por el test de regresión de FR-015/SC-010 (runtime, por rol).
- **SC-005**: El detalle de una orden en cada uno de los 5 estados del FSM renderiza el stepper con el
  paso actual correcto (aserción de render en test). *(Obligatorio — bloquea G3.)*
- **SC-006**: Con `prefers-color-scheme: dark` la app renderiza en oscuro; el conmutador fija `data-theme`
  y la elección **persiste** tras recargar (aserción de test); «sistema» **elimina** `data-theme` y borra la
  clave; si `localStorage` falla, el tema se aplica en el DOM sin error. Un test confirma que cambiar de
  tema **no remonta** el subárbol (swap de variables en `:root`), por lo que el elemento enfocado sigue
  enfocado tras el cambio.
- **SC-007**: Un test confirma que el store de tema escribe en `localStorage` **solo** la clave de tema con
  valor en `{light,dark,system}`, y ninguna otra clave/dato (FR-016).
- **SC-008**: Un test/inspección confirma que **Stepper** no hace llamadas de red y recibe el estado solo
  por props (FR-014); y que **ThemeToggle** no importa el cliente API ni consume datos de orden/rol (su
  única E/S es el store de tema). No se exige a ThemeToggle ninguna cláusula RBAC (no aplica).
- **SC-009**: No hay flash de tema: el tema efectivo está aplicado en la raíz **antes** de montar React
  (script inline en `index.html`); verificable porque `data-theme`/`color-scheme` ya está fijado en el
  primer HTML servido (FR-013).
- **SC-010**: Existe ≥1 test de regresión propio del reskin que, para al menos un control por rol
  (dispatcher/técnico/supervisor), confirma que su ocultamiento/deshabilitación por rol se preserva tras el
  reskin (FR-015).

> Feature de presentación **sin componente IA**: los SC se verifican con **herramientas deterministas**
> (stylelint/eslint/tsc/axe-core/vitest), no con promptfoo. No hay endpoints nuevos → sin eval de IA.

## Contrato (OpenAPI) *(no aplica)*

**Sin endpoints nuevos.** La feature es de presentación y **consume** los contratos ya congelados
(`contracts/*.openapi.yaml`); no crea ni modifica operaciones, esquemas ni errores. Los tipos de UI
siguen derivándose del contrato (no se redefinen).

## Trazabilidad (RF → componente/artefacto → tarea → test) *(obligatorio — Constitution VI)*

| FR | Componente / artefacto | Tarea(s) | Test(s) |
|----|------------------------|----------|---------|
| FR-001 | `ui/tokens.css`, `.stylelintrc.json` | (tasks) | `stylelint` sin violaciones (CI) |
| FR-002 | `ui/tokens.css`, `ui/components.css`, `Button` | (tasks) | render usa clase de acento; axe foco |
| FR-003 | `ui/StatusBadge`, `ui/components.css` (§2.3) | (tasks) | badge con texto por estado |
| FR-004 | `ui/tokens.css` (`@media` + `:root[data-theme]`) | (tasks) | precedencia CSS-first; foco preservado (no remonta) |
| FR-004b | `ui/ThemeToggle` (nuevo), `AppShell`, store de tema | (tasks) | fija/elimina `data-theme`; persiste; «sistema» borra clave; sync `storage` |
| FR-005 | tokens claro+oscuro | (tasks) | `contrast-tokens` (lista cerrada) claro+oscuro |
| FR-006 | `ui/Stepper` (nuevo), `OrderDetailView` | (tasks) | stepper marca paso actual por estado (5) |
| FR-007 | todas las pantallas | (tasks) | axe 0 serias/críticas por pantalla (1×) |
| FR-008 | `IncidentSummaryPanel`, `ui/components.css` | (tasks) | guardián completo; mismas props; sin cambio lógico |
| FR-009 | `ui/MasterDetail`, CSS responsive | (tasks) | sin overflow-x a 320px; master-detail ≥1024 |
| FR-010 | `ui/tokens.css` (`prefers-reduced-motion` global `*`) | (tasks) | regla global neutraliza transición/animación |
| FR-011 | todo el front | (tasks) | suite existente en verde; tsc/eslint |
| FR-012 | `docs/design-system.md` | (tasks) | doc actualizado (revisión G2/G3) |
| FR-013 | `index.html` (script inline pre-React) | (tasks) | `data-theme` fijado antes del primer render |
| FR-014 | `ui/Stepper`, `ui/ThemeToggle` | (tasks) | sin fetch propio; solo props |
| FR-015 | tests RBAC de UI + test regresión reskin | (tasks) | diff sin cambio de aserción; RBAC preservado |
| FR-016 | store de tema | (tasks) | localStorage solo clave de tema |

> Se mantiene en `docs/traceability.md` al generar tareas.

## Eval de objetivos *(determinista — Constitution XIV)*

- Cada SC medible se verifica con herramienta determinista en CI: stylelint, eslint, tsc, build, vitest,
  **test de ratios de contraste** sobre `tokens.css` (claro y oscuro) y **vitest-axe** (a11y estructural
  por pantalla, ambos temas). **No hay componente IA** en esta feature → **sin golden cases de promptfoo**.
  El gate **G3** falla si algún SC no se cumple (lint/tsc/build/contraste/axe/tests en rojo).

## Assumptions

- El artifact 69806069 es **referencia visual no vinculante**; los valores exactos de token (hex, radios,
  sombras) se fijan en `docs/design-system.md` durante el plan y deben **validarse** para contraste AA
  antes de entrar (herramienta determinista).
- **Regla de fidelidad del acento (resuelve accesibilidad vs "que se parezca al artifact"):** el acento se
  mantiene en la **familia naranja** del artifact (matiz H≈18–25° del espacio HSL, naranja reconocible; no
  se deriva a marrón/apagado). Si el naranja del artifact (`#DC5A24`) con texto blanco no llega a 4.5:1
  (par #5), se separan responsabilidades en dos tokens: un `--color-primary` **suficientemente oscuro para
  texto** (blanco ≥4.5:1) y, si se desea el naranja más vivo del artifact para superficies grandes/bordes
  decorativos, un token aparte que solo se use donde basta ≥3:1. Los hex finales y sus ratios medidos se
  **documentan** en `docs/design-system.md §2` (trazabilidad de la decisión ante el usuario).
- La verificación de contraste del repo es un **test determinista de ratios** que lee `tokens.css` y
  calcula WCAG a mano (`tests/a11y/contrast-tokens.test.ts`, `tests/unit/fe3-contrast.test.ts`); los tests
  de render (vitest) corren con CSS desactivado, así que **el contraste NO se mide con axe**. Extender esos
  tests de ratios a los valores del **tema oscuro** es parte del alcance. `vitest-axe` cubre la a11y
  **estructural** por pantalla (roles, nombres accesibles), no el contraste.
- El tema por defecto sin señal del SO ni elección del usuario es **claro** (paridad con el
  comportamiento actual).
- La preferencia de tema se persiste **solo en cliente** (`localStorage`), no en backend (fuera de
  alcance): el orden de precedencia es **elección del usuario > `prefers-color-scheme` > claro**.
