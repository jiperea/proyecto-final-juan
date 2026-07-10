# Feature Specification: Fundación — Autenticación, sesión y RBAC

**Feature Branch**: `001-fundacion-auth-rbac`

**Created**: 2026-07-10

**Status**: Draft

**Input**: Fundación A de FieldOps — autenticación, ciclo de sesión y control de acceso por rol (RBAC),
como base transversal sobre la que se construyen las features de dominio (Order, ejecución, revisión, IA).

## Clarifications

### Session 2026-07-10

**Pase 1:**
- Q: ¿Con qué se identifica el usuario al hacer login? → A: **Email o username** (ambos válidos; cada uno único).
- Q: ¿Alcance del logout / sesiones concurrentes? → A: **Solo la sesión actual**; se permiten sesiones
  concurrentes (un refresh por dispositivo).
- (auto) Política de contraseña → **mín. 12 caracteres, sin rotación forzada** (best practice NIST; el alta
  de usuarios es fuera de alcance → aplica a los datos semilla).
- (auto) Técnica CSRF concreta → **diferida a `/speckit-plan`** (candidato: double-submit cookie).
- (auto) TTL access 15 min / refresh 7 días · lockout 5 intentos/15 min → confirmados (Assumptions).

**Pase 2 (derivado del "email o username"):**
- Q: ¿Y si un username coincide con el email de otro usuario? → A: **email y username comparten un espacio
  de unicidad global**; un `identifier` resuelve a **un único usuario** (o ninguno) — sin ambigüedad.

**Pase 3:** re-escaneo sin preguntas nuevas → **convergido**.

**Gate G1 (fixes tras panel adversarial):**
- Refresh **single-use con rotación**; reuso de refresh revocado → revoca familia de sesión (FR-004/004b).
- Estado de cuenta (activo/bloqueado) verificado en refresh y validación de access (FR-004c).
- Logout: revoca refresh de la sesión; access expira por TTL corto; invalidación inmediata → **stretch**.
- Lockout **15 min ventana fija**, por usuario resuelto; identifiers inexistentes con **misma forma/tiempo** (anti-enumeración) (FR-011).
- **Lista cerrada** de cabeceras de seguridad (FR-012); mensaje de arranque nombra la variable (FR-016).
- **Regla 403 vs 404** fundacional para 002+ (FR-017).
- MEDIA (idempotencia logout, técnica CSRF, binding refresh, PII en logs, política de contraseña en seed) → `docs/backlog.md`.

**Gate G2 (decisiones de nivel spec; ver `gates/gate-G2-001-fundacion-auth-rbac.md`):**
- Q: ¿Qué prevalece en refresh/logout si faltan a la vez sesión y CSRF? → A: **401 antes que 403** —
  sin sesión válida = 401 (comprobado antes del CSRF); con sesión válida y CSRF inválido/ausente = 403 (FR-018).
- Q: ¿Es idempotente el logout a nivel de token? → A: **No** — un 2º logout con la misma cookie ya
  revocada → **401** (cookie no vigente). Idempotencia por request-id → backlog (FR-003).
- Q: Al expirar/caducar la ventana de lockout, ¿qué pasa con el contador? → A: **reset** de contador y
  ventana al expirar el bloqueo; y ventana nueva si la de 15 min ha caducado (fallos aislados no se acumulan) (FR-011).
- Q: ¿La regla 403-vs-404 (FR-017) es verificable? → A: debe ser **determinista y testeable con datos
  semilla** (la técnica/fixture concreta es de `/plan`) (FR-017).

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
   intento posterior de **refresh** con esa sesión es rechazado (el access ya emitido expira por su TTL
   corto — invalidación inmediata = stretch, FR-003).

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

- **FR-001**: WHEN un usuario envía credenciales válidas (**identifier = email o username** + contraseña)
  al login THE sistema SHALL crear una sesión y devolver un **access token de vida corta** y un
  **refresh token** en cookie HttpOnly/SameSite=Strict.
- **FR-001b**: THE sistema SHALL tratar **email y username en un espacio de unicidad global**, de modo
  que un `identifier` resuelva a un único usuario (o ninguno).
- **FR-002**: WHEN un usuario envía credenciales inválidas THE sistema SHALL rechazar el login con **401**
  y un mensaje uniforme, sin crear sesión ni revelar si el usuario existe.
