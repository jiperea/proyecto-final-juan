---
description: "Task list — 001 Fundación Auth/Sesión/RBAC"
---

# Tasks: Fundación — Autenticación, sesión y RBAC

**Input**: `specs/001-fundacion-auth-rbac/` (spec FR-001..018, plan, research D1-D10, data-model, contracts/auth.openapi.yaml)

**Tests**: OBLIGATORIOS (Constitution VII — TDD **fase Red**: commit del test en rojo **antes** del de implementación).

**Arquitectura**: hexagonal — `backend/src/{domain,handlers,infra}`; el dominio NO importa Express/Prisma/JWT.
**Contract-first**: contract tests derivados de `contracts/auth.openapi.yaml` (operationId × código).

## Format: `[ID] [P?] [Story] Descripción (FRs) — ruta`

---

## Phase 1: Setup

- [x] T001 Crear estructura hexagonal `backend/src/{domain/{auth,rbac,ports},handlers/middleware,infra}` y `backend/tests/{unit,integration,contract}` — `backend/`
- [x] T002 Init Node/TS strict + deps (express, prisma, zod, argon2, jsonwebtoken, helmet, pino, cookie-parser) y devDeps (vitest, supertest, coverage) — `backend/package.json`, `backend/tsconfig.json`
- [x] T003 [P] ESLint (cero `any` sin justificación, ≤50 líneas/func, ≤300/fichero, named exports) + Prettier — `backend/eslint.config.mjs`
- [x] T004 [P] Vitest (unit sin BD, integration/contract con Postgres docker) + umbrales cobertura (dominio ≥80%, servicios ≥80%) — `backend/vitest.config.ts`
- [x] T005 [P] `docker-compose.yml` con PostgreSQL 16 (BD dev + BD test) — `docker-compose.yml`
- [x] T006 [P] `Makefile`/scripts: install, up, test, gate — `Makefile`, `backend/package.json`
- [x] T007 [P] `.env.example` (JWT_SECRET, **CSRF_HMAC_SECRET ≠ JWT_SECRET**, **LOCKOUT_HMAC_SECRET ≠ ambos** (D7), DATABASE_URL, ACCESS_TTL=900, REFRESH_TTL_DAYS=7, **GRACE_MS=10000**, LOCKOUT_MAX=5, LOCKOUT_WINDOW_MIN=15); los 3 secretos validados en fail-fast (T015/T019) — `.env.example`

---

## Phase 2: Foundational (bloquea todas las historias)

### Contrato y puertos

- [x] T008 Tipos TS desde `contracts/auth.openapi.yaml` (openapi-typescript) + transform snake↔camel en boundary — `backend/src/handlers/contract/types.ts` (Const. II)
- [x] T009 [P] Esquemas Zod derivados del contrato — `backend/src/handlers/contract/schemas.ts` (Const. II)
- [x] T010 [P] Puertos repos `UserRepositoryPort`, `SessionRepositoryPort`, `RefreshTokenRepositoryPort` — `backend/src/domain/ports/repositories.ts` (Const. III)
- [x] T011 [P] Puertos servicio `PasswordHasherPort`, `TokenIssuerPort`, `SessionStatePort`, `GraceCachePort`, `RateLimitPort`, `ClockPort` — `backend/src/domain/ports/services.ts` (research D3/D6/D7)
- [x] T012 [P] `Result<Ok,Err>` + catálogo de errores de dominio (mapa a `code` del contrato) — `backend/src/domain/result.ts` (Const. X)

### Persistencia

- [x] T013 Esquema Prisma `User`/`Session`/`RefreshToken` (UUID v7, `locked_until`, `disabled_at`) + **unicidad global email/username a nivel de ESQUEMA** (`identifier_norm` en índice/tabla único, no dos índices por columna — FR-001b/D11) + migración reversible — `backend/prisma/schema.prisma`, `backend/prisma/migrations/` (data-model)
- [x] T014 Seed: usuarios (3 roles, ≥12 argon2id; **incluir 1 usuario `disabled` y 1 con `locked_until`** para tests) + **fixtures `ProbeResource` (3 casos + inexistente, FR-017b/H-003)**: probe-A [dispatcher,supervisor] (200 ambos), probe-B [supervisor] (200 supervisor / **404-por-alcance** dispatcher), **probe-C [dispatcher] (200 dispatcher / 404-por-alcance supervisor)**, + id inexistente (404-por-inexistencia) — `backend/prisma/seed.ts`

