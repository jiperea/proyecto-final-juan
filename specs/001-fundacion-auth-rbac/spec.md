# Feature Specification: Fundación — Autenticación, sesión y RBAC

**Feature Branch**: `001-fundacion-auth-rbac`

**Created**: 2026-07-10

**Status**: Draft

**Input**: Fundación A de FieldOps — autenticación, ciclo de sesión y control de acceso por rol (RBAC),
como base transversal sobre la que se construyen las features de dominio (Order, ejecución, revisión, IA).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Iniciar y cerrar sesión (Priority: P1)

Un usuario de FieldOps (dispatcher, technician o supervisor) se autentica con sus credenciales para
obtener acceso al sistema, y puede cerrar sesión de forma que su acceso deja de ser válido.

**Why this priority**: sin autenticación no hay forma de identificar al actor ni de aplicar RBAC; es el
cimiento de todo el resto de features.

**Independent Test**: se prueba de forma aislada creando un usuario semilla y ejerciendo login → acceso a
un recurso protegido → logout → el acceso deja de funcionar.

**Acceptance Scenarios**:

1. **Given** un usuario registrado con credenciales válidas, **When** hace login, **Then** obtiene una
   sesión válida y puede acceder a recursos protegidos acordes a su rol.
2. **Given** credenciales inválidas, **When** hace login, **Then** el sistema lo rechaza con un error de
   autenticación y no crea sesión.
3. **Given** una sesión activa, **When** el usuario hace logout, **Then** la sesión queda revocada y un
   intento posterior con esa sesión es rechazado.

---

### User Story 2 - Mantener la sesión (refresh) y expiración (Priority: P2)

El acceso de vida corta se renueva con un refresh mientras la sesión siga vigente; cuando la sesión
expira o se revoca, el usuario debe volver a autenticarse.

**Why this priority**: equilibra seguridad (acceso corto) y usabilidad (no re-login constante); necesario
para un uso realista.

**Independent Test**: con una sesión válida, renovar el acceso; luego revocar/expirar y comprobar que la
renovación y el acceso fallan.

**Acceptance Scenarios**:

1. **Given** una sesión vigente, **When** el usuario renueva el acceso, **Then** obtiene un nuevo acceso
   de vida corta sin volver a introducir credenciales.
2. **Given** una sesión caducada o revocada, **When** el usuario intenta renovar o acceder, **Then** el
   sistema responde "no autenticado" y exige nuevo login.

---

### User Story 3 - Control de acceso por rol (RBAC) (Priority: P1)

Cada acción/recurso solo es accesible por el rol autorizado; el backend rechaza la petición aunque se
fuerce (saltándose la interfaz), distinguiendo con claridad el tipo de rechazo.

**Why this priority**: es un requisito explícito del proyecto (RBAC en doble capa) y condición de
seguridad para todas las features de dominio.

**Independent Test**: con usuarios de cada rol, invocar directamente un recurso protegido de ejemplo y
verificar que solo el rol autorizado accede; el resto recibe el rechazo correcto.

**Acceptance Scenarios**:

1. **Given** un usuario no autenticado, **When** accede a un recurso protegido, **Then** recibe **401**.
2. **Given** un usuario autenticado sin permiso para la acción, **When** la intenta, **Then** recibe **403**.
3. **Given** un usuario autenticado que pide un recurso que no le pertenece/ve, **When** lo solicita por
   id, **Then** recibe **404** (no se revela su existencia).
4. **Given** cualquier usuario, **When** consulta "quién soy", **Then** el sistema devuelve su identidad
   y su rol.

---

### Edge Cases

- **Fuerza bruta en login**: tras N intentos fallidos en una ventana, la cuenta queda temporalmente
  bloqueada y los intentos se rechazan de forma uniforme.
- **Reutilización de refresh revocado**: un refresh ya usado/revocado es rechazado (no renueva).
- **Petición sin/– con token manipulado**: se rechaza con 401 sin filtrar detalles.
- **Config incompleta al arrancar**: el servicio no arranca (fail-fast) con un error claro.
- **Petición a recurso ajeno por id**: 404 uniforme (no 403) para no permitir enumeración.

## Requirements *(mandatory)*

> **EARS OBLIGATORIO (Constitution V).** *WHEN [condición] THE sistema SHALL [acción] [resultado medible]*.

### Functional Requirements

- **FR-001**: WHEN un usuario envía credenciales válidas al login THE sistema SHALL crear una sesión y
  devolver un **access token de vida corta** y un **refresh token** en cookie HttpOnly/SameSite=Strict.
- **FR-002**: WHEN un usuario envía credenciales inválidas THE sistema SHALL rechazar el login con **401**
  y un mensaje uniforme, sin crear sesión ni revelar si el usuario existe.
- **FR-003**: WHEN un usuario autenticado hace logout THE sistema SHALL **revocar** su refresh token, de
  modo que su reutilización posterior se rechace.
- **FR-004**: WHEN un usuario presenta un refresh token válido y vigente THE sistema SHALL emitir un nuevo
  access token sin requerir credenciales.
- **FR-005**: WHEN un refresh token está **caducado o revocado** THE sistema SHALL responder **401** y no
  emitir access token.
- **FR-006**: WHILE una sesión está activa THE sistema SHALL exponer un endpoint "me" que devuelve la
  identidad del usuario y su **rol** (dispatcher | technician | supervisor).
- **FR-007**: WHEN una petición a un recurso protegido llega sin autenticación válida THE sistema SHALL
  responder **401** (no autenticado).
- **FR-008**: WHEN un usuario autenticado intenta una acción **no permitida a su rol** THE sistema SHALL
  responder **403** (autenticado sin permiso).
- **FR-009**: WHEN un usuario autenticado solicita por id un recurso que su rol/alcance no puede ver THE
  sistema SHALL responder **404** (sin revelar existencia).
