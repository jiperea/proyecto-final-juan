# Feature Specification: Order — entidad y listado por rol (Fundación B-1)

**Feature Branch**: `002-order-entity-listado`

**Created**: 2026-07-11

**Status**: Draft

**Input**: Feature 002a (roadmap) — read-side de la Fundación B: entidad `Order` + datos semilla +
listado de órdenes filtrado por rol, sobre el RBAC de 001. Slice pequeño (Principio XV): SOLO lectura;
transiciones de estado y auditoría van en 002b; creación/alta de órdenes fuera de alcance del proyecto.

## Clarifications

### Session 2026-07-11

- Q: Regla determinista de alcance del **dispatcher** (qué órdenes "reasignables" ve). → A: ve las órdenes
  en estado **`assigned` o `in_progress`** (trabajo activo que puede reasignar); es rol de gestión, **no**
  filtra por pertenencia (`assigned_to`). Determinista y semilla-testeable.
- Q: **Paginación** del listado. → A: **ninguna en 002a** (devuelve el conjunto completo del alcance del rol;
  volumen semilla pequeño). La paginación se difiere a cuando el volumen lo exija (no es de este slice, XV).
- Q: **Orden por defecto** del listado. → A: **`created_at` descendente** (más recientes primero), estable.

**Cierres del gate G1 (mismo día):**

- Q: ¿`version` (concurrencia optimista) se diseña en 002a? → A: **Sí** — columna `version` en `Order` ahora
  (Const. v1.5.1); comportamiento If-Match→409 stretch en 003/004 (H-001, BLOQUEANTE cerrado).
- Q: ¿Qué dispara el 403 si los 3 roles pueden listar? → A: **default-deny por allowlist**; rol fuera del
  allowlist → 403 (verificable a nivel de política, sin usuario semilla) (S-001/H-004).
- Q: ¿Alcance del technician acotado por estado? → A: **sí**, solo activas (`assigned`/`in_progress`/
  `pending_review`), excluye `draft` y `closed` (H-003).
- Q: ¿`draft` en el listado? → A: **no** aparece para ningún rol en 002a (H-002).
- Q: ¿`assigned_to` en la respuesta? → A: **UUID opaco**, sin resolver nombre (H-008).
- Q: ¿Desempate de orden? → A: `created_at` desc, **`id` desc** como tiebreak (T-001/H-009).
- Q: ¿Query params? → A: **ninguno afecta al alcance**; se ignoran y nunca amplían (S-005/H-007).
- Q: ¿Dónde vive la regla rol→alcance? → A: **una función de política de dominio** reutilizable (H-006).

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
5. **Given** un principal cuyo rol **no está en el allowlist** de `orders:list` (rol no reconocido /
   default-deny), **When** llama a `GET /v1/orders`, **Then** recibe **403** (fail-secure), no 200 vacío.

### Edge Cases

- Un rol con **cero** órdenes en su alcance → 200 con lista vacía (no 404).
- Un technician **no** puede ver órdenes de otro technician ni añadiendo `?assigned_to=otro` / `?status=…`
  (los parámetros se ignoran y nunca amplían el alcance — FR-015).
- Órdenes en estado `draft` **no** aparecen en el listado de **ningún** rol en 002a (invisibles hasta que
  exista alta/transición; se siembra ≥1 `draft` para verificar que queda excluida).
- Cuenta `disabled` o sesión revocada → 401 (reutiliza la validación por-request de 001, FR-004c).
- `assigned_to` se expone como **UUID opaco**; la respuesta no resuelve nombre/username de terceros (H-008).
- La respuesta **no** expone campos internos; el texto libre `title`/`description` no se vuelca a logs (FR-017).

## Requirements *(mandatory)*

### Functional Requirements (EARS)

- **FR-001**: WHEN un usuario autenticado solicita `GET /v1/orders`, THE sistema SHALL responder 200 con la
  lista de órdenes **filtrada por la regla de alcance de su rol**.
