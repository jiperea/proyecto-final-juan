# Feature Specification: Fidelidad de la lista del técnico y el detalle de orden (FE-9 · 023)

**Feature Branch**: `023-front-tecnico-list`

**Created**: 2026-07-16

**Status**: Draft

**Input**: Continuación de FE-8 (022): cerrar los detalles de fidelidad de la **tarjeta de la lista del técnico** (pantalla 02 del artifact) y del **detalle de orden** (técnico y supervisor, pantalla 03), que FE-8 dejó pendientes tras dejar el login perfecto.

> **Fuente de verdad visual**: artifact `FieldOps · Vistas mínimas del front`
> (https://claude.ai/code/artifact/69806069-4e8c-4b96-832b-fae4d23b3abe), pantallas **02 «Mis órdenes»** y
> **03 «Detalle de orden»**. Feature de **presentación (frontend)**: no crea/cambia endpoints, IA, backend,
> contratos ni RBAC; consume los contratos ya congelados y los tokens del design system establecidos en FE-8.
> Proporcionalidad (XV): acotada a 2 pantallas.

## Clarifications

### Session 2026-07-16 (decisiones por defecto informado — brief prescriptivo, sin ambigüedad crítica)

- Q: ¿Cómo se muestra el «técnico» en la tarjeta de la lista del técnico? → A: Siempre **«Tú»** — esta lista es la del propio técnico (todas sus órdenes son suyas); el caso «otro técnico» no aplica en esta vista.
- Q: ¿Qué contiene la sub-línea del detalle si el contrato no expone cliente/ubicación? → A: Solo los campos **con dato**; los ausentes se **omiten** (no se inventan). Si no hay ninguno, la cabecera queda con código + nombre.
- Q: ¿Qué muestran los tiles placeholder de evidencia? → A: Una etiqueta placeholder **«foto N»** (índice), como el artifact — es un marcador, no un dato inventado; no hay imagen real (contrato sin URL firmada).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Tarjeta de orden fiel al artifact en la lista (Priority: P1)

Como técnico en el móvil, cada orden de «Mis órdenes» se ve como la tarjeta del artifact: fila superior con
**código monoespaciado + chip de estado**, **nombre** de la orden debajo, y una **fila de meta** con cliente y
técnico.

**Why this priority**: es el gap más visible que quedó de FE-8 en la vista principal del técnico.

**Independent Test**: login `technician@fieldops.test` en móvil (≤390px); cada tarjeta muestra código, chip,
nombre y la fila de meta (cliente/técnico), coincidiendo con la pantalla 02 del artifact en claro y oscuro.

**Acceptance Scenarios**:

1. **Given** el técnico con órdenes, **When** abre la lista, **Then** cada tarjeta muestra la fila superior (código mono + chip), el nombre y una **fila de meta** con cliente y técnico.
2. **Given** una orden cuyo `assigned_to` es el usuario actual, **When** se muestra su tarjeta, **Then** el técnico aparece como **«Tú»**; si es otro, aparece su identificador.
3. **Given** que el contrato del listado no expone cliente, **When** se muestra la fila de meta, **Then** el cliente aparece como **«—»** (no se inventa dato).

---

### User Story 2 - Cabecera del detalle fiel al artifact (Priority: P1)

Como técnico o supervisor, al abrir una orden veo la **cabecera de detalle** del artifact: **código
monoespaciado**, **nombre** y una **sub-línea** de contexto, en lugar de solo el título.

**Why this priority**: la cabecera ancla toda la pantalla de detalle; su ausencia es lo que más aleja el
detalle del artifact.

**Independent Test**: abrir el detalle de una orden como técnico y como supervisor; la cabecera muestra código
mono + nombre + sub-línea, como la pantalla 03 del artifact.

**Acceptance Scenarios**:

1. **Given** una orden abierta, **When** se renderiza el detalle, **Then** la cabecera muestra el **código monoespaciado**, el **nombre** y una **sub-línea** con el contexto disponible.
2. **Given** que el contrato no expone cliente/ubicación en la sub-línea, **When** se renderiza, **Then** se muestra solo lo disponible sin inventar (campos ausentes se omiten, no se rellenan con datos falsos).

---

### User Story 3 - Notas y evidencia del detalle fieles al artifact (Priority: P2)

Como técnico o supervisor, en el detalle veo las **notas** como una **tarjeta etiquetada** («Notas del
técnico») y la **evidencia** como un **bloque de miniaturas** (tiles), no como texto plano.

**Why this priority**: completa la fidelidad del detalle; secundaria a la cabecera.

**Independent Test**: abrir el detalle de una orden con notas y evidencia; las notas aparecen en tarjeta
etiquetada y la evidencia como tiles de relación 4/3, como el artifact.

**Acceptance Scenarios**:

1. **Given** una orden con notas, **When** se renderiza el detalle, **Then** las notas se muestran en una **tarjeta** con la etiqueta del artifact, no como párrafo suelto.
2. **Given** una orden con evidencia de `count` N (el contrato no expone URL firmada), **When** se renderiza la sección de evidencia, **Then** se muestran **N tiles placeholder** de relación **4/3** (sin foto real), reflejando el recuento sin inventar imágenes.

---

### Edge Cases

- **Sin datos de meta**: cliente ausente (contrato) → «—»; `assigned_to` nulo → representación neutra (no «Tú»).
- **Detalle sin notas / sin evidencia**: si el payload no trae `notes`/`evidence`, esas secciones no se renderizan (por presencia), sin tarjetas vacías.
- **Evidencia con count 0**: no se muestran tiles (o estado explícito «sin evidencia»), no un bloque vacío.
- **Tema claro/oscuro y responsive por viewport** (heredados de FE-8) se preservan sin regresión.
- **Disciplina de design system**: 0 hex/px/font sueltos; se reutilizan los tokens de FE-8.

## Requirements *(mandatory)*

> EARS de presentación: el "sistema" es el front y el resultado medible es lo que se renderiza (verificable
> por DOM/captura), no un código HTTP. Reutiliza los tokens del design system de FE-8.

### Functional Requirements

- **FR-001**: WHEN el técnico ve una orden en la lista THE front SHALL renderizar la tarjeta del artifact: fila superior con **código monoespaciado** (`--font-mono`) + **chip de estado**, **nombre** debajo, y una **fila de meta**.
- **FR-002**: THE fila de meta SHALL mostrar el **cliente** (o **«—»** si el contrato no lo expone) y el **técnico**. En la lista del técnico (esta vista), el técnico es siempre el usuario en sesión → se representa como **«Tú»**.
- **FR-003**: THE front SHALL **no inventar** datos ausentes del contrato (cliente, ubicación): usa placeholders explícitos («—») u omite el campo, nunca valores ficticios.
- **FR-004**: WHEN se abre el detalle de una orden THE front SHALL renderizar una **cabecera** con **código monoespaciado** y **nombre**; y una **sub-línea** que muestra **solo** los campos de contexto con dato en el payload (cliente/ubicación si existieran), **omitiendo** los ausentes sin inventarlos (si no hay ninguno, la cabecera queda con código + nombre).
- **FR-005**: WHEN el payload del detalle incluye `notes` THE front SHALL mostrarlas en una **tarjeta etiquetada** (estilo «notas» del artifact), no como párrafo plano.
- **FR-006**: WHEN el payload del detalle incluye `evidence` con `count` = N (>0) THE front SHALL renderizar **N tiles placeholder** de relación **4/3** (usando `--radius-sm`), cada tile con una **etiqueta placeholder «foto N»** (índice), reflejando el recuento sin construir imágenes reales (el contrato no expone URL firmada); con `count` = 0 THE front SHALL mostrar un estado explícito «sin evidencia» y **0** tiles.
- **FR-007**: THE feature SHALL **no** modificar backend, contratos, endpoints ni lógica RBAC; la visibilidad de acciones por rol/estado del detalle no cambia respecto a FE-8.
- **FR-008**: THE front SHALL mantener la disciplina «token o nada» (sin hex/px/font sueltos) reutilizando los tokens de FE-8, y preservar tema claro/oscuro y responsive por viewport sin regresión.
- **FR-009**: WHEN se cierra la implementación THE equipo SHALL adjuntar capturas (Playwright MCP) de la lista del técnico (móvil) y del detalle (técnico y supervisor) en claro y oscuro, para la **aprobación humana de fidelidad**.

### Key Entities

*(No aplica: presentación; sin entidades nuevas. Order/estado provienen del dominio existente.)*

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: La **tarjeta de la lista** del técnico reproduce la estructura del artifact (código mono + chip + nombre + fila de meta con cliente/técnico), verificado por DOM/captura y **aprobación humana** de fidelidad.
- **SC-002**: El **detalle** reproduce cabecera (código mono + nombre + sub-línea), notas en tarjeta y evidencia en tiles 4/3, verificado por DOM/captura y aprobación humana.
- **SC-003**: **0** datos inventados: los campos ausentes del contrato aparecen como «—» u omitidos (verificable en test con payload sin cliente/ubicación).
- **SC-004**: **0 regresiones** en la suite del front (`tsc`, `eslint`, `stylelint`, `build`, `vitest` incl. axe) respecto a la línea base tras FE-8; `rbac-reskin-regression` verde.
- **SC-005**: **0** hex/px/font sueltos introducidos (stylelint + regla de tokens verde).
- **SC-006**: Alcance sobre el diff final: producción tocada solo en `frontend/src/features/orders/**` (+ `orders.css`) de presentación; **0** backend/contracts/domain; **0** cambios de RBAC.

> Verificación **determinista + visual** (sin IA → sin promptfoo): herramientas del front + capturas Playwright
> MCP con aprobación humana. El gate G3 falla si hay regresión, estilos sueltos, o datos inventados.

## Assumptions

- Los **tokens del design system** ya están establecidos por FE-8 (fondo, acento, chips, `--font-mono`, radios, sombras); esta feature los **consume**, no los redefine.
- El **contrato del listado** no expone cliente; el **detalle** solo expone `evidence.count`/`content_types` (sin URL firmada) → fidelidad «honesta» con placeholders, sin tocar backend (invariante de FE-8/013).
- La excepción AA del botón primario y la desviación de los 4 chips (claro) de FE-8 **siguen vigentes**; esta feature no las revisa.
- El backend, los contratos y el RBAC **no cambian**; se reutiliza la sesión y los endpoints existentes.
- Verificación visual con `make dev` (HMR) + Playwright MCP (requiere login del seed).
