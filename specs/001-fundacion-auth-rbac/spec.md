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

**Gate G2 post-regeneración (2ª tanda de decisiones spec):**
- Q: ¿Una cuenta `disabled` puede re-loguearse? → A: **No** — el login verifica `disabled` y lo rechaza
  con **401 uniforme** (mismo timing/mensaje que credenciales inválidas) (**FR-002b**, B1 seguridad).
- Q: ¿Reuso de refresh revoca todas las sesiones del usuario o solo la comprometida? → A: **solo la familia
  comprometida** (el `sid`); las demás sesiones concurrentes siguen vigentes (FR-004b vs FR-003b) (B2).
- Q: ¿La regla del recurso de prueba RBAC es un requisito formal? → A: **sí, FR-017b** (technician→403;
  dispatcher/supervisor→200 en alcance/404 fuera o inexistente; rol→pertenencia; semilla con 404-por-alcance) (B3).
- Q: ¿El 401 de refresh distingue la causa? → A: **No** — 401 **uniforme** de cara al cliente; la causa
  solo en logs internos (FR-005, S-003).

**Gate G2 post-propagación (3ª tanda de decisiones spec):**
- Q: ¿`refresh` verifica el estado por caché o por BD? → A: **dos regímenes** — validación per-request
  (hot path) por caché+fallback; `refresh` por **BD autoritativa**; mismo criterio, distinto acceso (FR-004c, H-002).
- Q: ¿El orden 401-antes-403 incluye el estado de cuenta? → A: **sí** — "sesión válida" incluye
  disabled/familia; una cuenta `disabled` da **401 antes** de evaluar CSRF (FR-018, S-003).
- Q: ¿Pueden filtrarse credenciales por logs o `details`? → A: **No** — `password`/tokens/secretos/identifier
  **nunca** en logs ni en `details` (ni en 422) (FR-014, S-001).
- Q: ¿Se exige paridad de timing en el 401 de refresh? → A: **No en 001** — uniformidad de contenido sí;
  timing → **backlog BL-023** por coste sobre SC-005 (FR-005, H-004).

**Gate G2 (corrección del exceso logout+disabled):**
- Q: ¿`logout` comprueba disabled/familia? → A: **No** — logout es revocación voluntaria; con cookie de
  refresh vigente + CSRF ok → **204** (revoca), aunque la cuenta esté `disabled`. El régimen BD-autoritativo
  de FR-004c queda **solo en `refresh`** (FR-003/FR-004c/FR-018, cluster ALTA G2).
- Q: ¿La invalidación inmediata (write-through) aplica a `disabled`? → A: **No** — write-through inmediato es
  para **familia revocada por compromiso** (FR-004b, en banda); `disabled` (fuera de banda) se propaga en
  hot path en ≤30s (TTL) e inmediato en refresh/BD (FR-004c, H-002).

**Gate G2 (caché de gracia + fail-closed de logout):**
- Q: ¿El hit de la caché de gracia puede servir tokens de una sesión ya revocada? → A: **No** — re-comprueba
  `Session.revoked_at`/`disabled` antes de servir; si revocada→401 (FR-004d, S-001/H-005).
- Q: ¿Qué responde `logout` si la BD cae al revocar? → A: **503** (fail-closed), nunca 204 sin persistir
  (FR-003, S-002).
- Q: ¿Topología asumida? → A: **un solo proceso** (sin cluster/multi-worker); multi-worker→BL-018 (H-004).
- Q: ¿Re-habilitar una cuenta se propaga? → A: **sí, ≤30s** en hot path (caché por TTL re-evaluado, no add-only) (H-006).

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
  al login THE sistema SHALL crear una sesión y devolver un **access token de vida corta** (en el cuerpo),
  un **refresh token** en cookie HttpOnly/SameSite=Strict, y un **token/cookie CSRF** (`csrf_token`) para el
  double-submit que exigen FR-012/FR-018 en `refresh`/`logout` (técnica concreta en `/plan`).
- **FR-001b**: THE sistema SHALL tratar **email y username en un espacio de unicidad global**, de modo
  que un `identifier` resuelva a un único usuario (o ninguno).
- **FR-002**: WHEN un usuario envía credenciales inválidas THE sistema SHALL rechazar el login con **401**
  y un mensaje uniforme, sin crear sesión ni revelar si el usuario existe.
