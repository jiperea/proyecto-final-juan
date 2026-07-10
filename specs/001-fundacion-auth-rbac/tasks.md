---
description: "Task list — 001 Fundación Auth/Sesión/RBAC"
---

# Tasks: Fundación — Autenticación, sesión y RBAC

**Input**: `specs/001-fundacion-auth-rbac/` (spec.md, plan.md, research.md, data-model.md,
contracts/auth.openapi.yaml, quickstart.md)

**Tests**: OBLIGATORIOS (Constitution VII — TDD con **fase Red verificable**: commit del test en rojo
**antes** del commit de implementación en la misma rama).

**Arquitectura**: hexagonal — `backend/src/{domain,handlers,infra}`; el dominio NO importa
Express/Prisma/JWT (se inyectan puertos). **Contract-first**: los contract tests derivan de
`contracts/auth.openapi.yaml` (operationId × código).

**Trazabilidad**: cada tarea de historia referencia su(s) FR; la matriz RF→endpoint→test vive en la spec
(§Trazabilidad) y se refleja aquí RF→tarea→test.

## Format: `[ID] [P?] [Story] Descripción (FRs) — ruta`

- **[P]** = paralelizable (ficheros distintos, sin dependencia pendiente).
- **[US1/US2/US3]** = historia (solo en fases de historia).

---

## Phase 1: Setup (infraestructura compartida)

- [ ] T001 Crear estructura hexagonal `backend/src/{domain/{auth,rbac,ports},handlers,infra}` y `backend/tests/{unit,integration,contract}` — `backend/`
- [ ] T002 Inicializar proyecto Node/TS strict con dependencias (express, prisma, zod, argon2, jsonwebtoken, helmet, pino, cookie-parser) y devDeps (vitest, supertest, @vitest/coverage) — `backend/package.json`, `backend/tsconfig.json`
- [ ] T003 [P] Configurar ESLint (reglas Constitution XII: cero `any` sin justificación, ≤50 líneas/func, ≤300 líneas/fichero, solo named exports) + Prettier — `backend/eslint.config.mjs`
- [ ] T004 [P] Configurar Vitest (unit sin BD, integration/contract con Postgres docker) + umbrales de cobertura (dominio ≥80%, servicios ≥80%) — `backend/vitest.config.ts`
- [ ] T005 [P] `docker-compose.yml` con PostgreSQL 16 (BD dev y BD de test independiente) — `docker-compose.yml`
- [ ] T006 [P] `Makefile` / scripts npm: `install`, `up`, `test`, `gate` — `Makefile`, `backend/package.json`
- [ ] T007 [P] `.env.example` con TODAS las variables (JWT_SECRET, DATABASE_URL, ACCESS_TTL=900, REFRESH_TTL_DAYS=7, LOCKOUT_MAX=5, LOCKOUT_WINDOW_MIN=15, GRACE_MS=10000) — `.env.example`

---

## Phase 2: Foundational (prerequisitos bloqueantes — antes de CUALQUIER historia)

**⚠️ Ninguna historia empieza hasta cerrar esta fase.**

### Contrato y tipos (contract-first)

- [ ] T008 Generar tipos TS desde `contracts/auth.openapi.yaml` (openapi-typescript) y helper de transform snake_case↔camelCase en el boundary — `backend/src/handlers/contract/types.ts` (FR-013, Const. II)
- [ ] T009 [P] Derivar esquemas Zod de request/response desde el contrato (LoginRequest, ErrorResponse, etc.) — `backend/src/handlers/contract/schemas.ts` (Const. II)

### Puertos de dominio (interfaces, sin infra)

- [ ] T010 [P] Definir puertos `UserRepositoryPort`, `SessionRepositoryPort`, `RefreshTokenRepositoryPort` — `backend/src/domain/ports/repositories.ts` (Const. III)
- [ ] T011 [P] Definir puertos `PasswordHasherPort`, `TokenIssuerPort`, `SessionStatePort`, `RateLimitPort`, `ClockPort` — `backend/src/domain/ports/services.ts` (Const. III, research D3/D4/D5/D7)
- [ ] T012 [P] Tipo `Result<Ok,Err>` y catálogo de errores de dominio (mapa a `code` del contrato) — `backend/src/domain/result.ts` (Const. X)