- **FR-003**: WHEN un usuario autenticado hace logout THE sistema SHALL **revocar solo el refresh token de
  la sesión actual** (las demás sesiones del usuario siguen vigentes), de modo que su reutilización
  posterior se rechace. En el **logout voluntario** el **access token vigente expira por su TTL corto**
  (≤15 min): aplicar la invalidación inmediata **también al logout voluntario** es **stretch** (backlog).
  *(El mecanismo de invalidación inmediata del access SÍ se construye —lo exige FR-004b para compromiso
  confirmado—; lo diferido es únicamente usarlo en el logout normal.)* **Logout NO es idempotente a
  nivel de token**: un 2º logout con la **misma cookie ya revocada** responde **401** (cookie no vigente,
  coherente con FR-018); la idempotencia por request-id queda diferida a backlog.
- **FR-003b**: THE sistema SHALL permitir **sesiones concurrentes** por usuario (un refresh por dispositivo).
- **FR-004**: WHEN un usuario presenta un refresh token válido y vigente THE sistema SHALL emitir un nuevo
  access token **y rotar el refresh** (single-use: el refresh anterior queda invalidado), sin requerir
  credenciales. Al reemitir el access, THE sistema SHALL **releer el rol actual del usuario en BD** (para
  que un cambio de rol se propague en el siguiente refresh; mínimo privilegio, Constitution IV). Un cambio
  de rol se propaga como **máximo en ≤15 min** (TTL del access ya emitido); la **invalidación inmediata
  del rol** (cortar el access en curso) es *stretch* → backlog (BL-022).
- **FR-004b**: WHEN se presenta un refresh token **ya rotado/revocado fuera de una ventana de gracia
  breve** (posible robo) THE sistema SHALL rechazarlo, **revocar todas las sesiones del usuario** (familia)
  e **invalidar de forma inmediata los access tokens vigentes** (compromiso confirmado ≠ logout voluntario).
- **FR-004d**: WHEN se **reintenta el mismo refresh dentro de la ventana de gracia** (idempotencia por
  reintento: timeout de red, doble envío) THE sistema SHALL tratarlo como **el mismo uso legítimo** (no
  como reuso) y **no** revocar la familia, **devolviendo el MISMO par access/refresh ya emitido**
  (respuesta idempotente, no una nueva rotación) — así dos reintentos casi simultáneos no crean dos
  refresh válidos (se respeta single-use).
- **FR-004c**: WHEN se renueva o se valida un access token THE sistema SHALL verificar que el usuario no
  está **`disabled`** (bloqueo administrativo permanente); si lo está, responde 401. El **lockout temporal
  por fuerza bruta** (`locked_until`, FR-011) afecta **solo al login**, **no** corta las sesiones activas
  ya emitidas — así fallar la contraseña de un tercero **no** puede desloguear sus sesiones (evita
  DoS-logout). El estado autoritativo se comprueba contra BD en `refresh` (la mecánica por-request es de `/plan`).
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
- **FR-011**: WHEN un usuario acumula **5 intentos de login fallidos en 15 min** THE sistema SHALL
  **bloquear la cuenta 15 min** (ventana fija, auto-expira; los intentos durante el bloqueo **no la
  extienden**). El contador se lleva **por usuario resuelto** (email o username cuentan para la misma
  cuenta) **y también por `identifier` no resuelto** (mismo umbral y misma respuesta **429**), de modo que
  cuentas existentes e inexistentes son **indistinguibles** también al superar el umbral (no hay oráculo
  de enumeración vía 429). La **diferencia de tiempo de respuesta** entre "usuario inexistente" y
  "credenciales inválidas" debe ser **< 50 ms (P95)** (método de medición en `/plan`). Al **expirar el
  bloqueo** (`locked_until`) THE sistema SHALL **resetear contador y ventana**; y en **cada intento**, si
  la ventana fija de 15 min ha **caducado**, SHALL **abrir ventana nueva** (los fallos aislados fuera de
  ventana no se acumulan; evita el bloqueo perpetuo).
- **FR-012**: THE sistema SHALL emitir en todas las respuestas la **lista cerrada** de cabeceras:
  `Strict-Transport-Security` (max-age ≥ 15552000), `Content-Security-Policy` (default-src 'self'),
  `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`; y aplicar
  **protección CSRF** en las operaciones que usan la cookie de refresh (técnica concreta en `/plan`).
