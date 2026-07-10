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

- [ ] T001 Crear estructura hexagonal `backend/src/{domain/{auth,rbac,ports},handlers/middleware,infra}` y `backend/tests/{unit,integration,contract}` — `backend/`
- [ ] T002 Init Node/TS strict + deps (express, prisma, zod, argon2, jsonwebtoken, helmet, pino, cookie-parser) y devDeps (vitest, supertest, coverage) — `backend/package.json`, `backend/tsconfig.json`
- [ ] T003 [P] ESLint (cero `any` sin justificación, ≤50 líneas/func, ≤300/fichero, named exports) + Prettier — `backend/eslint.config.mjs`
- [ ] T004 [P] Vitest (unit sin BD, integration/contract con Postgres docker) + umbrales cobertura (dominio ≥80%, servicios ≥80%) — `backend/vitest.config.ts`
- [ ] T005 [P] `docker-compose.yml` con PostgreSQL 16 (BD dev + BD test) — `docker-compose.yml`
- [ ] T006 [P] `Makefile`/scripts: install, up, test, gate — `Makefile`, `backend/package.json`
- [ ] T007 [P] `.env.example` (JWT_SECRET, **CSRF_HMAC_SECRET ≠ JWT_SECRET**, **LOCKOUT_HMAC_SECRET ≠ ambos** (D7), DATABASE_URL, ACCESS_TTL=900, REFRESH_TTL_DAYS=7, **GRACE_MS=10000**, LOCKOUT_MAX=5, LOCKOUT_WINDOW_MIN=15); los 3 secretos validados en fail-fast (T015/T019) — `.env.example`

---

## Phase 2: Foundational (bloquea todas las historias)

### Contrato y puertos

- [ ] T008 Tipos TS desde `contracts/auth.openapi.yaml` (openapi-typescript) + transform snake↔camel en boundary — `backend/src/handlers/contract/types.ts` (Const. II)
- [ ] T009 [P] Esquemas Zod derivados del contrato — `backend/src/handlers/contract/schemas.ts` (Const. II)
- [ ] T010 [P] Puertos repos `UserRepositoryPort`, `SessionRepositoryPort`, `RefreshTokenRepositoryPort` — `backend/src/domain/ports/repositories.ts` (Const. III)
- [ ] T011 [P] Puertos servicio `PasswordHasherPort`, `TokenIssuerPort`, `SessionStatePort`, `GraceCachePort`, `RateLimitPort`, `ClockPort` — `backend/src/domain/ports/services.ts` (research D3/D6/D7)
- [ ] T012 [P] `Result<Ok,Err>` + catálogo de errores de dominio (mapa a `code` del contrato) — `backend/src/domain/result.ts` (Const. X)

### Persistencia

- [ ] T013 Esquema Prisma `User`/`Session`/`RefreshToken` (UUID v7, `locked_until`, `disabled_at`) + **unicidad global email/username a nivel de ESQUEMA** (`identifier_norm` en índice/tabla único, no dos índices por columna — FR-001b/D11) + migración reversible — `backend/prisma/schema.prisma`, `backend/prisma/migrations/` (data-model)
- [ ] T014 Seed: usuarios (3 roles, ≥12 argon2id; **incluir 1 usuario `disabled` y 1 con `locked_until`** para tests) + **fixtures `ProbeResource` (3 casos + inexistente, FR-017b/H-003)**: probe-A [dispatcher,supervisor] (200 ambos), probe-B [supervisor] (200 supervisor / **404-por-alcance** dispatcher), **probe-C [dispatcher] (200 dispatcher / 404-por-alcance supervisor)**, + id inexistente (404-por-inexistencia) — `backend/prisma/seed.ts`

### Cross-cutting + tests Red