- **FR-002**: WHERE el rol es `technician`, THE sistema SHALL incluir **únicamente** las órdenes con
  `assigned_to == usuario_actual` **y `status` ∈ {`assigned`, `in_progress`, `pending_review`}** (órdenes
  activas; excluye `draft` y `closed` para acotar el crecimiento — H-003). Ninguna orden ajena.
- **FR-003**: WHERE el rol es `supervisor`, THE sistema SHALL incluir **únicamente** las órdenes en estado
  `pending_review`.
- **FR-004**: WHERE el rol es `dispatcher`, THE sistema SHALL incluir **únicamente** las órdenes en estado
  **`assigned` o `in_progress`** (reasignables), sin filtrar por `assigned_to` (rol de gestión).
- **FR-005**: IF la petición no está autenticada (sin access válido / sesión revocada / cuenta disabled),
  THEN THE sistema SHALL responder **401** uniforme (mismo status y mismo cuerpo `{code,message}` para todas
  las causas, reutilizando la uniformidad de 001), sin filtrar datos.
- **FR-006** *(default-deny, S-001/H-004)*: THE autorización de `orders:list` SHALL basarse en un **allowlist**
  explícito `{dispatcher, technician, supervisor}`; IF el principal no está en el allowlist (rol no reconocido /
  no concedido), THEN THE sistema SHALL responder **403** (fail-secure, no lista vacía). Verificable a nivel de
  política (un rol fuera del allowlist → 403) sin requerir un usuario semilla de ese rol.
- **FR-007**: THE sistema SHALL devolver por cada orden **solo los campos públicos**: `id`, `title`,
  `description`, `status`, `assigned_to`, `version`, `created_at`, `updated_at`. `assigned_to` SHALL ser el
  **UUID opaco** del usuario (NUNCA nombre/username/email — sin resolución que exponga PII de terceros, H-008).
- **FR-008**: THE filtrado por rol SHALL aplicarse en el **backend** como condición **obligatoria** de la
  consulta; ningún parámetro de entrada puede **ampliar** el alcance del rol (el filtro de rol se aplica
  siempre en AND y nunca es sobrescribible por el cliente).