- **FR-002b (estado de cuenta en login, resuelve B1/G2)**: WHEN un usuario con credenciales válidas pero
  cuenta **`disabled`** (bloqueo administrativo) intenta login THE sistema SHALL rechazarlo con el **mismo
  401 uniforme** que credenciales inválidas, **no** creando sesión, de modo que una cuenta deshabilitada
  **no puede re-loguearse**. Para no reintroducir oráculo: (a) el chequeo de `disabled` se evalúa **después**
  de la verificación completa de contraseña (real o dummy), (b) la **diferencia de timing** entre "disabled
  con credenciales válidas" y "credenciales inválidas" cumple el **mismo umbral < 50 ms (P95)** de FR-011, y
  (c) los intentos contra una cuenta `disabled` **cuentan para el contador de lockout** (FR-011) igual que
  cualquier fallo, de modo que la aparición del 429 es **indistinguible** (no hay oráculo por conteo). El
  umbral **< 50 ms (P95)** aplica **mutuamente** entre las tres causas de 401 de login (credenciales
  inválidas, identifier inexistente, cuenta `disabled`), no solo por pares contra "credenciales inválidas".
- **FR-003**: WHEN un usuario autenticado hace logout THE sistema SHALL **revocar solo la sesión actual**
  (marca `Session.revoked_at` del `sid`; las demás sesiones del usuario siguen vigentes), de modo que
  cualquier refresh de esa familia se rechace después (resuelve H-002: revocación a nivel de **sesión**,
  no de un token concreto — coherente con data-model). En el **logout voluntario** el **access token vigente expira por su TTL corto**
  (≤15 min): aplicar la invalidación inmediata **también al logout voluntario** es **stretch** (backlog).
  *(El mecanismo de invalidación inmediata del access SÍ se construye —lo exige FR-004b para compromiso
  confirmado—; lo diferido es únicamente usarlo en el logout normal.)* **Logout NO es idempotente a
  nivel de token**: un 2º logout con la **misma cookie ya revocada** responde **401** (cookie no vigente,
  coherente con FR-018); la idempotencia por request-id queda diferida a backlog. **El logout NO comprueba
  el estado de cuenta** (resuelve el cluster ALTA del G2): con una cookie de refresh **vigente** (presente,
  no caducada, no revocada) y CSRF válido, **siempre revoca y responde 204**, aunque la cuenta esté
  `disabled` — cerrar la propia sesión es una operación de limpieza segura que no debe bloquearse.
  **Concurrencia (resuelve H-002):** logout revoca a **nivel de sesión (`sid`)** de forma **atómica**
  (marca `Session.revoked_at`), no de un token concreto; ante `refresh` y `logout` concurrentes sobre el
  mismo `sid`, el resultado es determinista: la sesión queda **revocada** y el perdedor recibe 401 (el
  access que hubiera emitido un refresh ganador expira por su TTL corto — límite ya conocido, stretch).
  **Fail-closed (resuelve S-002):** `logout` persiste `Session.revoked_at`; si la BD no responde
  (timeout/caída), responde **503** (coherente con FR-013), **nunca 204 sin persistir** la revocación (no
  dar falsa sensación de sesión cerrada).
- **FR-004**: WHEN un usuario presenta un refresh token válido y vigente THE sistema SHALL emitir un nuevo
  access token **y rotar el refresh** (single-use **atómico**: el refresh anterior queda invalidado en la
  misma operación, de modo que dos peticiones concurrentes con el mismo token no produzcan dos rotaciones
  válidas — mecánica en `/plan`), sin requerir credenciales. La rotación **comprueba `Session.revoked_at`
  en la MISMA operación atómica** (transacción con `SELECT … FOR UPDATE` sobre la sesión, o `UPDATE …
  WHERE rotated_at IS NULL AND` sesión no revocada), de modo que un `refresh` **no** emita tokens para una
  sesión ya revocada por un `logout` concurrente (cierra la ventana TOCTOU logout↔refresh, resuelve H-001).
  Al reemitir el access, THE sistema SHALL **releer el rol actual del usuario en BD** (para
  que un cambio de rol se propague en el siguiente refresh; mínimo privilegio, Constitution IV). Un cambio
  de rol se propaga como **máximo en ≤15 min** (TTL del access ya emitido); la **invalidación inmediata
  del rol** (cortar el access en curso) es *stretch* → backlog (BL-022).
- **FR-004b**: WHEN se presenta un refresh token **ya rotado/revocado fuera de una ventana de gracia
  breve** (posible robo) THE sistema SHALL rechazarlo, **revocar la familia de sesión comprometida** (el
  `sid` de esa cadena de refresh) e **invalidar de forma inmediata los access tokens de esa familia**
  (compromiso confirmado ≠ logout voluntario). **No** se revocan las **demás sesiones concurrentes** del
  usuario (otros dispositivos, FR-003b): el robo de un dispositivo no desloguea los legítimos.
