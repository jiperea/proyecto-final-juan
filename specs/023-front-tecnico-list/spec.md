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

- Q: ¿Cómo se muestra el «técnico» en la tarjeta? → A: **Condicional** sobre `Order.assigned_to` (`uuid | null`, verificado en el contrato): «Tú» si == `userId` de sesión; el **UUID opaco** si no coincide (el contrato no expone nombre); **neutra** si es nulo. Renderizar «Tú» incondicionalmente enmascararía un IDOR → la UI refleja el dato real.
- Q: ¿Qué contiene la sub-línea del detalle? → A: **No hay sub-línea** en esta feature: el contrato del detalle no expone cliente ni ubicación → la cabecera queda con **código + nombre**. (Si un contrato futuro añadiera contexto, iría en una sub-línea; hoy se omite, no se inventa.)
- Q: ¿Qué muestran los tiles de evidencia? → A: **«Imagen N»** (1-based). El contrato garantiza `count == content_types.length` (1:1) y `content_types` ∈ enum de **imágenes** → es honesto llamarlas «Imagen»; sin imagen real (contrato sin URL firmada).
- Q: ¿Literal vs honesto cuando chocan (el artifact usa datos de ejemplo)? → A: **Precedencia**: se replica la **estructura** de forma literal, pero el **contenido** es honesto — datos reales o placeholders explícitos, **nunca fabricados**. Ante conflicto, **gana lo honesto**.

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
2. **Given** una orden cuyo `assigned_to` **coincide** con el usuario en sesión, **When** se muestra su tarjeta, **Then** el técnico aparece como **«Tú»**; **si NO coincide**, aparece su **identificador** (nunca «Tú»); si es **nulo**, representación neutra.
3. **Given** que el contrato del listado no expone cliente, **When** se muestra la fila de meta, **Then** el cliente aparece como **«—»** (no se inventa dato).

---

### User Story 2 - Cabecera del detalle fiel al artifact (Priority: P1)

Como técnico o supervisor, al abrir una orden veo la **cabecera de detalle** del artifact: **código
monoespaciado** y **nombre**, en lugar de solo el título plano.

**Why this priority**: la cabecera ancla toda la pantalla de detalle; su ausencia es lo que más aleja el
detalle del artifact.

**Independent Test**: abrir el detalle de una orden como técnico y como supervisor; la cabecera muestra código
mono + nombre, con la maquetación de la pantalla 03 del artifact.

**Acceptance Scenarios**:

1. **Given** una orden abierta, **When** se renderiza el detalle, **Then** la cabecera muestra el **código monoespaciado** y el **nombre** con la maquetación del artifact.
2. **Given** que el contrato del detalle no expone cliente ni ubicación, **When** se renderiza la cabecera, **Then** **no** se muestra sub-línea de contexto (no se inventa; la sub-línea «cliente · ubicación» del artifact se omite por falta de dato).

---

### User Story 3 - Notas y evidencia del detalle fieles al artifact (Priority: P2)

Como técnico o supervisor, en el detalle veo las **notas** como una **tarjeta etiquetada** («Notas del
técnico») y la **evidencia** como un **bloque de miniaturas** (tiles), no como texto plano.

**Why this priority**: completa la fidelidad del detalle; secundaria a la cabecera.

**Independent Test**: abrir el detalle de una orden con notas y evidencia; las notas aparecen en tarjeta
etiquetada y la evidencia como tiles de relación 4/3, como el artifact.

**Acceptance Scenarios**:

1. **Given** una orden con `notes` de contenido no vacío, **When** se renderiza el detalle, **Then** las notas se muestran en una **tarjeta** etiquetada «Notas del técnico» (fondo surface + borde + radio + sombra), no como párrafo suelto; con `notes` vacío/ausente, **no** hay tarjeta.
2. **Given** una orden con evidencia `count` = N > 0, **When** se renderiza la sección, **Then** se muestran **N tiles** 4/3 numerados 1-based etiquetados «Imagen N» (enum de content_types = imágenes, `count==length`); con `count` = 0, se muestra «sin evidencia» y 0 tiles.

---

### Edge Cases