- **FR-009**: WHEN no hay órdenes en el alcance del rol, THE sistema SHALL responder 200 con lista **vacía**.
- **FR-010**: THE entidad `Order` SHALL persistir `status` como enum
  `draft | assigned | in_progress | pending_review | closed` **como dato** (sin transiciones aquí), con
  `assigned_to` opcional (FK→User) y una columna **`version`** (entero, concurrencia optimista) **diseñada
  ahora** (comportamiento If-Match→409 stretch en 003/004; Constitution v1.5.1 "diseña la base para no
  reescribirla", H-001). Base-ready para que 002b añada la FSM y la **tabla de auditoría append-only**
  (referenciando `Order.id`) **sin ALTER destructivo** sobre `orders`.
- **FR-011**: THE errores SHALL seguir el contrato accionable `{ code, message, details?, agent_action? }` y
  la observabilidad (correlation-id, logs sin PII) de 001.
- **FR-012**: THE listado SHALL ordenarse por `created_at` **descendente** con **`id` descendente como
  desempate** (determinista y reproducible ante `created_at` iguales — T-001/H-009).
- **FR-013**: THE endpoint `GET /v1/orders` SHALL devolver el **conjunto completo** del alcance del rol
  **sin paginación** en esta feature (paginación diferida — fuera de 002a).
- **FR-014** *(contrato/auth, S-002)*: THE `GET /v1/orders` SHALL usar **`bearerAuth`** (el mismo middleware
  `authenticate` de 001) con el orden **auth(401) → autorización(403)**; el contrato **OpenAPI 3.1** del
  endpoint se define contract-first en `/plan` (coherente con `me`/`rbacProbe` de 001).
- **FR-015** *(sin superficie de query, S-005/H-007)*: THE `GET /v1/orders` en 002a **no acepta parámetros de
  consulta** que afecten al alcance; cualquier parámetro no reconocido SHALL **ignorarse** y NUNCA ampliar el
  alcance del rol (test: `?assigned_to=otro` / `?status=closed` no cambian el resultado del technician).
- **FR-016** *(política centralizada, H-006/Principio IV)*: LA regla rol→alcance SHALL vivir en **una única
  función de política de dominio** (p. ej. `orderScopeFor(role)`), fuente de verdad reutilizable por 003/004/005
  (no re-implementada ad-hoc por feature).
- **FR-017** *(PII en texto libre, S-003/S-004)*: THE `title`/`description` de `Order` (texto libre que puede
  contener PII de cliente) NUNCA SHALL serializarse a logs; la redacción de 001 (FR-014) se **extiende** a estos
  campos. La minimización de contenido por rol queda **fuera de 002a** (declarada en backlog).

### Key Entities

- **Order**: `id` (UUID v7), `title`, `description`, `status` (enum arriba, como dato), `assigned_to`
  (FK→User, nullable), **`version`** (entero ≥0, concurrencia optimista — diseñada ahora, H-001/Const. v1.5.1),
  `created_at`, `updated_at`. Base-ready para que 002b añada FSM + **tabla de auditoría append-only**
  (que referenciará `Order.id`) sin ALTER destructivo.

## Success Criteria *(mandatory)*

- **SC-001**: El 100% de los casos por rol (technician/dispatcher/supervisor) devuelve **exactamente** el
  subconjunto esperado con los datos semilla (0 falsos positivos / 0 fugas de órdenes ajenas).
- **SC-002**: `GET /v1/orders` responde con **P95 < 300 ms** (server-side, método D9 de 001: N≥200,
  warm-up descartado) contra un dataset semilla de **≥30 órdenes** repartidas por rol/estado (tamaño fijado
  para reproducibilidad — T-004).
- **SC-003**: 401 (no autenticado) y 403 (default-deny) son deterministas; el **401 es uniforme de contenido**
  (mismo `{code,message}` entre causas: sin token / sesión revocada / disabled), sin oráculo de datos (T-003).
- **SC-004**: Un technician **nunca** recibe una orden ajena en ningún caso de prueba (incl. intentos de
  forzar la consulta).

## Scope

**Dentro**: entidad `Order` (persistencia + campos públicos), datos semilla por rol/estado, endpoint
`GET /v1/orders` con filtrado por rol/pertenencia sobre el RBAC de 001, contrato OpenAPI del listado,
errores accionables + observabilidad reutilizados.

**Fuera** (otras features): transiciones de estado / FSM y **tabla de auditoría append-only** (**002b** —
referenciará `Order.id`; 002a deja el ancla estable y la columna `version`, sin ALTER destructivo),
reasignación (003), iniciar/registrar ejecución + evidencia (004), aprobar/rechazar (005), resumen IA (006),
creación/alta inicial de órdenes (fuera de alcance del proyecto), **minimización/redacción de contenido de
`title`/`description` por rol** (backlog), multi-tenant.

## Assumptions

- Todas las decisiones de alcance/orden/estado quedan **congeladas** en `## Clarifications` (incl. cierres de G1).
- Reutiliza toda la infraestructura de 001 (auth, RBAC, error-mapper, logger, config, Postgres/Prisma).
- El texto libre `title`/`description` puede contener PII de cliente: en 002a **no se registra en logs**
  (FR-017); la minimización de contenido por rol se difiere (backlog, no bloquea 002a).
- Órdenes `draft` semilla tienen `assigned_to = null` (no se asignan por adelantado); por eso ningún rol las
  lista en 002a. La visibilidad de `draft` se resolverá cuando exista alta/creación (fuera de alcance).