- **FR-004d**: WHEN se **reintenta el mismo refresh dentro de la ventana de gracia** (idempotencia por
  reintento: timeout de red, doble envío) THE sistema SHALL tratarlo como **el mismo uso legítimo** (no
  como reuso) y **no** revocar la familia, **devolviendo el MISMO par access/refresh ya emitido**
  (respuesta idempotente, no una nueva rotación) — así dos reintentos casi simultáneos no crean dos
  refresh válidos (se respeta single-use). **El hit de la caché de gracia re-comprueba `Session.revoked_at`
  (y `disabled`) contra BD (régimen autoritativo de `refresh`, FR-004c-b — NO la caché del hot path) ANTES
  de servir el par** (resuelve S-001/H-005/H-001/G2): si la sesión fue **revocada** en la ventana (p. ej.
  por un `logout` concurrente) o la cuenta está `disabled`, responde **401** y **no** sirve el par cacheado
  — respeta FR-003 ("cualquier refresh de la familia se rechaza tras el logout"). *(Si un reintento legítimo
  cae tras una revocación concurrente, el cliente re-loguea: fail-secure intencional, H-002b.)* El re-check
  se hace **inmediatamente antes de servir**; el residual TOCTOU (revocación 1 ms después del check) está
  **acotado por el límite ya aceptado** de que el access emitido sigue válido ≤15 min tras logout (stretch,
  FR-003) — no es un hueco nuevo (H-101).
- **FR-004c**: WHEN se renueva o se valida un access token THE sistema SHALL verificar **dos** condiciones,
  **ambas contra la misma caché de revocación en memoria** (sin round-trip a BD en el camino caliente):
  (1) que el usuario no está **`disabled`** (bloqueo administrativo); y (2) que la **familia de sesión
  (`sid`) del token no está revocada por compromiso confirmado** (FR-004b). Si falla cualquiera, responde
  **401**. Esta comprobación por-request es lo que hace efectiva la "invalidación inmediata del access" de
  FR-004b: la revocación se escribe en la caché **de forma síncrona (write-through)** dentro de la misma
  petición que la detecta, por lo que "inmediata" = efectiva desde esa petición (el TTL ≤30 s es solo red
  de contención). **El logout voluntario NO entra aquí**: revoca el refresh, pero **no** corta el access por
  request (eso es *stretch*, FR-003/SC-003). El **lockout temporal** (`locked_until`, FR-011) afecta **solo
  al login**, **no** corta sesiones activas (evita DoS-logout). **Dos regímenes de acceso al dato, sin
  contradicción** (aclara H-001/H-002/G2): **(a) validación per-request de access** (camino caliente, con
  **Bearer**: `me`, `rbacProbe` y todo endpoint protegido) = **caché en memoria + fallback a BD solo en
  cache-miss/reinicio**. **(b) `refresh`** (fuera del camino caliente) = consulta **BD autoritativa y
  directa**. **Ambos verifican las mismas dos condiciones** (`disabled` y familia revocada); cambia el
  **mecanismo de acceso al dato**, no el criterio. **`logout` queda FUERA de este régimen** (resuelve el
  cluster ALTA del G2): **no hace el chequeo BD-autoritativo de `disabled`**. Sí respeta la **vigencia de
  la cookie** (presente / no caducada / **no revocada** — la revocación de familia por FR-004b marca
  `Session.revoked_at`, luego una cookie de familia revocada **no** es vigente → 401): es una revocación
  voluntaria que revoca la cookie **vigente** (ver FR-003/FR-018).
  **Fail-closed — regla única (resuelve T-001):** en el régimen (a) per-request, si hay cache-miss **y** la
  BD no responde (timeout/caída), la validación de access responde **401** (denegar, nunca fail-open). En el
  régimen (b) `refresh`, si la BD no responde, responde **503** (la operación depende de BD; servicio
  degradado). `/ready` reporta **503**. **Propagación de `disabled` fuera de banda** (un admin lo marca en
  BD, sin petición que dispare write-through): en el camino caliente se propaga como **máximo en el TTL de
  la caché (≤30 s)**; en `refresh` es **inmediata** (BD). La caché es **por-instancia** (slice
  single-instance); multi-instancia (caché compartida) → backlog (BL-018). La caché de estado es por **TTL
  re-evaluado** (no add-only): **re-habilitar** una cuenta (`disabled_at`→NULL) también se propaga en el hot
  path en ≤30s (H-006). Mecánica de caché/fallback en `/plan`.
