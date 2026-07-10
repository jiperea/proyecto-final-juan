# Feature Specification: [FEATURE NAME]

**Feature Branch**: `[###-feature-name]`

**Created**: [DATE]

**Status**: Draft

**Input**: User description: "$ARGUMENTS"

## User Scenarios & Testing *(mandatory)*

<!--
  IMPORTANT: User stories should be PRIORITIZED as user journeys ordered by importance.
  Each user story/journey must be INDEPENDENTLY TESTABLE - meaning if you implement just ONE of them,
  you should still have a viable MVP (Minimum Viable Product) that delivers value.

  Assign priorities (P1, P2, P3, etc.) to each story, where P1 is the most critical.
  Think of each story as a standalone slice of functionality that can be:
  - Developed independently
  - Tested independently
  - Deployed independently
  - Demonstrated to users independently
-->

### User Story 1 - [Brief Title] (Priority: P1)

[Describe this user journey in plain language]

**Why this priority**: [Explain the value and why it has this priority level]

**Independent Test**: [Describe how this can be tested independently - e.g., "Can be fully tested by [specific action] and delivers [specific value]"]

**Acceptance Scenarios**:

1. **Given** [initial state], **When** [action], **Then** [expected outcome]
2. **Given** [initial state], **When** [action], **Then** [expected outcome]

---

### User Story 2 - [Brief Title] (Priority: P2)

[Describe this user journey in plain language]

**Why this priority**: [Explain the value and why it has this priority level]

**Independent Test**: [Describe how this can be tested independently]

**Acceptance Scenarios**:

1. **Given** [initial state], **When** [action], **Then** [expected outcome]

---

### User Story 3 - [Brief Title] (Priority: P3)

[Describe this user journey in plain language]

**Why this priority**: [Explain the value and why it has this priority level]

**Independent Test**: [Describe how this can be tested independently]

**Acceptance Scenarios**:

1. **Given** [initial state], **When** [action], **Then** [expected outcome]

---

[Add more user stories as needed, each with an assigned priority]

### Edge Cases

<!--
  ACTION REQUIRED: The content in this section represents placeholders.
  Fill them out with the right edge cases.
-->

- What happens when [boundary condition]?
- How does system handle [error scenario]?

## Requirements *(mandatory)*

<!--
  ACTION REQUIRED: The content in this section represents placeholders.
  Fill them out with the right functional requirements.
-->

> **EARS OBLIGATORIO (Constitution V).** Cada FR se redacta en formato EARS y debe pasar el *test de la
> pregunta cero* (otro ingeniero lo implementa sin preguntar) y el test de las 2-implementaciones.
> Sintaxis: `WHEN [condición/disparador] THE [sistema] SHALL [acción] [resultado medible]`.
> Nada de términos sin cuantificar ("rápido", "seguro", "suficiente"): número + unidad, o delegado a un
> valor concreto. El auditor-spec-theater (gate G1) rechaza los FR que no cumplan.

### Functional Requirements

- **FR-001**: WHEN [condición] THE sistema SHALL [acción] [resultado medible / código de estado].
- **FR-002**: WHEN un [rol] intenta [acción no permitida] THE sistema SHALL rechazarla con 403 (401 si no autenticado).
- **FR-003**: WHILE [estado de la orden] THE sistema SHALL [invariante observable].
- **FR-004**: WHEN [entrada inválida: p. ej. foto no válida] THE sistema SHALL responder [4xx concreto] con `{code, message, agent_action}`.

*Marcado de requisitos poco claros (a resolver en `/speckit-clarify` + gate G1):*

- **FR-00X**: WHEN [...] THE sistema SHALL [...] [NEEDS CLARIFICATION: qué falta cuantificar].

### Key Entities *(include if feature involves data)*

- **[Entity 1]**: [What it represents, key attributes without implementation]
- **[Entity 2]**: [What it represents, relationships to other entities]

## Success Criteria *(mandatory)*

<!--
  ACTION REQUIRED: Define measurable success criteria.
  These must be technology-agnostic and measurable.
-->

### Measurable Outcomes

- **SC-001**: [Measurable metric, e.g., "Users can complete account creation in under 2 minutes"]
- **SC-002**: [Measurable metric, e.g., "System handles 1000 concurrent users without degradation"]
- **SC-003**: [User satisfaction metric, e.g., "90% of users successfully complete primary task on first attempt"]
- **SC-004**: [Business metric, e.g., "Reduce support tickets related to [X] by 50%"]

> Cada SC es **medible** (Constitution XIV). Un SC no medible no es válido. Se evalúan como métricas con
> **promptfoo** en G3 (ver sección Eval).

## Contrato (OpenAPI) *(obligatorio si hay endpoints — Constitution II)*

<!-- Contract-first: el contrato se escribe ANTES del código y es la única fuente de verdad. -->

- **Fichero de contrato**: `contracts/[nombre].openapi.yaml` (OpenAPI 3.1).
- **Endpoints** (operationId → método ruta → roles permitidos → códigos de respuesta):
  - `[operationId]` — `[MÉTODO] /[ruta]` — roles `[...]` — respuestas `200/4xx/...`
- **Esquemas** clave (con `enum` para estados; `snake_case` externo / `camelCase` interno en boundary).
- **Errores** con `{ code, message, details, agent_action }` y HTTP correcto (404/409/410/422/503).

## Trazabilidad (RF → endpoint → tarea → test) *(obligatorio — Constitution VI)*

| FR | Endpoint(s) | Tarea(s) | Test(s) |
|----|-------------|----------|---------|
| FR-001 | `operationId` | T0xx | `should ... when ...` |

> Cada FR debe llegar a un test nombrable. Un FR sin test no está "hecho". Se mantiene en `docs/traceability.md`.

## Eval de objetivos (promptfoo) *(obligatorio — Constitution XIV; y VIII si hay IA)*

- **SC → aserción**: cada SC medible se codifica como test(s) de promptfoo (`/evals/sc/[feature].yaml`).
- **Componente IA** (si aplica): golden cases + umbrales `faithfulness ≥ 0.90`, `tasa_alucinacion ≤ 0.05`,
  **no-fuga de PII**, y fallback "evidencia insuficiente → no inventa". (`/evals/ia-*/`.)
- El gate **G3** falla si algún SC obligatorio o umbral de eval no se cumple.

## Assumptions

<!--
  ACTION REQUIRED: The content in this section represents placeholders.
  Fill them out with the right assumptions based on reasonable defaults
  chosen when the feature description did not specify certain details.
-->

- [Assumption about target users, e.g., "Users have stable internet connectivity"]
- [Assumption about scope boundaries, e.g., "Mobile support is out of scope for v1"]
- [Assumption about data/environment, e.g., "Existing authentication system will be reused"]
- [Dependency on existing system/service, e.g., "Requires access to the existing user profile API"]