### Cross-cutting + tests Red

- [x] T015 [P] **[Red]** unit config fail-fast (Zod, nombra variable faltante) **+ caso pairwise-distinct: dos de los 3 secretos (JWT/CSRF/LOCKOUT HMAC) iguales → aborta nombrando el par** (S-002) — `backend/tests/unit/config.spec.ts` (FR-016/SC-006)
- [x] T016 [P] **[Red]** test cabeceras de seguridad (lista cerrada) — `backend/tests/integration/security-headers.spec.ts` (FR-012)
- [x] T017 [P] **[Red]** test correlation-id en logs sin PII **ni tokens ni `password`** (Authorization/Set-Cookie/*_token/**password**/identifier redactados; correlación por user_id no-PII) — `backend/tests/integration/correlation-id.spec.ts` (FR-014, S-001)
- [x] T018 [P] **[Red]** contract test `health`/`ready` (200 / 200|503) — `backend/tests/contract/ops.contract.spec.ts` (FR-015)
- [x] T019 Config validada + arranque fail-fast **(incluye chequeo pairwise-distinct de los 3 secretos, S-002)** — `backend/src/infra/config.ts` (FR-016)
- [x] T020 [P] Middleware correlation-id + pino con **redacción** (identifier, **password**, Authorization, Set-Cookie, access/refresh/csrf_token) — `backend/src/handlers/middleware/correlation.ts` (FR-014, S-001)
- [x] T021 [P] Middleware helmet (HSTS≥15552000, CSP default-src 'self', X-CTO nosniff, X-Frame DENY, Referrer no-referrer) — `backend/src/handlers/middleware/security-headers.ts` (FR-012)
- [x] T022 [P] `error-mapper` `Result`→`{code,message,details?,agent_action?}` + HTTP correcto; **captura `SyntaxError` del body-parser → 422** (no 400/500 de Express) con test `should 422 on malformed JSON body` — `backend/src/handlers/error-mapper.ts` (FR-013, H-005)
- [x] T023 Endpoints `/health` y `/ready` (check BD) — `backend/src/handlers/ops.ts` (FR-015)
- [x] T024 Adaptador `SessionState` in-memory (set revocación por sid + usuarios disabled, TTL≤30s, write-through; **fallback a BD en miss consulta familia Y `User.disabled_at`**, **fail-closed** si BD cae; per-instancia) — `backend/src/infra/session-state/in-memory.ts` (research D3, FR-004b/c, H-001)
- [x] T025 **[Red]** unit middleware `authenticate` (JWT local; cache-miss→BD; **fail-closed** ante fallo BD) — `backend/tests/unit/authenticate.spec.ts` (research D3, FR-004c/007)
- [x] T026 Middleware `authenticate` (verifica JWT + `SessionStatePort`: **disabled Y familia revocada** por-request vía caché+fallback; disabled corta, locked_until no) — `backend/src/handlers/middleware/authenticate.ts` (FR-004c/007)

**Checkpoint**: fundación lista (contrato, puertos, BD, cross-cutting, authenticate) → historias.

---

## Phase 3: User Story 1 — Iniciar y cerrar sesión (P1) 🎯 MVP

**Goal**: login crea sesión (access Bearer + refresh cookie); `me` responde; logout revoca la actual.
**Independent Test**: seed → login → `me` (200) → logout → `me`/refresh (401). Usa `me` (contractual), no depende de US3.

### Tests Red ⚠️

