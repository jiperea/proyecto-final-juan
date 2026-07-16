# Feature Specification: Fidelidad visual del front al preview de exploración

**Feature Branch**: `022-front-visual-fidelity-preview`

**Created**: 2026-07-16

**Status**: Draft

**Input**: User description: "Pase de fidelidad visual del front al artifact de exploración de diseño «FieldOps · Vistas mínimas del front». Objetivo: que el front se vea IGUAL que ese preview, de forma literal, en todas las pantallas (no solo colores)."

> **Fuente de verdad visual**: artifact de exploración `FieldOps · Vistas mínimas del front`
> (https://claude.ai/code/artifact/69806069-4e8c-4b96-832b-fae4d23b3abe). Esta feature es de
> **presentación (frontend)**: no crea ni cambia endpoints, IA, backend, contratos ni lógica RBAC;
> consume los mismos contratos ya congelados. Proporcionalidad (Constitution XV): alcance acotado a
> tokens + fidelidad de componentes/maquetación de las vistas existentes.

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
  debajo de WCAG 2.1 AA (4.5:1) para texto normal. ¿Se aplica literal en botones o se adapta de forma
  accesible? (ver FR-010 [NEEDS CLARIFICATION] y Assumptions).
- **Tema oscuro**: cada token y componente replicado debe tener su equivalente oscuro fiel al preview.
- **`prefers-reduced-motion`**: cualquier transición nueva (p. ej. segmentado) respeta la reducción de movimiento.
- **Responsive**: la conmutación campo (móvil) ↔ oficina (escritorio master-detail) se preserva en los breakpoints existentes.
- **Estados vacío/carga/error**: las vistas replicadas conservan sus estados no-felices actuales (no se rompen por el reskin).
- **Disciplina de design system**: cero hex/px/font sueltos en vistas; todo por token (Constitution §Design System).

## Requirements *(mandatory)*

> EARS adaptado a una feature de **presentación**: el "sistema" es el front y el "resultado medible" es
> lo que se renderiza (verificable por captura y/o token computado), no un código HTTP.

### Functional Requirements

- **FR-001**: WHEN se renderiza cualquier vista en tema claro THE front SHALL usar como fondo de página el token gris del preview (`#F4F6F8`) y no blanco puro; en tema oscuro, `#0E141A`.
- **FR-002**: THE front SHALL definir el acento vivo como token (`#DC5A24` claro / `#FF7A45` oscuro) y aplicarlo en las superficies de acento del preview (marca «F», foco, paso actual del stepper, barra/selección de fila, kicker).
- **FR-003**: THE front SHALL renderizar los chips de estado con la paleta del preview — `draft #64748B`, `assigned #2563EB`, `in_progress #0E7C9B` (teal), `pending_review #7C3AED`, `closed #178A4E` — cada uno con su fondo correspondiente y un **punto de color** (indicador previo).
- **FR-004**: THE front SHALL usar bordes claros (`#E1E6EB` claro / equivalente oscuro) y los radios/sombras del preview en tarjetas, campos y contenedores.
- **FR-005**: WHEN el técnico abre «Mis órdenes» en móvil THE front SHALL mostrar el control segmentado «Activas/Todas» y tarjetas de orden con la maquetación del preview (código mono, chip, nombre, cliente, técnico).
- **FR-006**: WHEN se abre el detalle de una orden THE front SHALL mostrar el stepper del preview con el paso actual resaltado (con halo), y las secciones de notas y evidencia (miniaturas) del preview.
- **FR-007**: WHEN un dispatcher o supervisor usa la app en escritorio (≥1024px) THE front SHALL mostrar el layout master-detail de oficina del preview: topbar (marca, buscador, rol, avatar), cabecera de tabla (Código/Orden/Cliente/Estado) y fila seleccionada con barra de acento + fondo `accent-soft`.
- **FR-008**: WHEN el técnico está en «registrar ejecución» THE front SHALL mostrar la rejilla de evidencia (tiles + botón «+») y la píldora de requisito de fotos («✓ N, mínimo 1» / no cumplido) del preview.
- **FR-009**: WHEN un usuario sin sesión abre la app THE front SHALL mostrar el login con el hero centrado del preview (marca «F», wordmark, tagline).
- **FR-010**: THE front SHALL aplicar el acento vivo en **botones con texto** [NEEDS CLARIFICATION: ¿fidelidad literal (`#DC5A24` con texto blanco, ~3.4:1, exige flexibilizar el "objetivo" AA de la constitución con justificación) o adaptación accesible que preserve el look (texto oscuro sobre el naranja / texto grande-bold que califique a 3:1)? Preferencia declarada del usuario: literal].
- **FR-011**: THE front SHALL preservar el comportamiento responsive (campo móvil ↔ oficina escritorio) y el conmutador de tema claro/oscuro ya existentes, sin regresión.
- **FR-012**: THE front SHALL mantener la disciplina de design system: los valores del preview viven en tokens (`frontend/src/ui/`), sin hex/px/font sueltos en las vistas.
- **FR-013**: THE feature SHALL no modificar backend, contratos, endpoints ni lógica RBAC; las vistas consumen los contratos ya congelados y los estados/roles existentes.
- **FR-014**: WHEN se cierra la implementación THE equipo SHALL adjuntar capturas (Playwright MCP) de las 5 pantallas del preview en claro y oscuro, cada una en su viewport de rol, para la **aprobación humana de fidelidad** (checkpoint en G3/PR).

*Requisito poco claro a resolver en `/speckit-clarify` + gate G1:* **FR-010** (tensión acento literal vs. AA).

### Key Entities

*(No aplica: feature de presentación; no introduce entidades de datos nuevas. Las entidades Order/User y
el FSM draft→assigned→in_progress→pending_review→closed provienen del dominio ya existente.)*

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Las **5 pantallas** del preview (login, lista móvil, detalle, registrar ejecución, escritorio master-detail) reproducen la estructura del artifact, verificado por captura y **aprobación humana de fidelidad** (aprobado/rechazado).
- **SC-002**: En **claro y oscuro**, los tokens base (fondo, superficie, borde), acento y los **5 colores de estado** coinciden con los valores del preview (verificable por `getComputedStyle` en un test).
- **SC-003**: **0** ocurrencias de hex/px/font sueltos introducidos en vistas (lint de estilos verde: `stylelint` + regla de tokens).
- **SC-004**: **0 regresiones** en la suite del front (`tsc`, `eslint`, `stylelint`, `build`, `vitest` incl. axe) respecto a la línea base actual.
- **SC-005**: La decisión de FR-010 (acento en botones) queda **documentada y trazable** (literal-con-justificación o adaptación accesible), con el contraste resultante medido y registrado.
- **SC-006**: Alcance verificado sobre el diff final: únicos ficheros de producción tocados = frontend (`src/ui/**`, `src/features/**` `.css`/`.tsx` de presentación); **0** backend/contracts/domain; **0** cambios de lógica RBAC.

> Verificación **determinista + visual** (no promptfoo: sin componente IA en esta feature): herramientas
> del front (tsc/eslint/stylelint/build/vitest+axe) + capturas Playwright MCP con aprobación humana. El
> gate **G3** falla si hay regresión, estilos sueltos, o la fidelidad no se aprueba.

## Assumptions

- El usuario quiere **fidelidad literal** al preview; su preferencia sobre FR-010 es aplicar el acento vivo tal cual, asumiendo que la tensión con el "objetivo" AA se resuelve en clarify/G1 (flexibilizar el objetivo con justificación o adaptar de forma accesible preservando el look).
- El **brief** (`docs/00-brief-original.md`) no especifica color/contraste/accesibilidad; WCAG 2.1 AA es un **"objetivo"** de la constitución, no un requisito del brief. La estructura del preview deriva del brief (roles + FSM) y de los contratos.
- El resumen IA del supervisor está gobernado por features **006/018** (dev-only) y queda **fuera de alcance**; en las vistas se replica su presentación con el contenido/estado que ya exista.
- El backend, los contratos y el RBAC **no cambian**; se reutiliza la sesión y los endpoints existentes.
- La verificación visual se hace con la app corriendo en modo dev (`make dev`, HMR) y Playwright MCP.
- El tema claro/oscuro y el responsive ya implementados (017) son la base sobre la que se ajusta la fidelidad.