- **FR-013**: WHEN se produce cualquier error THE sistema SHALL responder con el **contrato de error**
  `{ code, message, details?, agent_action? }` y el código HTTP correcto. Códigos que **001 produce**:
  **401/403/404/422/429/503** (422 = validación de body). **400 y 409 NO aplican a 001** (llegan con las
  transiciones/conflictos de dominio en 002) → no se testean como código en esta feature.
- **FR-014**: THE sistema SHALL propagar un **correlation-id** por petición y registrarlo en el logging
  estructurado (sin PII).
- **FR-015**: THE sistema SHALL exponer `/health` (vivo) y `/ready` (listo, con dependencias) diferenciados.
- **FR-016**: WHEN el servicio arranca con configuración/entorno inválido o incompleto THE sistema SHALL
  **abortar el arranque** (fail-fast) con un mensaje que **nombre la(s) variable(s)** inválidas/faltantes,
  sin escuchar peticiones.
- **FR-017 (regla 403 vs 404, fundacional para 002+)**: THE sistema SHALL responder **403** cuando el rol
  **nunca** puede ejecutar esa acción sobre ese tipo de recurso, y **404** cuando el recurso existe pero
  está **fuera del alcance/propiedad** del usuario (no revelar su existencia). **Orden determinista de
  evaluación:** primero **capacidad de rol** (si el rol **nunca** puede esa acción sobre ese tipo →
  **403**, sin consultar la instancia); solo si el rol **sí** puede, se evalúa **pertenencia/alcance** de
  la instancia (fuera de alcance/inexistente → **404**). Esta regla SHALL ser **determinista y verificable
  con datos semilla** que modelen pertenencia (fixture concreta en `/plan`), de modo que 403 y 404 tengan
  casos de prueba objetivos.
- **FR-018 (autenticación antes que autorización — 401 antes que 403)**: THE sistema SHALL comprobar la
  **autenticación antes que la autorización** en **todos** los endpoints protegidos: sin credencial válida
  → **401**; con credencial válida pero sin permiso/CSRF → **403**. En particular, en `refresh`/`logout`
  (cookie): **sin sesión válida** (cookie ausente/caducada/revocada) → **401** (comprobado **antes** que el
  CSRF); **solo** con sesión válida y CSRF inválido/ausente → **403** (coherente con FR-017: 403 =
  autenticado sin permiso, no "sin autenticar").

### Key Entities

- **Usuario**: identidad autenticable; atributos: **email (único) y username (único)** en un **espacio de
  unicidad global**, credencial (hash argon2id), **rol**, y **dos estados distintos**: `locked_until`
  (bloqueo **temporal** por lockout, con timestamp que auto-expira) y `disabled` (bloqueo
  **administrativo** permanente, gestión fuera de alcance). *(Base-ready: el modelo permite añadir una
  tabla de auditoría por FK sin ALTER destructivo sobre Usuario.)*
- **Sesión / Refresh token**: vínculo revocable entre usuario y su acceso; **varias por usuario (una por
  dispositivo)**; atributos: referencia opaca (hash), dispositivo/origen, emisión, expiración, estado
  (vigente/revocada). El logout revoca **solo la sesión actual**.
- **Rol**: `dispatcher | technician | supervisor` (enum cerrado); base de la matriz rol×alcance.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: un usuario válido completa el **login en < 1 s** (P95) y queda autenticado.
- **SC-002**: el **100%** de los intentos de acceso a recursos protegidos sin permiso se rechazan con el
  código correcto (401/403/404 según el caso).
- **SC-003**: una sesión revocada o caducada **nunca** concede acceso **vía refresh** (0 falsos positivos
  en la batería de pruebas de sesión); el **access token ya emitido** deja de funcionar al expirar su TTL
  (≤15 min) — la invalidación inmediata del access es *stretch* (FR-003), por lo que SC-003 se mide sobre
  el refresh, no sobre el access dentro de su TTL.
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
  - `refresh` — `POST /v1/auth/refresh` — cookie refresh + CSRF — 200 / 401 / **403** (CSRF con sesión válida)
  - `logout` — `POST /v1/auth/logout` — cookie refresh + CSRF — 204 / 401 / **403** (CSRF con sesión válida)
  - `me` — `GET /v1/auth/me` — Bearer — 200 / 401
  - `rbacProbe` — `GET /v1/rbac/probe/{id}` — Bearer — 200 / 401 / 403 / 404
  - `health` — `GET /health` — público — 200
  - `ready` — `GET /ready` — público — 200 / 503