### Persistencia

- [ ] T013 Esquema Prisma: `User`, `Session`, `RefreshToken` (UUID v7, unicidad global email/username, `locked_until`, `disabled_at`) + migración inicial reversible — `backend/prisma/schema.prisma`, `backend/prisma/migrations/` (data-model, Const. §migraciones)
- [ ] T014 Seed de usuarios (dispatcher/technician/supervisor, contraseñas ≥12 argon2id) con actor de sistema — `backend/prisma/seed.ts` (spec §Assumptions)

### Cross-cutting (aplican a todas las historias)

- [ ] T015 [P] **[Test Red]** unit de validación de config (Zod) fail-fast que nombra variable faltante — `backend/tests/unit/config.spec.ts` (FR-016, SC-006)
- [ ] T016 [P] Middleware correlation-id + logging estructurado pino **sin PII** (redacta identifier) — `backend/src/handlers/middleware/correlation.ts` (FR-014)
- [ ] T017 [P] Middleware helmet con **lista cerrada** de cabeceras (HSTS≥15552000, CSP default-src 'self', X-CTO nosniff, X-Frame DENY, Referrer no-referrer) — `backend/src/handlers/middleware/security-headers.ts` (FR-012)
- [ ] T018 [P] Mapeador central `Result`→respuesta de error de contrato `{code,message,details?,agent_action?}` con HTTP correcto — `backend/src/handlers/error-mapper.ts` (FR-013)
- [ ] T019 Config validada + arranque fail-fast (implementa T015) — `backend/src/infra/config.ts` (FR-016)
- [ ] T020 [P] Endpoints `/health` (liveness) y `/ready` (readiness con check de BD) — `backend/src/handlers/ops.ts` (FR-015)

**Checkpoint**: fundación lista (contrato, puertos, BD, cross-cutting) → historias pueden empezar.

---

## Phase 3: User Story 1 — Iniciar y cerrar sesión (P1) 🎯 MVP

**Goal**: login con credenciales válidas crea sesión (access Bearer + refresh cookie); logout revoca la
sesión actual. **Independent Test**: seed → login → acceso a recurso protegido → logout → acceso falla.

### Tests primero (Red) ⚠️

- [ ] T021 [P] [US1] **[Red]** Contract test `login` 200/401/422/429 vs contrato — `backend/tests/contract/login.contract.spec.ts` (FR-001/002/011)
- [ ] T022 [P] [US1] **[Red]** Contract test `logout` 204/401 — `backend/tests/contract/logout.contract.spec.ts` (FR-003)
- [ ] T023 [P] [US1] **[Red]** Unit dominio: verificación de credenciales + resolución de identifier a único usuario — `backend/tests/unit/auth-credentials.spec.ts` (FR-001b/002)
- [ ] T024 [P] [US1] **[Red]** Unit dominio: lockout 5/15min ventana fija (no se extiende durante bloqueo) — `backend/tests/unit/lockout.spec.ts` (FR-011/SC-004)
- [ ] T025 [P] [US1] **[Red]** Integration: login válido→sesión; inválido→401 uniforme; logout revoca solo la actual (concurrentes siguen) — `backend/tests/integration/login-logout.spec.ts` (FR-001/002/003/003b, SC-001)

### Implementación

- [ ] T026 [P] [US1] Adaptador `PasswordHasher` argon2id (params OWASP calibrados) + hash dummy anti-timing — `backend/src/infra/crypto/password-hasher.ts` (research D4, FR-011)
- [ ] T027 [P] [US1] Adaptador `TokenIssuer`: JWT HS256 (claims sub/sid/role/exp) + refresh opaco (hash SHA-256) — `backend/src/infra/crypto/token-issuer.ts` (research D5)
- [ ] T028 [P] [US1] Adaptador `RateLimit` in-memory (contador por usuario resuelto y por identifier no resuelto) — `backend/src/infra/ratelimit/in-memory.ts` (research D7, FR-011)
- [ ] T029 [US1] Repos Prisma `User`/`Session`/`RefreshToken` (implementan puertos) — `backend/src/infra/repositories/*.ts` (data-model)
- [ ] T030 [US1] Caso de uso dominio `login` (credenciales→sesión, aplica lockout, Result) — `backend/src/domain/auth/login.ts` (FR-001/002/011)
- [ ] T031 [US1] Caso de uso dominio `logout` (revoca refresh de la sesión actual, idempotente) — `backend/src/domain/auth/logout.ts` (FR-003)
- [ ] T032 [US1] Handler `POST /v1/auth/login` (set-cookie refresh HttpOnly/SameSite=Strict + csrf_token; access en body) — `backend/src/handlers/auth/login.ts` (FR-001, research D1/D2)
- [ ] T033 [US1] Handler `POST /v1/auth/logout` (limpia cookies, 204) — `backend/src/handlers/auth/logout.ts` (FR-003)