- [x] T027 [P] [US1] **[Red]** Contract test `login` 200/401/422/429 — `backend/tests/contract/login.contract.spec.ts` (FR-001/002/011)
- [x] T028 [P] [US1] **[Red]** Contract test `logout` 204/401/403/503 (503 = BD caída, fail-closed) — `backend/tests/contract/logout.contract.spec.ts` (FR-003/018)
- [x] T029 [P] [US1] **[Red]** Contract test `me` 200/401 — `backend/tests/contract/me.contract.spec.ts` (FR-006)
- [x] T030 [P] [US1] **[Red]** Unit credenciales + resolución de identifier a único usuario (normalizado) — `backend/tests/unit/login.spec.ts` (FR-001b/002) *(K-004: ruta real)*
- [x] T031 [P] [US1] **[Red]** Unit lockout 5/15min ventana fija + **reset al expirar/caducar** — `backend/tests/unit/lockout.spec.ts` (FR-011/SC-004)
- [x] T032 [P] [US1] **[Red]** Integration login/logout: válido→sesión; inválido→401 uniforme; **cuenta `disabled`→401 uniforme y NO se puede re-loguear + cuenta para el lockout (429 indistinguible)** (FR-002b); logout revoca solo la actual; **2º logout con cookie revocada→401** (no idempotente); **logout de cuenta `disabled` con cookie vigente→204**; **logout con token rotado (sesión vigente)→204** (revoca sesión); **logout con token rotado FUERA de gracia→204 + revoca familia (FR-004b)**; **logout con token rotado DENTRO de gracia→204 SIN FR-004b**; **logout con sesión ya revocada→401** (uniforme) — `backend/tests/integration/login-logout.spec.ts` (FR-001/002/002b/003/003b/004b/018, SC-001, D12)

### Implementación

- [x] T033 [P] [US1] Adaptador `PasswordHasher` argon2id (OWASP) + **hash dummy anti-timing** — `backend/src/infra/crypto/password-hasher.ts` (D4, FR-011)
- [x] T034 [P] [US1] Adaptador `TokenIssuer` (JWT HS256 sub/sid/role/exp; refresh opaco + hash SHA-256) — `backend/src/infra/crypto/token-issuer.ts` (D5)
- [x] T035 [P] [US1] Adaptador `RateLimit` in-memory (por usuario resuelto y por **HMAC-SHA256(identifier norm., `LOCKOUT_HMAC_SECRET`)**; los intentos contra cuenta `disabled` **cuentan** igual) — `backend/src/infra/ratelimit/in-memory.ts` (D7, FR-011/002b)
- [x] T036 [US1] Repos Prisma `User`/`Session`/`RefreshToken` — `backend/src/infra/repositories/*.ts` (data-model)
- [x] T037 [US1] Caso de uso `login` (credenciales→sesión, lockout, Result; ****fail-closed: BD caída → 503 (B3/H-003)**; chequeo de `disabled` DESPUÉS del hash de contraseña** para no filtrar timing, 401 uniforme — FR-002b) — `backend/src/domain/auth/login.ts` (FR-001/002/002b/011)
- [x] T038 [US1] Caso de uso `logout` (revoca la **sesión (sid)** si no está revocada: marca `Session.revoked_at`; **aunque el token esté rotado o la cuenta disabled** → 204; **token rotado FUERA de gracia → además FR-004b** (revoca familia); chequeo rotación/gracia contra **BD**, fail-closed 503; 401 uniforme; 2º logout sesión revocada → 401) — `backend/src/domain/auth/logout.ts` (FR-003/004b/018, D12)
- [x] T039 [US1] Handler `POST /v1/auth/login` (set-cookie refresh HttpOnly + csrf_token; access en body) — `backend/src/handlers/auth/login.ts` (FR-001, D1/D2)
- [x] T040 [US1] Handler `POST /v1/auth/logout` (204 si sesión no revocada —aunque token rotado/cuenta disabled—; 401 si sesión ya revocada; 503 si BD caída; limpia cookies) — `backend/src/handlers/auth/logout.ts` (FR-003/018, D12)
- [x] T041 [US1] Handler `GET /v1/auth/me` — `backend/src/handlers/auth/me.ts` (FR-006)

**Checkpoint**: US1 funcional y testeable de forma independiente (login→me→logout).

---

## Phase 4: User Story 3 — Control de acceso por rol (RBAC) (P1)

**Goal**: 401/403/404 deterministas por middleware. **Independent Test**: por rol, invocar `rbacProbe`.

### Tests Red ⚠️

