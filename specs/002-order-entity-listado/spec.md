# Feature Specification: Order — entidad y listado por rol (Fundación B-1)

**Feature Branch**: `002-order-entity-listado`

**Created**: 2026-07-11

**Status**: Draft

**Input**: Feature 002a (roadmap) — read-side de la Fundación B: entidad `Order` + datos semilla +
listado de órdenes filtrado por rol, sobre el RBAC de 001. Slice pequeño (Principio XV): SOLO lectura;
transiciones de estado y auditoría van en 002b; creación/alta de órdenes fuera de alcance del proyecto.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ver mis órdenes según mi rol (Priority: P1)

Un usuario autenticado consulta el listado de órdenes y ve **solo** las que le competen según su rol, sin
poder ver las de otros ámbitos aunque manipule la petición.

**Why this priority**: es el valor demostrable de este slice ("veo mis órdenes según mi rol") y la base de
lectura sobre la que 003/004/005 construirán las acciones. Es el MVP de la Fundación B.

**Independent Test**: con datos semilla, autenticarse como technician / dispatcher / supervisor y llamar a
`GET /v1/orders`; cada rol recibe exactamente su subconjunto; sin token → 401.

**Acceptance Scenarios**:

1. **Given** un technician autenticado con órdenes asignadas a él y otras asignadas a otros, **When** pide
   `GET /v1/orders`, **Then** recibe 200 con **solo** las órdenes cuyo `assigned_to` es él (ninguna ajena).
2. **Given** un supervisor autenticado, **When** pide `GET /v1/orders`, **Then** recibe 200 con **solo** las
   órdenes en estado `pending_review`.
3. **Given** un dispatcher autenticado, **When** pide `GET /v1/orders`, **Then** recibe 200 con **solo** las
   órdenes reasignables (según la regla de alcance del dispatcher).
4. **Given** una petición sin credenciales válidas, **When** llama a `GET /v1/orders`, **Then** recibe 401
   (uniforme, sin revelar datos).
5. **Given** un usuario cuyo rol no tiene permiso de listado, **When** llama a `GET /v1/orders`, **Then**
   recibe 403 (autenticado sin permiso), no 200 vacío.

### Edge Cases

- Un rol con **cero** órdenes en su alcance → 200 con lista vacía (no 404).
- Un technician **no** puede ver órdenes de otro technician ni forzando parámetros de consulta.
- Cuenta `disabled` o sesión revocada → 401 (reutiliza la validación por-request de 001, FR-004c).
- La respuesta **no** expone campos internos ni PII de otros usuarios; solo los campos públicos de `Order`.

## Requirements *(mandatory)*

### Functional Requirements (EARS)

- **FR-001**: WHEN un usuario autenticado solicita `GET /v1/orders`, THE sistema SHALL responder 200 con la
  lista de órdenes **filtrada por la regla de alcance de su rol**.
- **FR-002**: WHERE el rol es `technician`, THE sistema SHALL incluir **únicamente** las órdenes con
  `assigned_to == usuario_actual` y ninguna otra.
- **FR-003**: WHERE el rol es `supervisor`, THE sistema SHALL incluir **únicamente** las órdenes en estado
  `pending_review`.
- **FR-004**: WHERE el rol es `dispatcher`, THE sistema SHALL incluir **únicamente** las órdenes reasignables
  según la regla de alcance del dispatcher (determinista y semilla-testeable).
- **FR-005**: IF la petición no está autenticada (sin access válido / sesión revocada / cuenta disabled),
  THEN THE sistema SHALL responder **401** uniforme, sin filtrar datos.
- **FR-006**: IF el rol autenticado no tiene permiso de listar órdenes, THEN THE sistema SHALL responder
  **403** (no una lista vacía), aplicado por el RBAC transversal (rechaza aunque se fuerce la petición).
- **FR-007**: THE sistema SHALL devolver por cada orden **solo los campos públicos**: `id`, `title`,
  `description`, `status`, `assigned_to`, `created_at`, `updated_at`; nunca PII de terceros ni campos internos.
- **FR-008**: THE filtrado por rol/pertenencia SHALL aplicarse en el **backend** (consulta), no en el cliente;
  un technician no obtiene órdenes ajenas ni manipulando parámetros de consulta.
- **FR-009**: WHEN no hay órdenes en el alcance del rol, THE sistema SHALL responder 200 con lista **vacía**.
- **FR-010**: THE entidad `Order` SHALL persistir `status` como enum
  `draft | assigned | in_progress | pending_review | closed` **como dato** (sin transiciones en esta feature),
  con `assigned_to` opcional (FK a usuario), diseñada **base-ready** para añadir en 002b la máquina de estados
  y la auditoría append-only **sin** migración destructiva.
- **FR-011**: THE errores SHALL seguir el contrato accionable `{ code, message, details?, agent_action? }` y
  la observabilidad (correlation-id propagado, logs sin PII) de 001.

### Key Entities

- **Order**: `id` (UUID v7), `title`, `description`, `status` (enum arriba, como dato), `assigned_to`
  (FK→User, nullable), `created_at`, `updated_at`. Base-ready para FSM + auditoría (002b).

## Success Criteria *(mandatory)*

- **SC-001**: El 100% de los casos por rol (technician/dispatcher/supervisor) devuelve **exactamente** el
  subconjunto esperado con los datos semilla (0 falsos positivos / 0 fugas de órdenes ajenas).
- **SC-002**: `GET /v1/orders` responde con **P95 < 300 ms** (server-side, método D9 de 001: N≥200,
  warm-up descartado) con el volumen de datos semilla.
- **SC-003**: 401 sin autenticación y 403 sin permiso son deterministas y uniformes (sin oráculo de datos).
- **SC-004**: Un technician **nunca** recibe una orden ajena en ningún caso de prueba (incl. intentos de
  forzar la consulta).

## Scope

**Dentro**: entidad `Order` (persistencia + campos públicos), datos semilla por rol/estado, endpoint
`GET /v1/orders` con filtrado por rol/pertenencia sobre el RBAC de 001, contrato OpenAPI del listado,
errores accionables + observabilidad reutilizados.

**Fuera** (otras features): transiciones de estado / FSM y auditoría append-only (**002b**), reasignación
(003), iniciar/registrar ejecución + evidencia (004), aprobar/rechazar (005), resumen IA (006),
creación/alta inicial de órdenes (fuera de alcance del proyecto), multi-tenant.

## Assumptions

- La "regla de alcance del dispatcher" (qué órdenes son reasignables) se fija de forma determinista con los
  datos semilla y se congelará en `/speckit-clarify` si hay ambigüedad; por defecto: órdenes en estados
  reasignables (p. ej. `assigned`) visibles al dispatcher.
- Reutiliza toda la infraestructura de 001 (auth, RBAC, error-mapper, logger, config, Postgres/Prisma).
- Paginación: por defecto simple/none dado el volumen semilla; se decidirá en clarify si se requiere.
