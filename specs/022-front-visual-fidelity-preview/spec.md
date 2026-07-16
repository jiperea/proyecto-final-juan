# Feature Specification: Fidelidad visual del front al preview de exploración

**Feature Branch**: `022-front-visual-fidelity-preview`

**Created**: 2026-07-16

**Status**: Draft

**Input**: User description: "Pase de fidelidad visual del front al artifact de exploración de diseño «FieldOps · Vistas mínimas del front». Objetivo: que el front se vea IGUAL que ese preview, de forma literal, en todas las pantallas (no solo colores)."

> **Fuente de verdad visual**: artifact de exploración `FieldOps · Vistas mínimas del front`
> (https://claude.ai/code/artifact/69806069-4e8c-4b96-832b-fae4d23b3abe). Esta feature es de
> **presentación (frontend)**: no crea ni cambia endpoints, IA, backend, contratos ni lógica RBAC;
> consume los mismos contratos ya congelados. Proporcionalidad (Constitution XV): alcance acotado a
> tokens + fidelidad de componentes/maquetación. **No es solo un reskin**: donde el artifact muestra
> estructura que hoy no existe (p. ej. el *chrome* de oficina del master-detail — topbar con buscador/avatar,
> cabecera de tabla, fila con barra de acento), esta feature la **construye**, siempre en **frontend** y
> consumiendo los contratos/datos ya existentes (sin backend nuevo). Lo ya existente (017) se ajusta; lo que falta se añade.

## Clarifications

### Session 2026-07-16

- Q: Acento vivo `#DC5A24` en botones con texto ¿literal (bajo AA) o adaptación accesible? → A: **Literal** (`#DC5A24` + texto blanco, ~3.4:1) con **excepción AA documentada y justificada**, acotada al acento-en-botón; el brief no exige AA (es "objetivo" de constitución) y la fidelidad al artifact prima. A validar en G1.
- Q: ¿Qué se replica del artifact y con qué viewports? → A: Las **vistas de app** (estructura + tokens), **sin** el andamiaje del mockup (phone frame, barra "9:41", chrome de navegador simulado). Además, **toda vista debe ser responsive (móvil y escritorio)**, no solo el viewport que el artifact dibujó en cada marco.
- Q: El segmentado «Activas/Todas» ¿filtra o es visual? → A: **Filtra en cliente** (frontend) sobre las órdenes ya cargadas, al menos en esta fase (sin backend): «Activas» = no cerradas; «Todas» = todas.
- Q: El buscador del topbar de oficina ¿busca o es visual? → A: **Filtra en cliente** sobre lo ya cargado (código, orden, cliente, técnico), sin backend.
- Q: Tarjeta de resumen IA ¿qué fidelidad? → A: **Replicar su estilo** (borde morado, cabecera, nota de guardián) y aceptar el **estado de runtime actual** del feature de resumen (texto real / vacío / evidencia insuficiente). La fidelidad juzga el aspecto, no que genere texto (eso es 006/018).
- Nota (diferido): **paginación** de listados — posiblemente **backend (cursor)** — se deja **fuera de alcance**, para una **fase de mejora futura**. En esta fase el filtrado del segmentado y del buscador es en cliente sobre lo ya cargado.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Sistema de diseño fiel al preview (Priority: P1)

Como cualquier usuario, al abrir la app veo la **misma paleta y lenguaje visual** que el preview:
fondo de página gris suave (no blanco puro), acento naranja vivo, chips de estado con la paleta del
preview (incluido `in_progress` en teal) y su punto de color, bordes claros y radios/sombras suaves —
en tema claro y oscuro.

**Why this priority**: es la base transversal; sin los tokens correctos, ninguna pantalla se parece al
preview. Habilita todas las demás historias.

**Independent Test**: comparar los valores de token computados (`getComputedStyle`) y una captura de
cualquier pantalla contra el preview, en claro y oscuro; los colores base, acento y de estado coinciden
con los del artifact.

**Acceptance Scenarios**:

1. **Given** el tema claro, **When** se renderiza cualquier vista, **Then** el fondo de página es el gris del preview (`#F4F6F8`) y no blanco puro.
2. **Given** una orden `in_progress`, **When** se muestra su chip de estado, **Then** el chip usa el teal del preview (`#0E7C9B` sobre `#DEF0F5`) con un punto de color a la izquierda.
3. **Given** el tema oscuro, **When** se renderiza cualquier vista, **Then** los tokens hacen swap a los valores oscuros del preview (fondo `#0E141A`, acento `#FF7A45`) sin romper la paridad de nombres de token.

---

### User Story 2 - Técnico en móvil: lista y detalle idénticos al preview (Priority: P1)

Como técnico en el móvil, veo **Mis órdenes** como el preview (control segmentado «Activas/Todas» +
tarjetas de orden con código monoespaciado, chip de estado, nombre, cliente y técnico) y el **detalle**
con stepper (paso actual resaltado), notas, evidencia en miniaturas y las acciones de mi rol.

**Why this priority**: es la superficie mínima del brief (lista + detalle) y la vista de campo principal.

**Independent Test**: login como `technician@fieldops.test`, capturar lista y detalle en viewport móvil
(≤390px) en claro y oscuro; la estructura y el aspecto coinciden con las pantallas 02 y 03 del preview.

**Acceptance Scenarios**:

1. **Given** el técnico autenticado, **When** abre «Mis órdenes», **Then** ve el control segmentado «Activas/Todas» y tarjetas con la maquetación del preview (código, chip, nombre, cliente, técnico).
2. **Given** una orden en `pending_review`, **When** el técnico abre su detalle, **Then** ve el stepper con el paso actual resaltado y las secciones de notas y evidencia como el preview.

---

### User Story 3 - Oficina en escritorio: master-detail del preview (Priority: P2)

Como dispatcher o supervisor en escritorio, veo el **layout master-detail de oficina** del preview:
topbar con marca, buscador, rol y avatar; lista con cabecera de tabla (Código/Orden/Cliente/Estado) y
fila seleccionada con barra de acento a la izquierda y fondo suave; panel de detalle a la derecha con
acciones por rol.

**Why this priority**: es la vista de volumen para oficina; el brief la implica (dispatcher/supervisor)
y el preview la detalla, pero es secundaria a la superficie de campo.

**Independent Test**: login como `supervisor@fieldops.test`, capturar en viewport escritorio (≥1024px)
en claro y oscuro; la estructura coincide con la sección «escritorio» del preview.

**Acceptance Scenarios**:

1. **Given** el supervisor en escritorio, **When** abre el listado, **Then** ve el topbar de oficina (marca, buscador, rol, avatar) y la cabecera de tabla del preview.
2. **Given** una orden seleccionada, **When** se muestra en el master-detail, **Then** su fila lleva la barra de acento a la izquierda y el fondo `accent-soft`, y el detalle aparece a la derecha.

---

### User Story 4 - Login y registro de ejecución fieles al preview (Priority: P3)

Como cualquier usuario veo el **login** con el hero centrado del preview (marca «F» en cuadrado naranja,
wordmark, tagline); como técnico, la pantalla de **registrar ejecución** con la rejilla de fotos (tiles
+ botón «+»), la píldora de requisito («✓ N fotos, mínimo 1») y el área de notas.

**Why this priority**: completan la réplica pero son pantallas puntuales; el valor central ya lo dan US1–US3.

**Independent Test**: capturar el login (sin auth) y, como técnico, la pantalla de registrar ejecución;
coinciden con las pantallas 01 y 04 del preview.

**Acceptance Scenarios**:

1. **Given** un usuario sin sesión, **When** abre la app, **Then** ve el login con el hero centrado del preview.
2. **Given** el técnico registrando ejecución, **When** hay ≥1 foto adjunta, **Then** la píldora de requisito muestra el estado «cumplido» como en el preview.

---

### Edge Cases

- **Tensión acento vivo vs. accesibilidad**: el naranja vivo `#DC5A24` bajo texto blanco da ~3.4:1, por
  debajo de WCAG 2.1 AA (4.5:1) para texto normal. **Resuelto (clarify 2026-07-16)**: se aplica **literal**
  con excepción AA documentada y justificada, acotada al acento-en-botón (ver FR-010 y Clarifications).
- **Tema oscuro**: cada token y componente replicado debe tener su equivalente oscuro fiel al preview.
- **`prefers-reduced-motion`**: cualquier transición nueva (p. ej. segmentado) respeta la reducción de movimiento.
- **Responsive por viewport (no por rol)**: el layout depende del ancho (`<1024`=apilado, `≥1024`=master-detail), no del rol (FR-011). En el viewport que el artifact no dibuja, la fidelidad es "coherencia con el lenguaje de diseño", no literal (FR-011a). Los roles y su RBAC no cambian con el ancho.
- **Estados vacío/carga/error**: las vistas replicadas conservan sus estados no-felices actuales (no se rompen por el reskin).
- **Disciplina de design system**: cero hex/px/font sueltos en vistas; todo por token (Constitution §Design System).

## Requirements *(mandatory)*

> EARS adaptado a una feature de **presentación**: el "sistema" es el front y el "resultado medible" es
> lo que se renderiza (verificable por captura y/o token computado), no un código HTTP.

### Functional Requirements

- **FR-001**: WHEN se renderiza cualquier vista THE front SHALL usar los tokens neutros del preview: **fondo de página** `#F4F6F8` (claro) / `#0E141A` (oscuro) — no blanco puro; **superficie** `#FFFFFF`/`#18212B`; **superficie-2** `#EDF0F3`/`#212C38`. Valores computables (`getComputedStyle`).
- **FR-002**: THE front SHALL definir el acento vivo como token (`#DC5A24` claro / `#FF7A45` oscuro) y aplicarlo en las superficies de acento del preview: **marca «F», anillo de foco, barra/selección de fila** y **botones primarios** (su color de fondo lo fija FR-010). El **paso actual del stepper NO usa el acento vivo**: es morado (ver FR-006), fiel al artifact. (El «kicker» del artifact es recurso de la página de exploración, no de la app → N/A, ver plan.) Enumeración cerrada: ninguna otra superficie usa el acento vivo.
- **FR-003**: THE front SHALL renderizar los chips de estado con la paleta del preview (primer plano / fondo), en claro y oscuro, cada uno con un **punto de color** (indicador `::before`):
  - `draft`: `#64748B`/`#EAEDF1` (osc. `#94A3B4`/`#26313D`)
  - `assigned`: `#2563EB`/`#E4ECFD` (osc. `#6FA0FF`/`#1E2A44`)
  - `in_progress` (teal): `#0E7C9B`/`#DEF0F5` (osc. `#4FC2DE`/`#123039`)
  - `pending_review`: `#7C3AED`/`#EDE6FC` (osc. `#B896FF`/`#2A2140`)
  - `closed`: `#178A4E`/`#DDF1E5` (osc. `#4FC98A`/`#12321F`)

  El **punto** (`::before`) usa `currentColor` (el primer plano del propio chip), como en el artifact — sin token propio.
  **Desviación documentada (implementación)**: los primeros planos literales del artifact para `draft`/`assigned`/`in_progress`/`closed` en **tema claro** quedan por debajo de AA de texto (4.05/4.36/4.09/3.72:1). Como el chip es **texto** (etiqueta de estado) y AA es objetivo de constitución —y la única excepción AA acordada se acota al **botón** (FR-010)—, esos 4 primeros planos se **oscurecen mínimamente (mismo tono)** hasta ≥4.5:1; fondos, tema oscuro y `pending_review` quedan **literales**. Es fidelidad «hasta donde AA lo permite» en el texto de estado; sujeto a la aprobación humana de fidelidad (SC-001).
  El token `--status-pending_review-bg` (= `#EDE6FC` claro / `#2A2140` oscuro), del que dependen el halo del stepper (FR-006) y la tarjeta IA (FR-016), queda así fijado. Todos los valores son computables (`getComputedStyle`) para PASS/FAIL de SC-002.
- **FR-004**: THE front SHALL usar como tokens los bordes del preview (`#E1E6EB` claro / `#2A3744` oscuro), los radios (`--radius-sm` = **9px**, `--radius-md` = **14px**) y las sombras del preview (`--shadow-1` = `0 1px 2px rgba(16,24,32,.05), 0 8px 24px rgba(16,24,32,.06)`) en tarjetas, campos y contenedores. Cada valor es computable (`getComputedStyle`) para PASS/FAIL.
- **FR-005**: WHEN el técnico abre «Mis órdenes» THE front SHALL mostrar el control segmentado «Activas/Todas» y tarjetas de orden con la maquetación del preview (código mono, chip, nombre, cliente, técnico). El **segmento activo** es una **píldora de superficie** (`--color-surface` + `--shadow-1` + texto `--color-text`), fiel al artifact — **no** usa el acento vivo.
- **FR-005a**: WHEN el usuario alterna el segmentado «Activas/Todas» THE front SHALL **filtrar en cliente** las órdenes ya cargadas — «Activas» oculta las `closed`; «Todas» las muestra — sin llamada adicional al backend (en esta fase).
- **FR-005b**: THE front SHALL usar «Activas» como pestaña **por defecto** y distinguir **tres** estados vacíos: **sin órdenes** (el backend no devolvió ninguna); **sin órdenes activas** (hay órdenes pero todas `closed` → sugerir «Todas»); y **sin coincidencias** (hay órdenes pero ninguna casa con el término → sugerir limpiar la búsqueda). **Precedencia** (FR-011b): si hay término de búsqueda activo, prevalece **sin coincidencias**; sin término, aplican **sin órdenes** / **sin órdenes activas**. El estado «sin coincidencias» solo se da donde el buscador está visible (el término se limpia al ocultarse).
- **FR-006**: WHEN se abre el detalle de una orden THE front SHALL mostrar el stepper del preview con el paso actual resaltado por un **halo = anillo `box-shadow: 0 0 0 4px` con el token `--status-pending_review-bg`** (valor computable), y las secciones de notas y evidencia con **miniaturas de relación 4/3** y `--radius-sm`. El color del paso actual es el **morado `pending_review`** (`#7C3AED`/`#B896FF`), no el acento vivo; **sustituye** el naranja que FE-7/021 había puesto en `.stepper__step--current .stepper__dot`, para ser fiel al artifact. Este morado es **fijo** (color propio del resaltado del stepper), **independiente del estado de la orden**; los colores por estado de FR-003 aplican a los **chips**, no al punto del stepper. Los tres estados del paso tienen valor: **done** = verde `--color-success`/token `closed` (`#178A4E`/`#4FC98A`); **current** = morado `pending_review` con halo; **pending/futuro** = `--color-surface-2` con borde `--color-border` (como el artifact).
- **FR-007**: WHEN un dispatcher o supervisor usa la app en escritorio (≥1024px) THE front SHALL mostrar el layout master-detail de oficina del preview: topbar (marca, buscador, rol, avatar), cabecera de tabla (Código/Orden/Cliente/Estado) y fila seleccionada con barra de acento + fondo `accent-soft`.
- **FR-007c**: WHEN un filtro (segmento o búsqueda) elimina de la lista la orden **seleccionada** en el master-detail THE front SHALL **mantener** esa orden en el panel de detalle (sus datos siguen siendo válidos) con una **nota discreta** de que queda fuera del filtro actual, hasta que el usuario seleccione otra o limpie el filtro. No se vacía el panel abruptamente.
- **FR-007a**: WHEN el usuario escribe en el buscador del topbar THE front SHALL **filtrar en cliente** las órdenes ya cargadas por **coincidencia de substring, insensible a mayúsculas y a acentos**, contra **los campos presentes en el payload del rol** de entre código, nombre de orden, cliente y técnico (una orden coincide si el término aparece en cualquiera de los disponibles; p. ej. el payload del técnico puede no incluir "técnico" —es él mismo—: se busca sobre los que haya), sin llamada adicional al backend (en esta fase).
- **FR-008**: WHEN el técnico está en «registrar ejecución» THE front SHALL mostrar la rejilla de evidencia (tiles + botón «+») y la píldora de requisito de fotos («✓ N, mínimo 1» / no cumplido) del preview.
- **FR-009**: WHEN un usuario sin sesión abre la app THE front SHALL mostrar el login con el hero centrado del preview: marca «F», wordmark, tagline, **los dos campos (email/usuario y contraseña) y el botón primario «Entrar»**, con la maquetación del preview.
- **FR-010**: THE front SHALL aplicar el acento vivo `#DC5A24` (claro) / `#FF7A45` (oscuro) con **texto blanco** en los **botones primarios**, de forma **literal al artifact** (~3.4:1), registrando una **excepción documentada y justificada al "objetivo" WCAG AA** acotada al acento-en-botón (el brief no exige AA; es "objetivo" de constitución y la fidelidad al artifact prima). La excepción se **materializa** como una supresión de regla de contraste **acotada y anotada** en la config de a11y (axe/vitest-axe) — con comentario que enlaza a FR-010 — de modo que la suite queda verde **sin** silenciar contraste en ningún otro elemento. Se somete al panel adversarial en G1.
- **FR-011**: THE front SHALL elegir el layout por **viewport, no por rol**: en `<1024px` layout apilado/tarjetas; en `≥1024px` master-detail/tabla. Cualquier rol puede estar en cualquier ancho (un técnico en escritorio ve master-detail; un supervisor en móvil ve apilado). La visibilidad de acciones NO cambia con el ancho (depende de rol+estado, FR-013).
- **FR-011b**: THE front SHALL exponer un **único estado de filtro en cliente**: un **segmento** «Activas/Todas» (default «Activas», oculta `closed`) y un **término de búsqueda** opcional. **Precedencia**: al introducir un término de búsqueda, el segmento **cambia automáticamente a «Todas»** (y se muestra así seleccionado), de modo que la búsqueda cubre todo el conjunto cargado (incl. `closed`) y el segmento **nunca queda inerte** ni oculta coincidencias; al borrar el término, el segmento vuelve a ser controlable por el usuario (queda en «Todas»). El **segmentado está siempre presente** (ambos anchos, siempre limpiable); el **buscador** es un añadido del topbar en master-detail (`≥1024px`) y su término **se limpia** al ocultarse (`<1024px`), de modo que nunca queda filtro invisible. No hay "segmentado contextual" distinto: las opciones son «Activas/Todas» en todos los casos.
- **FR-011a**: THE front SHALL renderizar **todas** las vistas **sin scroll horizontal** (criterio operable: `document.documentElement.scrollWidth ≤ clientWidth`) en **todo el rango soportado 360–1440px**, incluida la franja tablet (391–1023px, que usa el modo apilado). La **fidelidad literal** se juzga en el viewport nativo (técnico→móvil ≤390, oficina→escritorio ≥1024); tablet y el viewport contrario se rigen por coherencia de lenguaje + el aserto de no-scroll. **Fidelidad**: donde el artifact dibuja la vista (técnico→móvil, oficina→escritorio) la réplica es **literal**; en el viewport contrario, que el artifact **no dibuja**, la meta es **coherencia con el mismo lenguaje de diseño** (tokens + componentes ya definidos), no una fidelidad literal (no hay referencia). Preserva el conmutador de tema, sin regresión. En caso de discrepancia, **los breakpoints y el criterio de conmutación ya implementados (017) mandan** (`--bp-lg` 1024px); los modos adaptativos del artifact se aplican dentro de ellos (H-009).
- **FR-015**: THE front SHALL replicar únicamente las **vistas de app** del artifact; NO reproduce el andamiaje del mockup (marco de móvil, barra de status "9:41", chrome de navegador simulado, URL falsa), que es recurso de presentación del propio artifact.
- **FR-016**: THE front SHALL replicar el **estilo** de la tarjeta de resumen IA del preview usando el **mismo token morado que `pending_review`** (`#7C3AED` claro / `#B896FF` oscuro) para borde/cabecera y su fondo (`--status-pending_review-bg`), con la nota de guardián; muestra el **estado de runtime que ya provea** el feature de resumen (texto, vacío o "evidencia insuficiente"). La fidelidad se juzga por el aspecto de la tarjeta, no por la generación real de texto (gobernada por 006/018, fuera de alcance). La tarjeta se muestra **solo donde ya se muestra hoy** (revisión del supervisor, típicamente en `pending_review`), no en vistas de otros roles ni en estados donde hoy no aparece (S-003). En dev el proveedor IA puede no estar disponible: la captura de fidelidad se juzga contra el **chrome** de la tarjeta (borde/cabecera/nota), aceptando el estado vacío/"evidencia insuficiente" (H-007). El **gate por rol** de la tarjeta vive en el **render del panel de detalle** (condición de rol supervisor), NO se deriva del layout master-detail compartido entre roles (S-006).
- **FR-012**: THE front SHALL mantener la disciplina de design system: los valores del preview viven en tokens (`frontend/src/ui/`), sin hex/px/font sueltos en las vistas.
- **FR-013**: THE feature SHALL no modificar backend, contratos, endpoints ni lógica RBAC; las vistas consumen los contratos ya congelados y los estados/roles existentes.
- **FR-013a**: THE front SHALL mostrar cada acción (reasignar / iniciar-registrar ejecución / aprobar-rechazar) **solo** cuando el rol y el estado de origen la permiten, **según la misma lógica de visibilidad ya existente** (no la relaja ni la amplía). El control de acceso real sigue **en backend** (401/403); la visibilidad en UI es defensa en profundidad, no la única barrera. Replicar el preview NO renderiza acciones fuera de rol/estado.
- **FR-014**: WHEN se cierra la implementación THE equipo SHALL adjuntar capturas (Playwright MCP) de las 5 pantallas en claro y oscuro para la **aprobación humana de fidelidad** (checkpoint en G3/PR). La captura de **fidelidad literal** es en el viewport nativo de cada pantalla (técnico→móvil, oficina→escritorio); además, un **smoke-check** en el viewport **contrario** verifica solo «sin scroll horizontal» (no fidelidad literal, FR-011a). Las capturas usan **datos seed/sintéticos** (nunca PII real de cliente) y se adjuntan como artefactos del PR; no se retienen datos sensibles.

**Invariantes de datos/RBAC preservados (no cambian; el reskin no los relaja):**
- El conjunto de órdenes cargado ya viene **acotado por RBAC en backend** (rol + asignación/ámbito); el filtro en cliente (FR-005a/FR-007a) opera **solo dentro de ese conjunto** — no amplía visibilidad (S-004).
- Las miniaturas de evidencia siguen sirviéndose por **URL firmada efímera (≤300 s)**; el reskin **no** persiste/cachea la miniatura ni filtra la URL firmada en logs/consola del cliente (S-005).

*Nota:* **FR-010** resuelto en clarify (2026-07-16): acento literal con excepción AA documentada; el panel de G1 valida la justificación.

### Key Entities

*(No aplica: feature de presentación; no introduce entidades de datos nuevas. Las entidades Order/User y
el FSM draft→assigned→in_progress→pending_review→closed provienen del dominio ya existente.)*

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Cada una de las **5 pantallas** pasa una **checklist estructural objetiva** (presencia y jerarquía de los elementos clave del artifact — p. ej. login: marca+wordmark+tagline+2 campos+botón; detalle: stepper de 5 pasos + notas + evidencia + acciones; oficina: topbar+cabecera de tabla+fila seleccionada+detalle) verificable sobre el DOM/captura. La **aprobación humana de fidelidad** es el visto bueno cualitativo final y **la da el dueño del brief**, cuya decisión es **terminal** (si «rechazado», se itera y se vuelve a someter; no hay bucle infinito porque converge en el dueño). Ver rúbrica en la nota.
- **SC-002**: En **claro y oscuro**, los tokens base (fondo, superficie, borde), acento, radios/sombras y los **5 colores de estado** coinciden con los valores del preview (verificable por `getComputedStyle`). El contraste de texto se verifica **≥AA (4.5:1)** en todo, **salvo la excepción única y documentada de FR-010** (acento en botón primario, ~3.4:1), que queda explícitamente excluida del aserto.
- **SC-002a**: El acento vivo usado en **elementos no textuales** (anillo de foco y barra/selección de fila) cumple **WCAG 1.4.11 (contraste no-textual ≥3:1)** frente a la superficie adyacente, en claro y oscuro: claro `#DC5A24` sobre `--color-surface` `#FFFFFF` ≈3.4:1; oscuro `#FF7A45` sobre `--color-surface` `#18212B` (ratio exacto ≥3:1 medido por el test de contraste, contra esa superficie de referencia). Independiente de la excepción AA de texto de FR-010.
- **SC-003**: **0** ocurrencias de hex/px/font sueltos introducidos en vistas (lint de estilos verde: `stylelint` + regla de tokens).
- **SC-004**: **0 regresiones** en la suite del front (`tsc`, `eslint`, `stylelint`, `build`, `vitest` incl. axe) respecto a la línea base. La regla de contraste de axe se mantiene activa; la **única** supresión permitida es la de FR-010 (botón primario), acotada y anotada — cualquier otro fallo de contraste es regresión. La **captura de fidelidad** se toma sobre el mismo pipeline de estilos que producción (mismos tokens; ninguna purga/minificación altera valores de token); si el build de prod divergiera visualmente del dev aprobado, es regresión.
- **SC-005**: La excepción AA de FR-010 queda **documentada y trazable** (motivo + alcance + contraste medido ~3.4:1 + supresión anotada en la config de a11y), lista para el panel de G1.
- **SC-006**: Alcance verificado sobre el diff final: únicos ficheros de producción tocados = frontend (`src/ui/**`, `src/features/**` `.css`/`.tsx` de presentación) + config de a11y/tests; **0** backend/contracts/domain; **0** cambios de lógica RBAC.

> **Rúbrica de fidelidad (SC-001)**: PASS de una pantalla = (a) checklist estructural completa (todos los elementos clave presentes y en la jerarquía del artifact) + (b) SC-002/SC-003 en verde para esa pantalla + (c) sin scroll horizontal en móvil y escritorio (FR-011a). El juicio humano solo decide el "se ve como el artifact" global una vez (a)(b)(c) pasan; desviaciones de espaciado/posición menores no bloquean si la estructura y los tokens son correctos.

> Verificación **determinista + visual** (no promptfoo: sin componente IA en esta feature): herramientas
> del front (tsc/eslint/stylelint/build/vitest+axe) + capturas Playwright MCP con aprobación humana. El
> gate **G3** falla si hay regresión, estilos sueltos, o la fidelidad no se aprueba.

## Assumptions

- El usuario quiere **fidelidad literal** al preview. Decidido en clarify (FR-010): acento vivo literal en botones con **excepción AA documentada y acotada**; el panel de G1 valida la justificación. El "objetivo" AA se mantiene para todo lo demás.
- El **brief** (`docs/00-brief-original.md`) no especifica color/contraste/accesibilidad; WCAG 2.1 AA es un **"objetivo"** de la constitución, no un requisito del brief. La estructura del preview deriva del brief (roles + FSM) y de los contratos.
- El resumen IA del supervisor está gobernado por features **006/018** (dev-only) y queda **fuera de alcance**; en las vistas se replica su presentación con el contenido/estado que ya exista.
- El backend, los contratos y el RBAC **no cambian**; se reutiliza la sesión y los endpoints existentes.
- La verificación visual se hace con la app corriendo en modo dev (`make dev`, HMR) y Playwright MCP.
- El tema claro/oscuro y el responsive ya implementados (017) son la base sobre la que se ajusta la fidelidad.
- **Fuera de alcance (fase de mejora futura)**: **paginación** de listados (probablemente backend, cursor — estándar de la constitución). En esta fase el filtrado del segmentado «Activas/Todas» y del buscador de oficina es **en cliente** sobre las órdenes ya cargadas; se asume un volumen manejable sin paginar.
- **Completitud del filtro cliente (H-003)**: el listado actual (`listOrders`) devuelve el conjunto por rol **sin paginación de servidor** en esta fase; por tanto «Todas» y la búsqueda operan sobre el conjunto completo. Si en el futuro el endpoint pagina, el filtrado deberá moverse a servidor (queda anotado con la deuda de paginación).