- **Esquemas**: `LoginRequest` `{ identifier (email o username), password }`; `Role` enum
  `[dispatcher, technician, supervisor]`; `ErrorResponse` `{ code, message, details?, agent_action? }`.
  `snake_case` externo ↔ `camelCase` interno.

## Trazabilidad (RF → endpoint → test) *(obligatorio — Constitution VI)*

| FR | Endpoint(s) | Test(s) |
|----|-------------|---------|
| FR-001/002 | `login` | `should issue session when valid creds` · `should 401 uniform when invalid` |
| FR-003 | `logout` | `should revoke refresh on logout` · `should 401 on 2nd logout with revoked cookie (not idempotent)` |
| FR-004/005 | `refresh` | `should refresh when valid` · `should 401 when revoked/expired` · `should re-read role from DB on rotation` |
| FR-006 | `me` | `should return identity and role` |
| FR-007/008/009/010 | (middleware) | `should 401/403/404 by auth+role+scope at API level` |
| FR-011 | `login` | `should lock account after N failed attempts` · `should reset window on expiry (no perpetual lock)` |
| FR-012 | (todas) | `should set security headers` · `should reject missing CSRF on refresh` |
| FR-013 | (todas) | `should return error contract shape per code` |
| FR-014 | (todas) | `should propagate correlation-id to logs` |
| FR-015 | `health`/`ready` | `should report health and readiness` |
| FR-016 | (arranque) | `should fail-fast on invalid config (names missing var)` |
| FR-001b | `login` | `should resolve identifier to a single user (email/username global uniqueness)` |
| FR-003b/004d | `refresh`/`login` | `should allow concurrent sessions` · `should treat refresh retry within grace as same use` |
| FR-004b/004c | `refresh` | `should revoke family + invalidate access on reuse` · `should 401 when account disabled/locked` |
| FR-017 | (middleware) | `should 403 for role-forbidden action` · `should 404 for out-of-scope resource` (regla determinista, fixture en /plan) |
| FR-018 | `refresh`/`logout` | `should 401 (no session) checked before CSRF` · `should 403 only when session valid and CSRF fails` |

## Eval de objetivos *(Constitution XIV)*

- Esta feature **no tiene componente de IA** → no aplica eval de faithfulness/alucinación.
- Los **Success Criteria** (SC-001..006) se validan con tests (unit/integración/contract) y con las
  aserciones de rendimiento (SC-005); no requieren promptfoo en esta feature.

## Assumptions

- **TTL access token**: 15 min; **TTL refresh**: 7 días (valores por defecto razonables; ajustables por config).
- **Ventana de gracia de reintento de refresh (FR-004b/004d)**: **≤ 10 s** desde la rotación (**límite
  inclusive**: t = 10,000 s aún cuenta como dentro); dentro = mismo uso legítimo, fuera = reuso (revoca
  familia). Valor de seguridad, ajustable por config.
- **Lockout**: 5 intentos fallidos / ventana de 15 min (FR-011/SC-004). El `identifier` se **normaliza**
  (minúsculas + trim) antes de contar, también para identifiers no resueltos (anti-enumeración real).
- **Política de contraseña**: mín. 12 caracteres, sin rotación forzada (best practice NIST); aplica al
  alta de usuarios, que es **fuera de alcance** → se refleja en los datos semilla.
- **Identidad**: login por **email o username** (espacio de unicidad global, FR-001b); **sesiones
  concurrentes** permitidas, logout revoca solo la actual (FR-003/FR-003b).
- **Origen de usuarios**: existen usuarios **semilla** (la creación/gestión de usuarios queda fuera de
  esta feature); no hay auto-registro.
- **Organización única y plana** (multi-tenant fuera de alcance, YAGNI).
- Sin recuperación de contraseña ni verificación por email en esta feature (posible feature futura).
- El "recurso protegido de ejemplo" para probar RBAC puede ser un endpoint mínimo o un doble de prueba;
  los recursos de dominio reales llegan con la feature 002+.
