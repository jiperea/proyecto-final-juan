# Research — 001 Fundación Auth/Sesión/RBAC (Phase 0)

> Resuelve los NEEDS-CLARIFICATION técnicos y los **diferidos marcados para `/plan`** (spec §Clarifications
> + backlog BL-012/BL-014). Formato: Decisión · Rationale · Alternativas descartadas.

## D1 · Ubicación del access token: body/memoria (Bearer) vs cookie  *(resuelve BL-014)*

- **Decisión:** el **access token** viaja en el **cuerpo** de la respuesta de `login`/`refresh` y el
  cliente lo guarda **en memoria** (variable JS, no `localStorage`), enviándolo como
  `Authorization: Bearer <jwt>`. El **refresh token** va en **cookie HttpOnly, Secure, SameSite=Strict,
  Path=/v1/auth** (no legible por JS).
- **Rationale:**
  - El header `Authorization` **no lo envía el navegador automáticamente** → los endpoints con access
    token son **inmunes a CSRF** por construcción (el vector CSRF solo aplica a credenciales ambientales
    como cookies).
  - El refresh en cookie **HttpOnly** es **resistente a XSS** (JS no puede leerlo).
  - Reparte el riesgo: XSS no roba el refresh (HttpOnly); CSRF no explota el access (no es ambiental).
  - Access en memoria (no `localStorage`) reduce superficie de robo por XSS del propio access.
- **Alternativas descartadas:**
  - *Access también en cookie:* obligaría a CSRF en TODOS los endpoints y a leer estado de sesión por
    request; peor para SC-005 y superficie CSRF mayor.
  - *Access en `localStorage`:* persistente y legible por JS → robo trivial ante XSS. Descartado.
- **Consecuencia para CSRF:** solo `refresh` y `logout` (cookie-authed) necesitan protección CSRF → ver D2.

## D2 · Técnica CSRF para la cookie de refresh  *(resuelve el diferido CSRF)*

- **Decisión:** **defensa en profundidad** en los endpoints que usan la cookie de refresh (`refresh`,
  `logout`):
  1. **`SameSite=Strict`** en la cookie de refresh (el navegador no la envía en peticiones cross-site).
  2. **Double-submit token**: en `login`/`refresh` el servidor emite además una cookie **legible**
     `csrf_token` (no HttpOnly, SameSite=Strict) con un valor aleatorio; el cliente lo **reenvía** en la
     cabecera `X-CSRF-Token`. El servidor exige que **cookie == cabecera** (comparación en tiempo
     constante) en toda operación con la cookie de refresh. Un atacante cross-site no puede leer la
     cookie ni fijar la cabecera → falla.
- **Rationale:** `SameSite=Strict` ya bloquea el grueso; el double-submit es **stateless** (no requiere
  almacenar el token en servidor, encaja con hexagonal sin acoplar infra) y cubre navegadores/escenarios
  donde SameSite no aplique. No usamos `SameSite=Lax` porque no hay flujo de navegación top-level que lo
  requiera para estos endpoints.
- **Alternativas descartadas:**
  - *Synchronizer token (server-side):* requiere estado por sesión para CSRF; innecesario dado el
    double-submit stateless; más acoplamiento.
  - *Solo SameSite:* aceptable pero sin defensa en profundidad; el brief pide "seguro" y la 001 es
    fundación de seguridad → añadimos double-submit.

## D3 · Verificación de estado de cuenta por-request sin romper SC-005 (P95<300 ms)  *(resuelve BL-012)*

- **Decisión:** el **camino caliente** (validar access en cada request protegido) **no hace round-trip a
  BD**. Se compone de:
  1. **Verificación JWT** local (firma + expiración) — O(1), sin BD.
  2. El access token incluye claims `sub` (userId), `sid` (sessionId/familia) y `role`.
  3. **Chequeo de revocación/estado en caché en memoria**: un conjunto/mapa en proceso con
     **(a)** sesiones/familias revocadas (`sid`) y **(b)** usuarios `disabled`/`locked`. La caché se
     **invalida por evento** en logout, revocación de familia (FR-004b) y bloqueo (FR-011), y tiene
     **TTL de seguridad ≤ 30 s** como red de contención.
  4. La **verificación autoritativa contra BD** del estado de cuenta ocurre en **`refresh`** (FR-004c),
     que no está en el camino de cada request y tolera la latencia.
- **Rationale:**
  - Cumple FR-004c ("se valida un access token → verificar activo") **sin** pegar a BD por request →
    protege SC-005.
  - El access TTL corto (≤15 min) acota la ventana: un `disabled` puesto en BD se propaga como máximo en
    el próximo `refresh`; para **compromiso confirmado** (FR-004b) la invalidación es **inmediata** vía
    el set de revocación en memoria (evento).
  - En despliegue single-instance (slice) la caché en memoria es suficiente; multi-instancia es DevOps
    futuro (nota en backlog) — un store compartido (p. ej. Redis) sería el reemplazo del puerto.
