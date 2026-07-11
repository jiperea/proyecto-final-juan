# Research — 001 Fundación Auth/Sesión/RBAC (Phase 0)

> Decisiones técnicas (Decisión · Rationale · Alternativas). Resuelve la mecánica de la spec (FR-001..018)
> y las decisiones que el gate G2 fijó como de nivel plan. Sin `NEEDS CLARIFICATION` pendientes.

## D1 · Access token: body/memoria (Bearer) vs cookie

- **Decisión:** access = **JWT corto** en el **cuerpo** de `login`/`refresh`; el cliente lo guarda en
  **memoria** (no `localStorage`) y lo envía como `Authorization: Bearer`. Refresh = **cookie HttpOnly,
  Secure, SameSite=Strict, Path=/v1/auth**.
- **Rationale:** el header `Authorization` no es ambiental → los endpoints con access son **inmunes a
  CSRF**; el refresh HttpOnly es **resistente a XSS**. Se reparte el riesgo (XSS no roba el refresh; CSRF
  no explota el access). Access en memoria minimiza robo por XSS del propio access.
- **Alternativas descartadas:** access en cookie (obliga CSRF en todo + lectura de estado por request);
  access en `localStorage` (robo trivial por XSS).
- **Consecuencia:** CSRF solo aplica a `refresh`/`logout` (endpoints de cookie) → D2.

## D2 · CSRF de la cookie de refresh (double-submit)

- **Decisión:** en `refresh`/`logout`: **`SameSite=Strict`** + **double-submit token**. `login`/`refresh`
  emiten una cookie legible `csrf_token` (no HttpOnly, SameSite=Strict); el cliente la reenvía en
  `X-CSRF-Token`; el servidor exige **cookie == cabecera** (comparación en tiempo constante).
- **csrf_token:** **rota junto con el refresh** (se reemite en `login` y en cada `refresh` con `Set-Cookie`)
  y comparte TTL con la sesión. `X-CSRF-Token` **no** se marca `required` en el esquema OpenAPI: su ausencia
  la valida el **middleware** (→ 403 tras confirmar sesión), no la validación de esquema (evita un 400 que
  enmascararía el camino CSRF).
- **Orden de comprobación (FR-018):** sesión (cookie) **antes** que CSRF → sin sesión = **401**; con sesión
  y CSRF inválido/ausente = **403**.
- **Implementación (G3, B1/I-001):** "sin sesión" incluye cookie **ausente Y cookie presente-pero-inválida**.
  Las **tres** causas de invalidez que producen 401 antes que CSRF (coherente con FR-004c/FR-018) son:
  **(a) refresh inexistente/caducado, (b) sesión revocada, (c) cuenta `disabled`**. El middleware CSRF, si
  el double-submit falla, consulta `SessionValidityPort` (adaptador `RefreshSessionValidity`: token existe +
  sesión no revocada + refresh no caducado + **cuenta no `disabled`** vía `AccountStatePort.isUserDisabled`)
  y devuelve **401 si la sesión no es válida** y **403 solo si es válida**. Así el orden 401→403 se cumple
  también para cookies revocadas/caducadas/de-cuenta-disabled (no basta con comprobar la mera presencia de la
  cookie). Verificado por `tests/unit/session-validity.spec.ts` (las 4 ramas) y
  `tests/integration/csrf-order.spec.ts` (sesión revocada / cuenta disabled + CSRF ausente → 401).
- **Rationale:** `SameSite=Strict` bloquea el grueso; el double-submit es **stateless** (sin estado CSRF en
  servidor, encaja con hexagonal). Defensa en profundidad para una fundación de seguridad.
- **Alternativas descartadas:** synchronizer token (requiere estado por sesión); solo SameSite (sin defensa
  en profundidad).

## D3 · Estado de cuenta / revocación por-request sin romper SC-005