- [ ] T015 [P] **[Red]** unit config fail-fast (Zod, nombra variable faltante) **+ caso pairwise-distinct: dos de los 3 secretos (JWT/CSRF/LOCKOUT HMAC) iguales → aborta nombrando el par** (S-002) — `backend/tests/unit/config.spec.ts` (FR-016/SC-006)
- [ ] T016 [P] **[Red]** test cabeceras de seguridad (lista cerrada) — `backend/tests/integration/security-headers.spec.ts` (FR-012)
- [ ] T017 [P] **[Red]** test correlation-id en logs sin PII **ni tokens ni `password`** (Authorization/Set-Cookie/*_token/**password**/identifier redactados; correlación por user_id no-PII) — `backend/tests/integration/correlation-id.spec.ts` (FR-014, S-001)
- [ ] T018 [P] **[Red]** contract test `health`/`ready` (200 / 200|503) — `backend/tests/contract/ops.contract.spec.ts` (FR-015)
- [ ] T019 Config validada + arranque fail-fast **(incluye chequeo pairwise-distinct de los 3 secretos, S-002)** — `backend/src/infra/config.ts` (FR-016)
- [ ] T020 [P] Middleware correlation-id + pino con **redacción** (identifier, **password**, Authorization, Set-Cookie, access/refresh/csrf_token) — `backend/src/handlers/middleware/correlation.ts` (FR-014, S-001)
- [ ] T021 [P] Middleware helmet (HSTS≥15552000, CSP default-src 'self', X-CTO nosniff, X-Frame DENY, Referrer no-referrer) — `backend/src/handlers/middleware/security-headers.ts` (FR-012)
- [ ] T022 [P] `error-mapper` `Result`→`{code,message,details?,agent_action?}` + HTTP correcto — `backend/src/handlers/error-mapper.ts` (FR-013)
- [ ] T023 Endpoints `/health` y `/ready` (check BD) — `backend/src/handlers/ops.ts` (FR-015)
- [ ] T024 Adaptador `SessionState` in-memory (set revocación por sid + usuarios disabled, TTL≤30s, write-through; **fallback a BD en miss consulta familia Y `User.disabled_at`**, **fail-closed** si BD cae; per-instancia) — `backend/src/infra/session-state/in-memory.ts` (research D3, FR-004b/c, H-001)
- [ ] T025 **[Red]** unit middleware `authenticate` (JWT local; cache-miss→BD; **fail-closed** ante fallo BD) — `backend/tests/unit/authenticate.spec.ts` (research D3, FR-004c/007)
- [ ] T026 Middleware `authenticate` (verifica JWT + `SessionStatePort`: **disabled Y familia revocada** por-request vía caché+fallback; disabled corta, locked_until no) — `backend/src/handlers/middleware/authenticate.ts` (FR-004c/007)

**Checkpoint**: fundación lista (contrato, puertos, BD, cross-cutting, authenticate) → historias.

---

## Phase 3: User Story 1 — Iniciar y cerrar sesión (P1) 🎯 MVP

**Goal**: login crea sesión (access Bearer + refresh cookie); `me` responde; logout revoca la actual.
**Independent Test**: seed → login → `me` (200) → logout → `me`/refresh (401). Usa `me` (contractual), no depende de US3.

### Tests Red ⚠️

- [ ] T027 [P] [US1] **[Red]** Contract test `login` 200/401/422/429 — `backend/tests/contract/login.contract.spec.ts` (FR-001/002/011)
- [ ] T028 [P] [US1] **[Red]** Contract test `logout` 204/401/403 — `backend/tests/contract/logout.contract.spec.ts` (FR-003/018)
- [ ] T029 [P] [US1] **[Red]** Contract test `me` 200/401 — `backend/tests/contract/me.contract.spec.ts` (FR-006)
- [ ] T030 [P] [US1] **[Red]** Unit credenciales + resolución de identifier a único usuario (normalizado) — `backend/tests/unit/auth-credentials.spec.ts` (FR-001b/002)
- [ ] T031 [P] [US1] **[Red]** Unit lockout 5/15min ventana fija + **reset al expirar/caducar** — `backend/tests/unit/lockout.spec.ts` (FR-011/SC-004)
- [ ] T032 [P] [US1] **[Red]** Integration login/logout: válido→sesión; inválido→401 uniforme; **cuenta `disabled`→401 uniforme y NO se puede re-loguear + cuenta para el lockout (429 indistinguible)** (FR-002b); logout revoca solo la actual; **2º logout con cookie revocada→401** (no idempotente); **logout de cuenta `disabled` con cookie vigente→204** (revoca, sin chequeo de estado); **logout con familia ya revocada→401** — `backend/tests/integration/login-logout.spec.ts` (FR-001/002/002b/003/003b/018, SC-001)

### Implementación