- [x] T042 [P] [US3] **[Red]** Contract test `rbacProbe` 200/401/403/404 — `backend/tests/contract/rbac-probe.contract.spec.ts` (FR-007/008/009/017/017b)
- [x] T043 [P] [US3] **[Red]** Unit política rol×alcance + regla **orden rol(403)→pertenencia(404)** (technician→403; dispatcher/supervisor→200 en alcance/404 fuera) — `backend/tests/unit/rbac-policy.spec.ts` (FR-017/017b)
- [x] T044 [P] [US3] **[Red]** Integration RBAC: no-auth→401; technician→403; dispatcher/supervisor→200 (probe-A); **404-por-alcance para AMBOS roles** (dispatcher sobre probe-B, **supervisor sobre probe-C**) **distinto** de **404-por-inexistencia** (id inexistente); forzando la API — `backend/tests/integration/rbac.spec.ts` (FR-007/008/009/010/017/017b, SC-002)

### Implementación

- [x] T045 [US3] Política RBAC en dominio (matriz rol×alcance + orden rol→pertenencia, base-ready para 002) — `backend/src/domain/rbac/policy.ts` (FR-010/017/017b)
- [x] T046 [US3] Middleware `authorize` (aplica política; 403/404) — `backend/src/handlers/middleware/authorize.ts` (FR-008/009/017/018)
- [x] T047 [US3] Handler `GET /v1/rbac/probe/{id}` (doble de prueba con fixture de pertenencia) — `backend/src/handlers/rbac/probe.ts` (FR-017b)

**Checkpoint**: US1 + US3 (auth + RBAC completos).

---

## Phase 5: User Story 2 — Mantener la sesión (refresh) (P2)

**Goal**: refresh rota single-use; reuso→revoca familia; caducado/revocado→401. **Independent Test**:
sesión válida→refresh OK; revocar/expirar→falla; reuso→familia revocada; reintento en gracia→mismo par.

### Tests Red ⚠️

- [x] T048 [P] [US2] **[Red]** Contract test `refresh` 200/401/403/503 (503 = BD caída, fail-closed) — `backend/tests/contract/refresh.contract.spec.ts` (FR-004/005/012/018)
- [x] T049 [P] [US2] **[Red]** Unit rotación single-use atómica + gracia (mismo par) + reuso→familia + **relectura de rol** — `backend/tests/unit/refresh-rotation.spec.ts` (FR-004/004b/004d)
- [x] T050 [P] [US2] **[Red]** Integration refresh: rota; revocado/caducado→**401 uniforme** (sin distinguir causa, FR-005); reuso→**solo familia comprometida** revocada (otras sesiones concurrentes siguen) + **access de esa familia invalidado por-request (write-through, efectivo en la misma petición)** (FR-004b/004c); reintento ≤10s→mismo par; `disabled`→401 en validación/refresh, `locked_until` **no** corta sesiones activas; **refresh rechazado si un `logout` concurrente revoca la sesión (rotación atómica, no emite tokens)**; **hit de gracia tras revocación/disable concurrente → 401 (re-check BD, NO sirve el trío cacheado)** — `backend/tests/integration/refresh.spec.ts` (FR-004/004b/004c/004d/005, SC-003, H-001/H-005/S-001)
- [x] T051 [P] [US2] **[Red]** Integration orden **401-antes-403** en refresh Y logout + CSRF double-submit (cabecera≠cookie o ausente→403 con sesión) — `backend/tests/integration/csrf-order.spec.ts` (FR-012/018, D2)
- [x] T052 [P] [US2] **[Red]** Contract test contenido `ErrorResponse` (`details` allowlist + `message`): 401/429 sin oráculo; 403/404 sin propiedad/alcance; **nunca password/tokens/identifier, ni en un 422** — `backend/tests/contract/error-details.contract.spec.ts` (FR-002/011/014/017, S-001/S-005/S-103)

### Implementación