- **Decisión:** el hot path (validar access por request) **no** hace round-trip a BD:
  1. Verificación **JWT local** (firma + expiración), O(1).
  2. Claims `sub`, `sid` (familia/sesión), `role`.
  3. **Caché de revocación en memoria** (session-version): **ambas** condiciones de FR-004c contra la
     **misma** caché — set de `sid` revocados **y** set de usuarios `disabled` — actualizada
     **write-through síncrono** desde la petición que las produce, con **TTL de seguridad ≤30 s**. Nota:
     el **logout voluntario NO** añade el `sid` a este set (no corta el access por-request; solo revoca el
     refresh) — la invalidación inmediata en logout es *stretch* (FR-003). Solo el **compromiso confirmado**
     (FR-004b) y `disabled` cortan el access vigente.
  4. **Cache-miss / reinicio → fallback a BD** (consulta `Session.revoked_at`/familia **Y `User.disabled_at`**;
     `SessionStatePort.isUserActive(sub)` pega a BD en fallback): solo en miss, no en régimen estable. **Ambos**
     (revocación de familia y `disabled`) son **durables en BD** → sobreviven a reinicio/cache-miss (H-001).
  5. **Fail-closed (regla única):** si en un cache-miss la BD tampoco responde (timeout/caída): régimen (a)
     per-request → **401** (denegar); régimen (b) `refresh` → **503** (servicio degradado); `/ready` → 503.
     **Nunca fail-open.** `logout` queda fuera de este régimen (no chequea estado; solo vigencia de cookie).
     **`login` (G3, B3/H-003):** también envuelto en fail-closed → si la BD falla (resolución de identifier,
     creación de sesión/refresh), responde **503**, nunca cuelga la petición ni deja un `unhandledRejection`.
  6. **Atomicidad:** el `add(sid)` al set en memoria es **síncrono** tras el commit de revocación.
- **disabled vs locked_until (FR-004c):** `disabled` (bloqueo administrativo) **corta** refresh y
  validación → 401. `locked_until` (lockout por fuerza bruta, FR-011) afecta **solo al login**, **no**
  corta sesiones activas (evita DoS-logout por fallar la contraseña de un tercero).
- **Verificación autoritativa** de estado contra BD ocurre en **`refresh`** (fuera del hot path).
- **Rationale:** cumple FR-004c sin pegar a BD por request → protege SC-005; invalidación inmediata en
  compromiso confirmado (FR-004b) vía el set en memoria.
- **Puerto:** `SessionStatePort` (isRevoked(sid), isUserActive(sub)); adaptador in-memory (slice
  single-instance); store distribuido (Redis) = DevOps futuro (BL-018), sin tocar dominio.
- **Alternativas descartadas:** BD por request (latencia → riesgo SC-005); solo TTL sin set de revocación
  (no permite invalidación inmediata FR-004b).

## D4 · Hashing de contraseñas

- **Decisión:** **argon2id** (paquete `argon2`), parámetros OWASP (memoria ≥ 19 MiB, iteraciones ≥ 2,
  paralelismo 1) calibrados para que `verify` no domine el P95 de login (SC-005). Anti-timing (FR-011): al
  no existir el usuario se ejecuta un **hash dummy** de coste equivalente (diferencia <50 ms P95).
- **Orden en login (FR-002b):** el chequeo de `disabled` se hace **después** de la verificación completa de
  contraseña (real o dummy), para que "disabled con credenciales válidas" y "credenciales inválidas"
  consuman el mismo cómputo; el 401 es uniforme y el intento **cuenta para el lockout** (FR-011). Umbral
  <50 ms P95 **mutuo** entre las 3 causas (inválidas / inexistente / disabled).
- **Rationale:** argon2id es el recomendado (resistente a GPU/side-channel); fijado en la constitution.
- **Alternativas descartadas:** bcrypt (límite 72 bytes), scrypt (menos estándar).

## D5 · JWT y refresh

- **Decisión:** access = **JWT HS256** (secreto de entorno) con claims `sub`, `sid`, `role`, `iat`, `exp`
  (TTL 15 min). Refresh = **token opaco** (256-bit aleatorio); en BD solo su **hash SHA-256**, ligado a una
  **familia** (`sid`).
- **Rationale:** HS256 basta para un único servicio; refresh opaco permite **revocación real** en BD (un
  JWT no se revoca sin denylist). El **rol** se **relee de BD** en cada rotación (FR-004, mínimo privilegio).
- **Alternativas descartadas:** access opaco con lookup por request (rompe SC-005); refresh como JWT (no
  revocable limpio).

## D6 · Rotación de refresh, gracia y concurrencia

- **Decisión:** rotación **single-use atómica**, que **además comprueba que la sesión no está revocada**:
  `UPDATE RefreshToken SET rotated_at=now(), replaced_by=? WHERE id=? AND rotated_at IS NULL AND EXISTS
  (SELECT 1 FROM Session s WHERE s.id=session_id AND s.revoked_at IS NULL)` (o transacción con
  `SELECT … FOR UPDATE` sobre la sesión) — solo una petición concurrente gana (filas=1) **y** no se emiten
  tokens para una sesión revocada por un `logout` concurrente (cierra la ventana TOCTOU logout↔refresh, H-001).