- **Alternativas descartadas:**
  - *Consultar BD en cada request:* simple pero añade latencia de red+query al P95 de cada endpoint →
    riesgo para SC-005. Descartado en el hot path.
  - *Solo confiar en el TTL (sin set de revocación):* no permitiría invalidación inmediata en compromiso
    confirmado (FR-004b). Descartado.
- **Puerto (hexagonal):** `SessionStatePort` (isRevoked(sid), isUserActive(sub)) con adaptador
  **in-memory** ahora; sustituible por adaptador distribuido sin tocar dominio.

## D4 · Hashing de contraseñas

- **Decisión:** **argon2id** (paquete `argon2`), parámetros OWASP (memoria ≥ 19 MiB, iteraciones ≥ 2,
  paralelismo 1) ajustados para que el `verify` **no domine** el P95 de login (SC-005). El coste de
  Argon2 es intencionado; SC-005 (P95<300 ms) se mide con parámetros calibrados y se documenta.
- **Rationale:** argon2id es el recomendado actual (resistente a GPU y side-channel); constitution
  (Convenciones) ya lo fija. La anti-enumeración (FR-011, <50 ms P95 de diferencia) exige aplicar un
  **hash dummy** de coste equivalente cuando el identifier no existe, para no revelar por timing.
- **Alternativas descartadas:** bcrypt (límite de 72 bytes, menos resistente a GPU), scrypt (menos
  estándar en el ecosistema). 

## D5 · JWT: algoritmo y claims

- **Decisión:** access = **JWT firmado HS256** (secreto de entorno; slice single-service) con claims
  `sub`, `sid`, `role`, `iat`, `exp` (TTL 15 min). Refresh = **token opaco** (aleatorio 256-bit),
  se persiste **solo su hash** (SHA-256) en BD, ligado a una **familia** (`sid`) para rotación/reuso.
- **Rationale:** HS256 basta para un único servicio (no hay verificación por terceros que exija RS256);
  refresh opaco (no JWT) permite **revocación real** en BD (un JWT no se puede revocar sin denylist).
- **Alternativas descartadas:** access opaco con lookup en BD por request (rompe D3/SC-005); refresh
  como JWT (no revocable de forma limpia).

## D6 · Rotación de refresh y ventana de gracia (FR-004/004b/004d)

- **Decisión:** rotación **single-use**: cada `refresh` invalida el token presentado y emite uno nuevo en
  la misma familia (`sid`). Reuso de un token ya rotado **fuera** de una **ventana de gracia de 10 s** →
  robo confirmado → **revoca la familia** + añade `sid` al set de revocación en memoria (invalida access
  vigentes). Reintento del **mismo** token **dentro** de la gracia (timeout de red/doble envío) → se
  devuelve el resultado ya emitido (idempotente), sin revocar.
- **Rationale:** patrón OWASP de refresh rotation con detección de reuso; la ventana de gracia evita
  falsos positivos por reintentos legítimos (FR-004d).
- **Alternativas descartadas:** sin gracia (rompe reintentos legítimos → logout espurio); refresh
  multi-uso (no detecta robo).

## D7 · Rate-limit / lockout (FR-011) y anti-enumeración

- **Decisión:** contador de intentos fallidos **por usuario resuelto** y **por identifier no resuelto**,
  ventana fija 15 min, umbral 5 → bloqueo 15 min (los intentos durante el bloqueo no lo extienden).
  Respuesta **429** uniforme para cuenta bloqueada e identifier inexistente sobre umbral. Diferencia de
  timing "inexistente" vs "credenciales inválidas" **< 50 ms P95** (hash dummy, D4).
- **Rationale:** cumple FR-011/SC-004 y cierra el oráculo de enumeración (por respuesta y por timing).
- **Store:** puerto `RateLimitPort` con adaptador in-memory (slice); Redis en DevOps futuro.
- **Alternativas descartadas:** ventana deslizante (más compleja, ya decidido ventana fija en G1);
  bloqueo por IP como principal (BL-009, stretch).

## D8 · Config fail-fast (FR-016)

- **Decisión:** validación de entorno con **Zod** al arrancar; si falta/está mal una variable, el proceso
  **aborta** con mensaje que **nombra la variable** y **no** abre el puerto HTTP.
- **Rationale:** 12-factor + FR-016/SC-006; evita arrancar en estado inconsistente.

## Resumen de resolución

| Diferido (origen) | Resuelto en |
|---|---|
| Técnica CSRF concreta | **D2** (SameSite=Strict + double-submit stateless) |
| Access en body/Bearer vs cookie (BL-014) | **D1** (access=Bearer/memoria; refresh=cookie HttpOnly) |
| Estado de cuenta por-request sin romper P95 (BL-012) | **D3** (JWT local + caché de revocación en memoria; BD solo en refresh) |

Sin `NEEDS CLARIFICATION` restantes → listo para Phase 1 (data-model, contrato, quickstart).