- **FR-010**: THE sistema SHALL aplicar la autorización en el **backend** (middleware centralizado), de
  modo que rechace la petición aunque se fuerce saltándose la interfaz.
- **FR-011**: WHEN se superan **N intentos de login fallidos** en la ventana configurada THE sistema SHALL
  **bloquear temporalmente** la cuenta y rechazar nuevos intentos de forma uniforme.
- **FR-012**: THE sistema SHALL emitir **cabeceras de seguridad** (HSTS, CSP y equivalentes) en todas las
  respuestas y aplicar **protección CSRF** en las operaciones que usan la cookie de refresh.
- **FR-013**: WHEN se produce cualquier error THE sistema SHALL responder con el **contrato de error**
  `{ code, message, details?, agent_action? }` y el código HTTP correcto (400/401/403/404/409/422/429/503).
- **FR-014**: THE sistema SHALL propagar un **correlation-id** por petición y registrarlo en el logging
  estructurado (sin PII).
- **FR-015**: THE sistema SHALL exponer `/health` (vivo) y `/ready` (listo, con dependencias) diferenciados.
- **FR-016**: WHEN el servicio arranca con configuración/entorno inválido o incompleto THE sistema SHALL
  **abortar el arranque** (fail-fast) con un mensaje claro, sin escuchar peticiones.

### Key Entities

- **Usuario**: identidad autenticable; atributos: identificador, credencial (hash argon2id), **rol**,
  estado (activo/bloqueado). *(Base-ready para auditoría de accesos: el modelo debe permitir añadirla sin
  reescritura.)*
- **Sesión / Refresh token**: vínculo revocable entre usuario y su acceso; atributos: referencia opaca
  (hash), emisión, expiración, estado (vigente/revocada).
- **Rol**: `dispatcher | technician | supervisor` (enum cerrado); base de la matriz rol×alcance.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: un usuario válido completa el **login en < 1 s** (P95) y queda autenticado.
- **SC-002**: el **100%** de los intentos de acceso a recursos protegidos sin permiso se rechazan con el
  código correcto (401/403/404 según el caso).
- **SC-003**: una sesión revocada o caducada **nunca** concede acceso (0 falsos positivos en la batería
  de pruebas de sesión).
- **SC-004**: tras **5 intentos** de login fallidos en **15 min**, la cuenta se bloquea y los intentos
  posteriores se rechazan.
- **SC-005**: las operaciones de auth (login/refresh/me/logout) responden en **P95 < 300 ms** (excluida la
  latencia de red), cumpliendo el NFR "rápido" cuantificado.
- **SC-006**: con configuración inválida, el servicio **no arranca** y emite un error accionable (0 casos
  de arranque en estado inconsistente).

## Contrato (OpenAPI) *(obligatorio — Constitution II)*

- **Fichero**: `contracts/auth.openapi.yaml` (OpenAPI 3.1), rutas bajo **`/v1`**.
- **Endpoints (operationId → método ruta → roles → respuestas):**
  - `login` — `POST /v1/auth/login` — público — 200 / 401 / 422 / 429
  - `refresh` — `POST /v1/auth/refresh` — cookie refresh — 200 / 401
  - `logout` — `POST /v1/auth/logout` — autenticado — 204 / 401
  - `me` — `GET /v1/auth/me` — autenticado — 200 / 401
  - `health` — `GET /health` — público — 200
  - `ready` — `GET /ready` — público — 200 / 503
- **Esquemas**: `Role` enum `[dispatcher, technician, supervisor]`; `ErrorResponse`
  `{ code, message, details?, agent_action? }`. `snake_case` externo ↔ `camelCase` interno.

## Trazabilidad (RF → endpoint → test) *(obligatorio — Constitution VI)*

| FR | Endpoint(s) | Test(s) |
|----|-------------|---------|
| FR-001/002 | `login` | `should issue session when valid creds` · `should 401 uniform when invalid` |
| FR-003 | `logout` | `should revoke refresh on logout` |
| FR-004/005 | `refresh` | `should refresh when valid` · `should 401 when revoked/expired` |
| FR-006 | `me` | `should return identity and role` |
| FR-007/008/009/010 | (middleware) | `should 401/403/404 by auth+role+scope at API level` |
| FR-011 | `login` | `should lock account after N failed attempts` |
| FR-012 | (todas) | `should set security headers` · `should reject missing CSRF on refresh` |
| FR-013 | (todas) | `should return error contract shape per code` |
| FR-014 | (todas) | `should propagate correlation-id to logs` |
| FR-015 | `health`/`ready` | `should report health and readiness` |
| FR-016 | (arranque) | `should fail-fast on invalid config` |

## Eval de objetivos *(Constitution XIV)*

- Esta feature **no tiene componente de IA** → no aplica eval de faithfulness/alucinación.
- Los **Success Criteria** (SC-001..006) se validan con tests (unit/integración/contract) y con las
  aserciones de rendimiento (SC-005); no requieren promptfoo en esta feature.

## Assumptions

- **TTL access token**: 15 min; **TTL refresh**: 7 días (valores por defecto razonables; ajustables por config).
- **Lockout**: 5 intentos fallidos / ventana de 15 min (FR-011/SC-004).
- **Origen de usuarios**: existen usuarios **semilla** (la creación/gestión de usuarios queda fuera de
  esta feature); no hay auto-registro.
- **Organización única y plana** (multi-tenant fuera de alcance, YAGNI).
- Sin recuperación de contraseña ni verificación por email en esta feature (posible feature futura).
- El "recurso protegido de ejemplo" para probar RBAC puede ser un endpoint mínimo o un doble de prueba;
  los recursos de dominio reales llegan con la feature 002+.