- **Implementación (G3, I-002/H-001):** debe ser **una ÚNICA sentencia SQL** (`$executeRaw` con
  `UPDATE … WHERE rotated_at IS NULL AND EXISTS(sesión no revocada)`), **no** un `SELECT` de lectura seguido
  de un `UPDATE` (esa variante deja una ventana read-then-write bajo Read Committed y NO cierra la TOCTOU).
  Verificado por `tests/integration/rotate-atomic.spec.ts` (sesión revocada → 0 filas → no rota).
- **Ventana de gracia (≤10 s inclusive, FR-004d):** una re-presentación del **mismo** token ya rotado
  dentro de la gracia (reintento de red, doble envío, o la petición **perdedora** de la carrera) → devuelve
  el **mismo par ya emitido** desde una **caché efímera en memoria** (clave = hash del token, TTL = gracia);
  **no** rota de nuevo ni revoca familia (respeta single-use). El par en claro **no se persiste en BD**.
- **Reuso fuera de gracia (FR-004b):** token ya rotado presentado tras la gracia = robo confirmado →
  **revoca la familia** (`Session.revoked_at`) + `add(sid)` al set de revocación en memoria (invalida access
  vigentes). El mecanismo de invalidación inmediata **existe** (lo exige FR-004b); aplicarlo al logout
  voluntario es *stretch* (FR-003).
- **Rationale:** patrón OWASP de refresh rotation con detección de reuso; la gracia evita falsos positivos
  por reintentos legítimos y por carreras concurrentes.
- **Alternativas descartadas:** sin gracia (logout espurio en reintentos); refresh multi-uso (no detecta robo).
- **Nota de amenazas (S-001):** el replay se resuelve por valor exacto bajo **asunción de integridad TLS**
  (cookie HttpOnly/Secure); binding al cliente = hardening (BL-017).

## D7 · Lockout / anti-enumeración (FR-011)

- **Decisión:** contador de fallos por **usuario resuelto** y por **identifier no resuelto**; ventana fija
  15 min; umbral 5 → bloqueo 15 min (no extensible durante el bloqueo). Respuesta **429** uniforme (bloqueo
  e identifier inexistente sobre umbral). Reset de contador/ventana al expirar el bloqueo **y** al caducar
  la ventana (evita bloqueo perpetuo). `identifier` **normalizado** (minúsculas + trim) antes de contar.
- **Clave del identifier no resuelto:** **HMAC-SHA256 con `LOCKOUT_HMAC_SECRET`** — variable de entorno
  **dedicada y distinta** de `JWT_SECRET` y de `CSRF_HMAC_SECRET` (aislamiento de dominios criptográficos;
  S-002). No un hash simple → no reversible por diccionario si el store se vuelca/replica. Validada en
  fail-fast (D8).
- **Store:** puerto `RateLimitPort`; adaptador in-memory (slice); atomicidad del contador ante concurrencia
  → BL-020; Redis multi-instancia → BL-018.
- **Alternativas descartadas:** ventana deslizante (más compleja; ya se decidió fija); bloqueo por IP como
  principal (BL-009 stretch).

## D8 · Config fail-fast (FR-016)

- **Decisión:** validación de entorno con **Zod** al arrancar; si falta/está mal una variable, el proceso
  **aborta** nombrando la variable, sin abrir el puerto HTTP. Variables: `JWT_SECRET`, `CSRF_HMAC_SECRET`
  (distinto), **`LOCKOUT_HMAC_SECRET`** (distinto de ambos, D7), `DATABASE_URL`, `ACCESS_TTL`,
  `REFRESH_TTL_DAYS`, `GRACE_MS`, `LOCKOUT_MAX`, `LOCKOUT_WINDOW_MIN`.
- **Pairwise-distinct (S-002):** además de presencia/formato, la validación Zod comprueba que
  `JWT_SECRET`, `CSRF_HMAC_SECRET` y `LOCKOUT_HMAC_SECRET` son **mutuamente distintos** (3 pares); si dos
  coinciden, **aborta** nombrando el par en conflicto (aislamiento de dominios criptográficos).
- **Rationale:** 12-factor + FR-016/SC-006.

## D9 · Método de medición de los P95 (SC-001/SC-005/FR-011)