- **FR-005**: WHEN un refresh token está **caducado o revocado** THE sistema SHALL responder **401** y no
  emitir access token. El **401 de refresh es uniforme** de cara al cliente (resuelve S-003/G2): no
  distingue caducado / revocado por logout / reuso-detectado / cuenta `disabled`; la causa concreta vive
  **solo en los logs internos** (correlation-id), para no dar pistas a un atacante con un refresh robado.
  *Nota (H-004/G2):* esta uniformidad es de **contenido**. La **paridad de timing** entre causas (el
  reuso-detectado es algo más lento por el write de revocación) se **difiere a backlog** (BL-023) por su
  coste sobre SC-005; no es requisito obligatorio de 001.
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
  estructurado (sin PII). **Nunca** deben aparecer en logs **ni** en el campo `details` de un error (ni
  siquiera en un 422 de validación): **credenciales (`password`)**, tokens/secretos (`Authorization`,
  `Set-Cookie`, `access_token`, `refresh_token`, `csrf_token`) ni el `identifier` (resuelve S-001/G2). El
  veto aplica a **logs, `details` Y `message`** del `ErrorResponse` (el `message` **no interpola** el valor
  recibido; nada de "identifier 'x@y.com' inválido"). Para **correlacionar** una causa en logs internos
  (FR-005/FR-002b) se usa el **`user_id` (UUID, no-PII)** cuando el usuario resuelve, nunca el `identifier`
  crudo. La lista concreta de redacción y la restricción del `details`/`message` se detallan en `/plan` y el contrato.
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
- **FR-017b (recurso de prueba RBAC determinista, contraparte testeable de FR-017, resuelve B3/G2)**: THE
  sistema SHALL exponer un recurso de prueba `GET /v1/rbac/probe/{id}` que aplique FR-017 con una regla
  **determinista y verificable con datos semilla**: **technician → 403 siempre** (rol que nunca puede esa
  acción); **dispatcher | supervisor → 200** si el `id` existe y está en su alcance semilla, **404** si el
  `id` no existe o está fuera de su alcance (sin revelar existencia). Se evalúa **rol antes que pertenencia**
  (FR-017). Los datos semilla incluyen ≥1 id en alcance y ≥1 id **existente pero fuera de alcance** de algún
  rol (para distinguir 404-por-alcance de 404-por-inexistencia). La fixture concreta vive en `/plan`.
  *Nota: la asignación de roles del `rbacProbe` es un **fixture sintético de prueba**, NO la política real
  de permisos de dominio (que llega en 002); no debe usarse como referencia normativa.*
- **FR-018 (autenticación antes que autorización — 401 antes que 403)**: THE sistema SHALL comprobar la
  **autenticación antes que la autorización** en **todos** los endpoints protegidos: sin credencial válida
  → **401**; con credencial válida pero sin permiso/CSRF → **403**. En particular, en `refresh`/`logout`
  (cookie): **sin sesión válida** (cookie ausente/caducada/revocada) → **401** (comprobado **antes** que el
  CSRF); **solo** con sesión válida y CSRF inválido/ausente → **403** (coherente con FR-017: 403 =
  autenticado sin permiso, no "sin autenticar"). Alcance de "sesión válida" **por endpoint** (resuelve
  S-003 y el cluster ALTA del G2): en **`refresh`** incluye TODAS las condiciones de estado que producen
  401 según FR-004c/FR-005 (cookie ausente/caducada/revocada, familia revocada, **y `disabled`**), todas
  **antes** que el CSRF — una cuenta `disabled` da **401** en refresh aunque falte el CSRF. En **`logout`**,
  "sesión válida" = **solo cookie de refresh vigente** (presente/no caducada/no revocada); **no** se
  comprueba `disabled` (FR-003): con cookie vigente + CSRF ok → **204** (revoca), aunque la cuenta esté
  disabled; sin cookie vigente → 401 (antes que CSRF). **Precedencia con fail-closed:** si la comprobación
  de sesión requiere BD y ésta no responde, el **503** (fail-closed, FR-004c/FR-003) tiene **prioridad**
  sobre el 403 de CSRF (primero se resuelve "sesión válida"; el CSRF no puede "tapar" una caída de BD).

### Key Entities