- **Meta sin datos**: cliente ausente (contrato) → «—»; `assigned_to` == usuario → «Tú»; `assigned_to` distinto → su identificador; `assigned_to` nulo → representación neutra (no «Tú»).
- **Notas presentes pero vacías**: `notes` = cadena vacía o solo espacios se trata como **ausente** → no se renderiza la tarjeta (presencia ≠ contenido útil).
- **Evidencia `count` = 0**: estado explícito **«sin evidencia»** y 0 tiles (comportamiento único; no se oculta la sección en silencio).
- **Estados del chip**: todos los estados del FSM (`draft`/`assigned`/`in_progress`/`pending_review`/`closed`) tienen token de chip definido en FE-8 → el render del chip está siempre definido para cualquier `status` que devuelva el listado.
- **Tema claro/oscuro y responsive por viewport** (heredados de FE-8) se preservan sin regresión.
- **Disciplina de design system**: 0 hex/px/font sueltos; se reutilizan los tokens de FE-8.

## Requirements *(mandatory)*

> EARS de presentación: el "sistema" es el front y el resultado medible es lo que se renderiza (verificable
> por DOM/captura), no un código HTTP. Reutiliza los tokens del design system de FE-8.

### Functional Requirements

- **FR-001**: WHEN el técnico ve una orden en la lista THE front SHALL renderizar la tarjeta del artifact: fila superior con **código monoespaciado** (`--font-mono`) + **chip de estado**, **nombre** debajo, y una **fila de meta**.
- **FR-002**: THE fila de meta SHALL mostrar el **cliente** — siempre **«—»** (el contrato no expone cliente) — y el **técnico**, resuelto **condicionalmente** sobre `Order.assigned_to` (`uuid | null`): **«Tú»** si `assigned_to` == `userId` de la sesión; el **UUID de `assigned_to`** (identificador opaco; el contrato no expone nombre) si no coincide; representación **neutra** si es `null`. El `userId` de la sesión se obtiene del **contexto de sesión ya existente** (`useSession`, consumido de solo-lectura; sin cambios en el módulo de auth). Cuando se muestra el UUID (caso anómalo, no «Tú»), se **trunca a forma corta** (p. ej. primeros 8 chars, monoespaciado, como el código) para **no desbordar** a ≤390px. La UI **no asume** que toda orden sea del usuario (refleja el dato, no enmascara un posible fallo de aislamiento en backend).
- **FR-003**: THE front SHALL **no inventar** datos ausentes del contrato (cliente, ubicación): usa placeholders explícitos («—») u omite el campo, nunca valores ficticios.
- **FR-004**: WHEN se abre el detalle de una orden THE front SHALL renderizar una **cabecera** con **código monoespaciado** y **nombre**, con la maquetación del artifact. **No** se renderiza sub-línea de contexto: el contrato del detalle no expone cliente ni ubicación (la sub-línea del artifact se omite por falta de dato, sin inventar).
- **FR-005**: WHEN el payload del detalle incluye `notes` con **contenido no vacío** (tras recortar espacios) THE front SHALL mostrarlas en una **tarjeta**: `<section>` con fondo `--color-surface`, borde `--color-border`, `--radius-md` y `--shadow-1`, con la etiqueta **«Notas del técnico»**, y el texto renderizado **escapado** (nunca HTML crudo). Si `notes` está ausente o vacío/solo-espacios, **no** se renderiza la tarjeta.
- **FR-006**: WHEN el payload del detalle incluye `evidence` con `count` = N (>0) THE front SHALL renderizar **N tiles placeholder** de relación **4/3** (`--radius-sm`), numerados **1-based**, apoyándose en la **invariante del contrato `count == content_types.length`** (mapeo 1:1: el tile `i` corresponde a `content_types[i-1]`). Como el enum de `content_types` es **solo imágenes** (`image/{jpeg,png,webp,heic}`), la etiqueta es **«Imagen N»** (1-based); no se construyen imágenes reales (el contrato no expone URL firmada ni binario). WHEN `count` = 0 THE front SHALL mostrar un **estado explícito «sin evidencia»** y **0** tiles (comportamiento único, sin ocultar la sección en silencio).
- **FR-007**: THE feature SHALL **no** modificar backend, contratos, endpoints ni lógica RBAC; la visibilidad de acciones por rol/estado del detalle no cambia respecto a FE-8.
- **FR-010**: THE detalle SHALL seguir siendo **server-authoritative**: se obtiene por su propia consulta al backend por `id`, que aplica el control de acceso existente (401/403/404 para órdenes fuera del rol/ámbito); esta feature **no** relaja ese control ni renderiza datos que el backend no devuelva para el rol. Las **notas** y cualquier dato de cliente se muestran **escapados** y **solo** si el backend los entrega al rol (misma exposición que hoy; sin nueva superficie de PII); no se añaden logs de esos datos.
- **FR-008**: THE front SHALL mantener la disciplina «token o nada» (sin hex/px/font sueltos) reutilizando los tokens de FE-8, y preservar tema claro/oscuro y responsive por viewport sin regresión.
- **FR-009**: WHEN se cierra la implementación THE equipo SHALL adjuntar capturas (Playwright MCP) de la lista del técnico (móvil) y del detalle (técnico y supervisor) en claro y oscuro, para la **aprobación humana de fidelidad**.