**Checkpoint**: US1 funcional y testeable (login/logout + lockout).

---

## Phase 4: User Story 3 — Control de acceso por rol (RBAC) (P1)

**Goal**: 401/403/404 distinguidos por middleware backend; endpoint `me`. **Independent Test**: usuarios
de cada rol invocan `rbac/probe` y `me`; solo el autorizado accede, el resto recibe el rechazo correcto.

### Tests primero (Red) ⚠️

- [ ] T034 [P] [US3] **[Red]** Contract test `me` 200/401 — `backend/tests/contract/me.contract.spec.ts` (FR-006)
- [ ] T035 [P] [US3] **[Red]** Contract test `rbacProbe` 200/401/403/404 — `backend/tests/contract/rbac-probe.contract.spec.ts` (FR-007/008/009/017)
- [ ] T036 [P] [US3] **[Red]** Unit dominio: matriz rol×alcance + regla 403 (nunca puede) vs 404 (fuera de alcance) — `backend/tests/unit/rbac-policy.spec.ts` (FR-017)
- [ ] T037 [P] [US3] **[Red]** Integration: no-auth→401, rol sin permiso→403, recurso ajeno→404 (a nivel API, forzando la petición) — `backend/tests/integration/rbac.spec.ts` (FR-007/008/009/010, SC-002)

### Implementación

- [ ] T038 [US3] Política RBAC en dominio (matriz centralizada rol×alcance + regla 403/404, base-ready pertenencia para 002) — `backend/src/domain/rbac/policy.ts` (FR-010/017)
- [ ] T039 [US3] Middleware de autenticación: verifica JWT local + `SessionStatePort` (caché revocación/estado, sin round-trip BD) — `backend/src/handlers/middleware/authenticate.ts` (research D3, FR-004c/007)
- [ ] T040 [US3] Adaptador `SessionState` in-memory (set de revocación por `sid` + usuarios inactivos, TTL≤30s, invalidación por evento) — `backend/src/infra/session-state/in-memory.ts` (research D3, FR-004b/c)
- [ ] T041 [US3] Middleware de autorización (aplica política RBAC, emite 403/404) — `backend/src/handlers/middleware/authorize.ts` (FR-008/009/017)
- [ ] T042 [US3] Handler `GET /v1/auth/me` — `backend/src/handlers/auth/me.ts` (FR-006)
- [ ] T043 [US3] Handler `GET /v1/rbac/probe/{id}` (doble de prueba del middleware) — `backend/src/handlers/rbac/probe.ts` (FR-007/008/009)

**Checkpoint**: US1 + US3 funcionales (auth + RBAC completo).

---

## Phase 5: User Story 2 — Mantener la sesión (refresh) y expiración (P2)

**Goal**: renovar access con refresh (rotación single-use); reuso→revoca familia; caducado/revocado→401.
**Independent Test**: sesión válida→refresh OK; revocar/expirar→refresh y acceso fallan; reuso→familia
revocada; reintento en gracia→mismo resultado.

### Tests primero (Red) ⚠️

- [ ] T044 [P] [US2] **[Red]** Contract test `refresh` 200/401/403 (incl. CSRF) — `backend/tests/contract/refresh.contract.spec.ts` (FR-004/005/012)
- [ ] T045 [P] [US2] **[Red]** Unit dominio: rotación single-use + detección de reuso (revoca familia) + ventana de gracia (idempotente) — `backend/tests/unit/refresh-rotation.spec.ts` (FR-004/004b/004d)
- [ ] T046 [P] [US2] **[Red]** Integration: refresh válido rota; revocado/caducado→401; reuso→familia revocada + access invalidado; reintento≤10s→mismo resultado — `backend/tests/integration/refresh.spec.ts` (FR-004/004b/004c/004d/005, SC-003)
- [ ] T047 [P] [US2] **[Red]** Integration: CSRF double-submit (cabecera≠cookie→403) — `backend/tests/integration/csrf.spec.ts` (FR-012, research D2)