- **Usuario**: identidad autenticable; atributos: **email (único) y username (único)** en un **espacio de
  unicidad global**, credencial (hash argon2id), **rol**, y **dos estados distintos**: `locked_until`
  (bloqueo **temporal** por lockout, con timestamp que auto-expira) y `disabled` (bloqueo
  **administrativo** permanente, gestión fuera de alcance). *(Base-ready: el modelo permite añadir una
  tabla de auditoría por FK sin ALTER destructivo sobre Usuario.)*
- **Sesión / Refresh token**: vínculo revocable entre usuario y su acceso; **varias por usuario (una por
  dispositivo)**. La **Sesión = familia** identificada por **`sid`** (va como claim del access token);
  agrupa la **cadena de refresh tokens** que se van rotando (single-use). Atributos de sesión: `sid`,
  usuario, dispositivo/origen, emisión, estado (vigente/revocada). Atributos de cada refresh: referencia
  opaca (hash), expiración, marca de rotado, sucesor. El logout revoca **solo la sesión (`sid`) actual**;
  el compromiso confirmado (FR-004b) revoca **esa familia `sid`**, no las demás sesiones del usuario.
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
  - `refresh` — `POST /v1/auth/refresh` — cookie refresh + CSRF — 200 / 401 / **403** (CSRF) / **503** (BD caída, fail-closed)
  - `logout` — `POST /v1/auth/logout` — cookie refresh + CSRF — 204 / 401 / **403** (CSRF) / **503** (BD caída, fail-closed)
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
| FR-002b | `login` | `should 401 uniform when account disabled (no re-login)` |
| FR-003 | `logout` | `should revoke refresh on logout` · `should 401 on 2nd logout with revoked cookie (not idempotent)` · `should 204 on logout with valid cookie even if account disabled (no state check)` · `should 401 on logout when family already revoked (cookie not vigente)` · `should 503 on logout when DB down (never 204 without persisting)` |
| FR-004 | `refresh` | `should refresh when valid (atomic single-use)` · `should re-read role from DB on rotation` · `should reject refresh when logout revokes the session concurrently (atomic Session.revoked_at check, no tokens issued)` |
| FR-006 | `me` | `should return identity and role` |
| FR-007/008/009/010 | (middleware) | `should 401/403/404 by auth+role+scope at API level` |
| FR-011 | `login` | `should lock account after N failed attempts` · `should reset window on expiry (no perpetual lock)` |
| FR-012 | (todas) | `should set security headers` · `should reject missing CSRF on refresh` |
| FR-013 | (todas) | `should return error contract shape per code` |
| FR-014 | (todas) | `should propagate correlation-id to logs` · `should NOT leak password/tokens/identifier in logs, details or message (incl. 422)` |
| FR-015 | `health`/`ready` | `should report health and readiness` |
| FR-016 | (arranque) | `should fail-fast on invalid config (names missing var)` |
| FR-001b | `login` | `should resolve identifier to a single user (email/username global uniqueness)` |
| FR-003b/004d | `refresh`/`login` | `should allow concurrent sessions` · `should treat refresh retry within grace as same use` |
| FR-004b/004c | `refresh` · `me`/`rbacProbe` | `should revoke compromised family only (not other sessions) + invalidate its access on reuse` · `should 401 when account disabled` · `should keep other concurrent sessions on family revocation` · **`should 401 on me/rbacProbe with still-valid access right after family revocation/disable (per-request cache path)`** · `should fail-closed on cache-miss+DB-down: 401 on per-request access, 503 on refresh` |
| FR-005 | `refresh` | `should return uniform 401 (no cause oracle) on expired/revoked/reuse/disabled` |
| FR-017 | (middleware) | `should 403 for role-forbidden action` · `should 404 for out-of-scope resource` (regla determinista, fixture en /plan) |
| FR-017b | `rbacProbe` | `should 403 for technician` · `should 200 for dispatcher/supervisor in-scope` · `should 404 for out-of-scope (existing)` · `should 404 for non-existent` |
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
- **Topología (H-004/G2):** "instancia" = **un solo proceso** Node (sin modo cluster/multi-worker en 001);
  las cachés en memoria (revocación/gracia/rate-limit) son por-proceso. Multi-worker/instancia requiere
  **store compartido** (Redis) → BL-018.
- **Modelo de amenazas:** se **asume integridad de TLS** (cookies HttpOnly/Secure/SameSite=Strict); la
  captura de tokens en tránsito queda fuera de alcance (ver threat-model.md).
- Sin recuperación de contraseña ni verificación por email en esta feature (posible feature futura).
- El "recurso protegido de ejemplo" para probar RBAC puede ser un endpoint mínimo o un doble de prueba;
  los recursos de dominio reales llegan con la feature 002+.