- [ ] T033 [P] [US1] Adaptador `PasswordHasher` argon2id (OWASP) + **hash dummy anti-timing** — `backend/src/infra/crypto/password-hasher.ts` (D4, FR-011)
- [ ] T034 [P] [US1] Adaptador `TokenIssuer` (JWT HS256 sub/sid/role/exp; refresh opaco + hash SHA-256) — `backend/src/infra/crypto/token-issuer.ts` (D5)
- [ ] T035 [P] [US1] Adaptador `RateLimit` in-memory (por usuario resuelto y por **HMAC-SHA256(identifier norm., `LOCKOUT_HMAC_SECRET`)**; los intentos contra cuenta `disabled` **cuentan** igual) — `backend/src/infra/ratelimit/in-memory.ts` (D7, FR-011/002b)
- [ ] T036 [US1] Repos Prisma `User`/`Session`/`RefreshToken` — `backend/src/infra/repositories/*.ts` (data-model)
- [ ] T037 [US1] Caso de uso `login` (credenciales→sesión, lockout, Result; **chequeo de `disabled` DESPUÉS del hash de contraseña** para no filtrar timing, 401 uniforme — FR-002b) — `backend/src/domain/auth/login.ts` (FR-001/002/002b/011)
- [ ] T038 [US1] Caso de uso `logout` (revoca a **nivel de sesión**: marca `Session.revoked_at` del sid; **NO comprueba estado de cuenta** → 204 con cookie vigente aunque disabled; no idempotente) — `backend/src/domain/auth/logout.ts` (FR-003/018)
- [ ] T039 [US1] Handler `POST /v1/auth/login` (set-cookie refresh HttpOnly + csrf_token; access en body) — `backend/src/handlers/auth/login.ts` (FR-001, D1/D2)
- [ ] T040 [US1] Handler `POST /v1/auth/logout` (204 con cookie vigente + CSRF ok, sin chequeo de estado; 401 si cookie no vigente —incl. familia revocada—; limpia cookies) — `backend/src/handlers/auth/logout.ts` (FR-003/018)
- [ ] T041 [US1] Handler `GET /v1/auth/me` — `backend/src/handlers/auth/me.ts` (FR-006)

**Checkpoint**: US1 funcional y testeable de forma independiente (login→me→logout).

---

## Phase 4: User Story 3 — Control de acceso por rol (RBAC) (P1)

**Goal**: 401/403/404 deterministas por middleware. **Independent Test**: por rol, invocar `rbacProbe`.

### Tests Red ⚠️

- [ ] T042 [P] [US3] **[Red]** Contract test `rbacProbe` 200/401/403/404 — `backend/tests/contract/rbac-probe.contract.spec.ts` (FR-007/008/009/017/017b)
- [ ] T043 [P] [US3] **[Red]** Unit política rol×alcance + regla **orden rol(403)→pertenencia(404)** (technician→403; dispatcher/supervisor→200 en alcance/404 fuera) — `backend/tests/unit/rbac-policy.spec.ts` (FR-017/017b)
- [ ] T044 [P] [US3] **[Red]** Integration RBAC: no-auth→401; technician→403; dispatcher/supervisor→200 (probe-A); **404-por-alcance para AMBOS roles** (dispatcher sobre probe-B, **supervisor sobre probe-C**) **distinto** de **404-por-inexistencia** (id inexistente); forzando la API — `backend/tests/integration/rbac.spec.ts` (FR-007/008/009/010/017/017b, SC-002)

### Implementación

- [ ] T045 [US3] Política RBAC en dominio (matriz rol×alcance + orden rol→pertenencia, base-ready para 002) — `backend/src/domain/rbac/policy.ts` (FR-010/017/017b)
- [ ] T046 [US3] Middleware `authorize` (aplica política; 403/404) — `backend/src/handlers/middleware/authorize.ts` (FR-008/009/017/018)
- [ ] T047 [US3] Handler `GET /v1/rbac/probe/{id}` (doble de prueba con fixture de pertenencia) — `backend/src/handlers/rbac/probe.ts` (FR-017b)

**Checkpoint**: US1 + US3 (auth + RBAC completos).

---

## Phase 5: User Story 2 — Mantener la sesión (refresh) (P2)

**Goal**: refresh rota single-use; reuso→revoca familia; caducado/revocado→401. **Independent Test**:
sesión válida→refresh OK; revocar/expirar→falla; reuso→familia revocada; reintento en gracia→mismo par.

### Tests Red ⚠️