### Implementación

- [ ] T048 [US2] Caso de uso dominio `refresh`: rotación single-use, gracia (FR-004d), detección de reuso→revoca familia + `SessionStatePort` (FR-004b), verifica estado activo (FR-004c) — `backend/src/domain/auth/refresh.ts`
- [ ] T049 [US2] Middleware CSRF double-submit (constante-tiempo, cookie==cabecera) para `refresh`/`logout` — `backend/src/handlers/middleware/csrf.ts` (research D2, FR-012)
- [ ] T050 [US2] Handler `POST /v1/auth/refresh` (rota cookie refresh; access en body) — `backend/src/handlers/auth/refresh.ts` (FR-004/005)

**Checkpoint**: las 3 historias funcionales e independientes.

---

## Phase 6: Polish & Cross-Cutting

- [ ] T051 [P] **[Red→verde]** Test de rendimiento SC-005: auth (login/refresh/me/logout) P95<300ms; login P95<1s (SC-001) — `backend/tests/integration/perf.spec.ts` (SC-001/005)
- [ ] T052 [P] **[Red→verde]** Test anti-enumeración: diferencia de timing inexistente-vs-inválido <50ms P95 — `backend/tests/integration/enumeration-timing.spec.ts` (FR-011)
- [ ] T053 [P] Wiring de inyección de dependencias (composición de puertos→adaptadores) + arranque del servidor — `backend/src/infra/container.ts`, `backend/src/main.ts`
- [ ] T054 [P] Test de arquitectura: `domain/` no importa express/prisma/jsonwebtoken (grep/lint) — `backend/tests/unit/architecture.spec.ts` (Const. III)
- [ ] T055 [P] Actualizar `docs/traceability.md` con la matriz RF→tarea→test de 001 — `docs/traceability.md` (Const. VI)
- [ ] T056 Validación `quickstart.md` end-to-end en máquina limpia (`make up && make test`) — (quickstart)
- [ ] T057 [P] Mapear tests a los STRIDE de `threat-model.md` (verificar cobertura de amenazas) — `specs/001-fundacion-auth-rbac/threat-model.md`

---

## Dependencies & Execution Order

- **Setup (P1: T001–T007)** → **Foundational (P2: T008–T020)** bloquea todas las historias.
- **US1 (P3)** y **US3 (P4)** son P1; **US2 (P5)** es P2. US3 depende del middleware auth que consume el
  token emitido en US1 (T027) → recomendado US1 antes que US3. US2 depende de T027 (TokenIssuer) y del
  `SessionStatePort` (T040, creado en US3) → US2 tras US3.
- **Polish (P6)** tras las 3 historias.

### Within each story (TDD)

Tests (Red, commit en rojo) **antes** de implementación. Dominio antes que handlers. Adaptadores
(infra) implementan puertos definidos en Foundational.

### Parallel Opportunities

- Setup: T003–T007 [P]. Foundational: T009–T012, T015–T018, T020 [P].
- Dentro de cada historia, los tests [P] y los adaptadores en ficheros distintos [P] corren en paralelo.

---

## Implementation Strategy

- **MVP** = Setup + Foundational + **US1** (login/logout + lockout): base de identidad demostrable.
- Incremental: +US3 (RBAC completo) → +US2 (refresh/expiración) → Polish (perf, anti-enumeración, arquitectura, trazabilidad).
- **Gate G3** (tras implement + tests en verde): panel acumulativo G1+G2 + `revisor-implementacion`;
  SC validados por tests (no hay componente IA → sin eval promptfoo en 001).

## Notas

- TDD: **commit del test en rojo** antes del de implementación (Const. VII, verificable en el historial).
- Adaptadores in-memory (rate-limit, session-state) son del slice single-instance; sustituibles por
  Redis tras el puerto sin tocar dominio (DevOps futuro).
- No commitear con bloqueantes de gate abiertos; no `any` sin `// JUSTIFICACIÓN:`; no imports de infra en `domain/`.