### Key Entities

*(No aplica: presentación; sin entidades nuevas. Order/estado provienen del dominio existente.)*

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: La **tarjeta de la lista** pasa una **checklist estructural objetiva** (presencia de: código mono, chip de estado, nombre, fila de meta con cliente y técnico), verificable por DOM; la **aprobación humana** de fidelidad es el visto bueno cualitativo final (dueño del brief, decisión terminal).
- **SC-002**: El **detalle** pasa la checklist estructural (cabecera código mono + nombre; tarjeta de notas etiquetada cuando hay contenido; N tiles 4/3 o «sin evidencia»), verificable por DOM; la aprobación humana cierra la fidelidad.

> **Rúbrica (SC-001/002)**: PASS de una pantalla = checklist estructural completa + SC-003/SC-005 verdes + sin scroll horizontal en su viewport. El juicio humano solo decide el «se ve como el artifact» una vez pasa lo objetivo; desviaciones menores de espaciado no bloquean si estructura y tokens son correctos.
- **SC-003**: **0** datos inventados: los campos ausentes del contrato aparecen como «—» u omitidos (verificable en test con payload sin cliente/ubicación).
- **SC-004**: **0 regresiones** en la suite del front (`tsc`, `eslint`, `stylelint`, `build`, `vitest` incl. axe) respecto a la línea base tras FE-8; `rbac-reskin-regression` verde.
- **SC-005**: **0** hex/px/font sueltos introducidos (stylelint + regla de tokens verde).
- **SC-006**: Alcance sobre el diff final: producción tocada solo en `frontend/src/features/orders/**` (+ `orders.css`) de presentación; se permite **importar de solo-lectura** el contexto de sesión existente (`features/auth/session`) sin modificarlo; **0** backend/contracts/domain; **0** cambios de RBAC.

> Verificación **determinista + visual** (sin IA → sin promptfoo): herramientas del front + capturas Playwright
> MCP con aprobación humana. El gate G3 falla si hay regresión, estilos sueltos, o datos inventados.

## Assumptions

- Los **tokens del design system** ya están establecidos por FE-8 (fondo, acento, chips, `--font-mono`, radios, sombras); esta feature los **consume**, no los redefine.
- **Contrato verificado** (`contracts/orders.openapi.yaml`): el **listado** devuelve `Order[]` donde `Order` incluye `assigned_to` (**UUID opaco `uuid | null`, sin nombre/PII**), `id`, `title`, `description`, `status`, timestamps — **no** hay campo cliente ni ubicación. El **detalle** (`OrderDetailResponse`) expone `order` (siempre) + `notes` (string, opcional; solo technician-dueño/supervisor) + `evidence` (`EvidenceMeta`: `count` + `content_types`, con **invariante `count == content_types.length`**, cada `content_type` ∈ enum de **imágenes** `image/{jpeg,png,webp,heic}`) — sin URL firmada ni binario. Fidelidad «honesta» con placeholders, sin tocar backend (invariante FE-8/013).
- La excepción AA del botón primario y la desviación de los 4 chips (claro) de FE-8 **siguen vigentes**; esta feature no las revisa.
- El backend, los contratos y el RBAC **no cambian**; se reutiliza la sesión y los endpoints existentes.
- Verificación visual con `make dev` (HMR) + Playwright MCP (requiere login del seed).