- [ ] T048 [P] [US2] **[Red]** Contract test `refresh` 200/401/403 — `backend/tests/contract/refresh.contract.spec.ts` (FR-004/005/012/018)
- [ ] T049 [P] [US2] **[Red]** Unit rotación single-use atómica + gracia (mismo par) + reuso→familia + **relectura de rol** — `backend/tests/unit/refresh-rotation.spec.ts` (FR-004/004b/004d)
- [ ] T050 [P] [US2] **[Red]** Integration refresh: rota; revocado/caducado→**401 uniforme** (sin distinguir causa, FR-005); reuso→**solo familia comprometida** revocada (otras sesiones concurrentes siguen) + **access de esa familia invalidado por-request (write-through, efectivo en la misma petición)** (FR-004b/004c); reintento ≤10s→mismo par; `disabled`→401 en validación/refresh, `locked_until` **no** corta sesiones activas; **refresh rechazado si un `logout` concurrente revoca la sesión (rotación atómica, no emite tokens)** — `backend/tests/integration/refresh.spec.ts` (FR-004/004b/004c/004d/005, SC-003, H-001)
- [ ] T051 [P] [US2] **[Red]** Integration orden **401-antes-403** en refresh Y logout + CSRF double-submit (cabecera≠cookie o ausente→403 con sesión) — `backend/tests/integration/csrf-order.spec.ts` (FR-012/018, D2)
- [ ] T052 [P] [US2] **[Red]** Contract test contenido `ErrorResponse` (`details` allowlist + `message`): 401/429 sin oráculo; 403/404 sin propiedad/alcance; **nunca password/tokens/identifier, ni en un 422** — `backend/tests/contract/error-details.contract.spec.ts` (FR-002/011/014/017, S-001/S-005/S-103)

### Implementación

- [ ] T053 [P] [US2] Adaptador `GraceCache` in-memory (hash token→**trío access+refresh+csrf en claro**, TTL=gracia; re-sirve el mismo trío en reintento; no persiste en BD) — `backend/src/infra/grace-cache/in-memory.ts` (D6, FR-004d, H-005)
- [ ] T054 [US2] Caso de uso `refresh` (rotación **atómica exige sesión no revocada**: `WHERE rotated_at IS NULL AND` sesión no revocada / `SELECT … FOR UPDATE` → cierra TOCTOU logout↔refresh; gracia→GraceCache; reuso→revoca familia+SessionState; FR-004c disabled; **relee rol de BD**; fail-closed BD caída→503) — `backend/src/domain/auth/refresh.ts` (FR-004/004b/004c/004d/005, H-001)
- [ ] T055 [US2] Middleware `csrf` double-submit (refresh Y logout; **sesión antes que CSRF**; tiempo constante) — `backend/src/handlers/middleware/csrf.ts` (D2, FR-012/018)
- [ ] T056 [US2] Handler `POST /v1/auth/refresh` (rota refresh + csrf; access en body) — `backend/src/handlers/auth/refresh.ts` (FR-004/005)

**Checkpoint**: las 3 historias funcionales e independientes.

---

## Phase 6: Polish & Cross-Cutting

- [ ] T057 [P] **[Red→verde]** Perf SC-001/SC-005: N≥200, secuencial, **descartar las primeras 20 (warm-up)**, **server-side** (P95<300ms auth; login<1s) — `backend/tests/integration/perf.spec.ts` (SC-001/005, D9)
- [ ] T058 [P] **[Red→verde]** Anti-enumeración: **|P95(causa_i)−P95(causa_j)|<50ms** entre las **3 causas** de 401 de login (inválidas / inexistente / **disabled**), N≥200/grupo, server-side — `backend/tests/integration/enumeration-timing.spec.ts` (FR-011/002b, D9)
- [ ] T059 [P] Test de arquitectura: `domain/` no importa express/prisma/jsonwebtoken — `backend/tests/unit/architecture.spec.ts` (Const. III)
- [ ] T060 [P] **[Red]** Integration reinicio/cache-miss: (a) familia revocada sigue revocada; **(b) usuario `disabled` sigue cortado (401) tras reinicio — no recupera acceso al expirar TTL≤30s**; (c) `locked_until` persiste en BD — todo vía fallback a BD — `backend/tests/integration/restart-revocation.spec.ts` (D3, FR-004b/004c, H-001)
- [ ] T061 [P] **[Red]** Integration camino-caché per-request (régimen a): (a) `me`/`rbacProbe` con access **aún vigente** inmediatamente tras revocación de familia/disable → **401** (write-through efectivo en esa petición); (b) **fail-closed (regla única)**: fallo/timeout de BD en cache-miss → **401 en per-request** (Bearer) y **503 en `refresh`**, nunca 200 — `backend/tests/integration/session-state.spec.ts` (D3, FR-004b/004c, H-002/H-003/T-001)
- [ ] T062 [P] **[Red]** Unit reset de ventana de lockout (5 fallos frescos tras desbloqueo; ventana caducada→nueva) — `backend/tests/unit/lockout-reset.spec.ts` (FR-011)
- [ ] T063 [US2 impl] Wiring DI (puertos→adaptadores) + arranque servidor — `backend/src/infra/container.ts`, `backend/src/main.ts`
- [ ] T064 [P] Actualizar `docs/traceability.md` con matriz RF→tarea→test de 001 — `docs/traceability.md` (Const. VI)
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