- **Decisión:** **N ≥ 200** peticiones por endpoint/grupo; **secuencial**; se **descartan exactamente las
  primeras 20** peticiones (warm-up) antes de medir; **instrumentación server-side** (timestamp middleware
  entrada→salida) que **excluye la red**; aplica a **SC-001 y SC-005**. Anti-enumeración = **|P95(causa_i) −
  P95(causa_j)| < 50 ms** para las 3 causas de 401 (inválidas / inexistente / disabled), N≥200 por grupo.
- **Rationale:** hace los P95 reproducibles (cierra la ambigüedad estadística); carga concurrente = DevOps.

## D10 · Fixture del recurso de prueba RBAC (rbacProbe)

- **Decisión:** fixture de seed `ProbeResource` con dimensión de **pertenencia/alcance**. Regla FR-017b
  determinista: **technician → 403** siempre (rol que nunca puede); **dispatcher/supervisor → 200** si el
  `id` está en su alcance semilla, **404** si no existe o está fuera de alcance. Orden: **rol (403) antes
  que pertenencia (404)** (FR-017). Seed: **(a)** ≥1 id "en alcance" de dispatcher/supervisor (→200);
  **(b)** ≥1 id **existente pero fuera de alcance** de un rol (p. ej. `in_scope_roles=[supervisor]`, de modo
  que dispatcher reciba **404-por-alcance**); **(c)** un id inexistente (→404-por-inexistencia). Así los dos
  caminos de 404 se testean por separado.
- **Rationale:** hace testeable la regla fundacional 403/404 sin recurso de dominio real (Order llega en 002).

## D11 · Unicidad global email/username a nivel de esquema (FR-001b)

- **Decisión:** garantizar en **BD** (no solo con dos índices únicos por columna) que un `username` no
  colisione con el `email` de otro usuario. Mecanismo: columna canónica **`identifier_norm`** por identidad
  (minúsculas+trim) en una **tabla/índice único de identifiers** (o un índice único sobre la unión de
  email y username normalizados), de modo que el espacio de unicidad sea **uno solo**. La inserción es
  transaccional (evita la carrera de dos altas casi simultáneas).
- **Rationale:** cierra el hueco de que dos índices independientes no impiden `username(A) == email(B)`
  (FR-001b exige un único espacio de unicidad).
- **Alternativas descartadas:** validación solo en aplicación (condición de carrera); no garantiza el invariante.

## D12 · Semántica de logout (decisión del usuario, cierra H-001)

- **Decisión:** `logout` **revoca la sesión (`sid`)** si no está ya revocada, **aunque el refresh
  presentado esté rotado** (no sea el actual) o la cuenta esté `disabled` → **204**. Si el token está
  **rotado y FUERA de la ventana de gracia**, lo trata además como **reuso** y dispara **FR-004b** (revoca
  familia = contención del compromiso). El chequeo de rotación/gracia lee **BD (autoritativo, régimen (b));
  fail-closed 503** si la BD no responde. El **401 de logout es uniforme** de contenido. 2º logout con la
  sesión ya revocada → 401.
- **Rationale:** cerrar la propia sesión no escala privilegios (solo afecta a la sesión de ese `sid`) y un
  token robado ya podría terminarla vía refresh-reuso; por tanto aceptar un token rotado en logout no añade
  superficie. A cambio, el usuario legítimo **siempre** puede cerrar su sesión (incluso con cookie "vieja")
  y el compromiso se **detecta y contiene** (FR-004b) también por la vía de logout.
- **Efectos aceptados:** un logout que dispara FR-004b invalida el access de otras pestañas propias del mismo
  `sid` (BL-027); retención de hashes rotados durante el TTL (ver data-model) para logout tardío.
- **Alternativas descartadas:** exigir token no rotado (401) — deja al usuario legítimo sin cerrar su sesión
  y no detecta el compromiso por logout (rechazado por el usuario en G2).

## Resumen de decisiones del G2 resueltas

| Tema G2 | Decisión |
|---|---|
| CSRF | D2 (double-submit + SameSite=Strict, csrf rota, no-required, orden 401→403) |
| Access vs cookie | D1 |
| Estado por-request | D3 (caché + fallback BD + fail-closed; disabled vs locked_until) |
| Rotación/gracia/concurrencia | D6 (atómica + caché efímera de gracia) |
| Hash identifier | D7 (HMAC-SHA256 secreto propio + normalización) |
| Método P95 | D9 |
| Fixture probe | D10 |