- [x] T053 [P] [US2] Adaptador `GraceCache` in-memory (hash token→**trío access+refresh+csrf en claro**, TTL=gracia; **antes de servir, re-comprueba contra BD `Session.revoked_at`/`disabled`** → si revocada/disabled 401, no sirve; no persiste en BD) — `backend/src/infra/grace-cache/in-memory.ts` (D6, FR-004d, H-005/S-001)
- [x] T054 [US2] Caso de uso `refresh` (rotación **atómica exige sesión no revocada**, implementada como **un ÚNICO `$executeRaw`** `UPDATE … WHERE rotated_at IS NULL AND EXISTS(sesión no revocada)` —no SELECT+updateMany— → cierra TOCTOU logout↔refresh (B2/I-002); gracia→GraceCache; reuso→revoca familia+SessionState; FR-004c disabled; **relee rol de BD**; fail-closed BD caída→503) — `backend/src/domain/auth/refresh.ts` (FR-004/004b/004c/004d/005, H-001)
- [x] T055 [US2] Middleware `csrf` double-submit (refresh Y logout; **sesión antes que CSRF**; tiempo constante); **consulta `SessionValidityPort` (adaptador `RefreshSessionValidity`) cuando el CSRF falla → 401 si la sesión NO es válida (inexistente/caducada/revocada/**disabled**, vía AccountStatePort), 403 si es válida (B1/I-001/S-001, FR-018/FR-004c)** — `backend/src/handlers/middleware/csrf.ts`, `backend/src/infra/session-validity.ts` (D2, FR-012/018)
- [x] T056 [US2] Handler `POST /v1/auth/refresh` (rota refresh + csrf; access en body) — `backend/src/handlers/auth/refresh.ts` (FR-004/005)

**Checkpoint**: las 3 historias funcionales e independientes.

---

## Phase 6: Polish & Cross-Cutting

- [ ] T057 [P] **[Red→verde]** Perf SC-001/SC-005: N≥200, secuencial, **descartar las primeras 20 (warm-up)**, **server-side** (P95<300ms auth; login<1s) — `backend/tests/integration/perf.spec.ts` (SC-001/005, D9)
- [ ] T058 [P] **[Red→verde]** Anti-enumeración: **|P95(causa_i)−P95(causa_j)|<50ms** entre las **3 causas** de 401 de login (inválidas / inexistente / **disabled**), N≥200/grupo, server-side — `backend/tests/integration/enumeration-timing.spec.ts` (FR-011/002b, D9)
- [x] T059 [P] Test de arquitectura: `domain/` no importa express/prisma/jsonwebtoken — `backend/tests/unit/architecture.spec.ts` (Const. III)
- [ ] T060 [P] **[Red]** Integration reinicio/cache-miss: (a) familia revocada sigue revocada; **(b) usuario `disabled` sigue cortado (401) tras reinicio — no recupera acceso al expirar TTL≤30s**; (c) `locked_until` persiste en BD; **(d) cuenta RE-HABILITADA (`disabled_at`→NULL) recupera acceso en hot path ≤30s** (caché TTL re-evaluado, no add-only, H-006) — todo vía fallback/re-eval de caché — `backend/tests/integration/restart-revocation.spec.ts` (D3, FR-004b/004c, H-001/H-006)
- [ ] T061 [P] **[Red]** Integration camino-caché per-request (régimen a): (a) `me`/`rbacProbe` con access **aún vigente** inmediatamente tras revocación de familia/disable → **401** (write-through efectivo en esa petición); (b) **fail-closed (regla única)**: fallo/timeout de BD en cache-miss → **401 en per-request** (Bearer) y **503 en `refresh`**, nunca 200 — `backend/tests/integration/session-state.spec.ts` (D3, FR-004b/004c, H-002/H-003/T-001)
- [x] T062 [P] **[Red]** Unit reset de ventana de lockout (5 fallos frescos tras desbloqueo; ventana caducada→nueva) — `backend/tests/unit/lockout-reset.spec.ts` (FR-011)
- [x] T063 [US2 impl] Wiring DI (puertos→adaptadores) + arranque servidor — `backend/src/infra/container.ts`, `backend/src/main.ts`
- [x] T064 [P] Actualizar `docs/traceability.md` con matriz RF→tarea→test de 001 — `docs/traceability.md` (Const. VI)
- [ ] T065 [P] Mapear tests a STRIDE de `threat-model.md`: **100% amenazas ALTA/BLOQUEANTE con Txxx explícito** — `specs/001-fundacion-auth-rbac/threat-model.md` (T057)
- [ ] T066 Validación `quickstart.md` end-to-end en máquina limpia (`make up && make test`) — (quickstart)

---

## Dependencies & Execution Order

- **Setup (T001–T007)** → **Foundational (T008–T026)** bloquea todas las historias. `authenticate` +
  `SessionState` viven aquí (cross-cutting) → US1 no depende de US3.
- **US1 (T027–T041)** P1/MVP: usa `me` (contractual) para su Independent Test.
- **US3 (T042–T047)** P1: `authorize` + `rbacProbe` sobre la política RBAC.
- **US2 (T048–T056)** P2: refresh + CSRF; usa `TokenIssuer` (US1) y `SessionState`/`GraceCache` (Foundational/US2).
- **Polish (T057–T066)** tras las 3 historias.
- **Orden recomendado:** Setup → Foundational → US1 → US3 → US2 → Polish.

### TDD

Tests [Red] (commit en rojo) **antes** de la implementación. Dominio antes que handlers. Adaptadores
implementan puertos de Foundational.

### Parallel Opportunities

- Setup: T003–T007. Foundational: T009–T012, T015–T018, T020–T022. Dentro de cada historia, los tests [P] y
  adaptadores en ficheros distintos [P].

---

## Implementation Strategy

- **MVP** = Setup + Foundational + **US1** (login/me/logout + lockout): identidad demostrable.
- Incremental: +US3 (RBAC) → +US2 (refresh/CSRF) → Polish (perf, anti-enum, fail-closed, arquitectura, STRIDE).
- **Gate G3** (tras implement + tests verdes): panel acumulativo G1+G2 + `revisor-implementacion`; SC por
  tests (sin IA → sin promptfoo en 001).

## Notas

- TDD: **commit del test en rojo** antes del de implementación (verificable en historial).
- Adaptadores in-memory (session-state, grace, rate-limit) = slice single-instance; Redis multi-instancia → BL-018.
- No `any` sin `// JUSTIFICACIÓN:`; no imports de infra en `domain/`; no commitear con bloqueantes de gate abiertos.

---

## Phase 7: Remediación G3 (bloqueantes del panel adversarial)

> El gate G3 (5 revisores) encontró incongruencias con los 104 tests en verde. Cerrados por TDD (test Red
> que reproduce el fallo → fix → Green). Ver `gates/gate-G3-001-fundacion-auth-rbac.md`.

- [x] B1 [US2] **Orden CSRF (FR-018/I-001/S-001)** — `csrf` consulta `SessionValidityPort` → 401 si sesión
  inválida (inexistente/caducada/revocada/**disabled**, esta última vía `AccountStatePort`, FR-004c) aunque
  falle el CSRF; 403 solo si sesión válida — `backend/src/handlers/middleware/csrf.ts`,
  `backend/src/infra/session-validity.ts`; tests `backend/tests/unit/session-validity.spec.ts` (4 ramas) +
  `backend/tests/integration/csrf-order.spec.ts` (revocada y disabled → 401).
- [x] B2 [US2] **Rotación atómica (FR-004/I-002/H-001)** — un único `$executeRaw` con `EXISTS(sesión no
  revocada)` — `backend/src/infra/repositories/refresh-token-repository.ts`.
- [x] B3 [US1] **login fail-closed 503 (H-003)** — try/catch → `SERVICE_UNAVAILABLE` — `backend/src/domain/auth/login.ts`;
  test en `backend/tests/unit/login.spec.ts`.
- [x] B4 [US2] **401 uniforme de refresh (FR-005/T-001)** — test compara `code`+`message` entre las 4 causas
  (caducado/revocado/reuso/disabled) — `backend/tests/unit/refresh-rotation.spec.ts`.
- [x] B5 [US2] **Invalidación inmediata e2e (FR-004b/T-002)** — reuso→revoca familia→access previo 401 en la
  misma petición — `backend/tests/integration/immediate-invalidation.spec.ts`.
- [x] B6 [US2] **Atomicidad de rotación (H-002)** — sesión revocada → `rotateAtomic` no rota —
  `backend/tests/integration/rotate-atomic.spec.ts`.

**Diferido a backlog (no bloqueante, BL-035..044):** T057/T058 (perf P95 SC-001/005 + paridad de timing),
T060/T061 (restart/cache per-request e2e), T065/T066 (STRIDE↔test, quickstart e2e), y MEDIAS (traza forense
S-002, CSRF_HMAC sin usar S-003, timeout BD H-005, durabilidad lockout H-006, carrera refresh H-007).
