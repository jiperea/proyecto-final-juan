# Trazabilidad RF → tarea → test — 001 Fundación Auth/Sesión/RBAC

> Constitution VI. Cada requisito funcional se ancla a su(s) tarea(s) y a los tests que lo verifican
> (todos ejecutados en verde contra Postgres real; ver `backend/tests/`). 96 tests, 28 archivos.

| RF | Descripción | Tarea(s) | Test(s) |
|----|-------------|----------|---------|
| FR-001 | Login por identifier+contraseña | T037/T039 | `unit/login`, `unit/token-issuer`, `contract/login.contract`, `integration/login-logout` |
| FR-001b | Espacio de unicidad global email/username | T013 | esquema `identifiers.norm` único; `unit/login` (resuelve por email y username) |
| FR-002 | 401 uniforme credenciales inválidas | T037 | `unit/login`, `contract/error-details.contract` |
| FR-002b | disabled tras el hash, cuenta para lockout | T037 | `unit/login` (disabled→401), `integration/login-logout` |
| FR-003 | Logout revoca sólo la sesión actual | T038/T040 | `unit/logout`, `contract/logout.contract` |
| FR-004 | Refresh rotación single-use atómica + relee rol | T054/T056 | `unit/refresh-rotation`, `integration/refresh`, **`integration/rotate-atomic` (B2/B6)** |
| FR-004b | Reuso → revoca familia + invalidación inmediata | T054 | `unit/refresh-rotation` (reuso), `unit/logout` (D12), **`integration/immediate-invalidation` (B5)** |
| FR-004c | disabled corta refresh/validación; locked no | T026/T054 | `unit/authenticate`, `unit/session-state`, `unit/refresh-rotation` (disabled) |
| FR-004d | Ventana de gracia (mismo par) | T053/T054 | `unit/refresh-rotation` (gracia), `unit/grace-cache`, `integration/refresh` |
| FR-005 | 401 uniforme en refresh (entre 4 causas) | T054 | `integration/refresh`, `contract/error-details.contract`, **`unit/refresh-rotation` (uniformidad B4)** |
| FR-006 | Endpoint `me` | T041 | `unit/me`, `contract/me.contract` |
| FR-007/008/009 | RBAC 401/403/404 | T045/T046 | `unit/rbac-policy`, `integration/rbac`, `contract/rbac-probe.contract` |
| FR-010 | Autorización en backend (forzando API) | T046 | `integration/rbac` |
| FR-011 | Lockout 5/15min + anti-timing | T035/T033 | `unit/lockout`, `unit/lockout-reset`, `unit/password-hasher`, `contract/login.contract` (429) |
| FR-012 | Cabeceras seguridad + CSRF | T021/T055 | `integration/security-headers`, `integration/csrf-order` |
| FR-013 | Errores accionables + 422 JSON mal formado | T022 | `unit/error-mapper` |
| FR-014 | Sin PII/tokens en logs | T020 | `integration/correlation-id` |
| FR-015 | /health y /ready | T023 | `contract/ops.contract` |
| FR-016 | Config fail-fast + 3 secretos distintos | T019 | `unit/config` |
| FR-017/017b | Orden rol(403)→pertenencia(404), 404-alcance | T045 | `unit/rbac-policy`, `integration/rbac` |
| FR-018 | Orden sesión(401)→CSRF(403), incl. cookie revocada/caducada | T055/B1 | `integration/csrf-order` (incl. sesión revocada + CSRF ausente → 401, B1) |
| SC-002 | RBAC determinista por rol | — | `integration/rbac` |
| SC-003 | Sesión robusta y renovable | — | `integration/refresh` |
| Const. III | Hexagonal (dominio sin infra) | T059 | `unit/architecture` |

## Diferido (hardening, documentado — NO silencioso)

- **T057 (perf P95 SC-001/005)** y **T058 (paridad de timing anti-enumeración)**: son gates de
  **rendimiento** (N≥200, server-side, D9). Se dejan como verificación de **CI/manual** (flakey en
  runner local emulado); las invariantes de contenido uniforme ya están cubiertas por
  `contract/error-details.contract`. → backlog perf.
- **T060/T061 (restart/cache per-request end-to-end)**: las invariantes (fallback a BD, fail-closed,
  write-through, re-eval TTL H-006) están cubiertas por `unit/session-state` + `unit/authenticate`;
  la variante de reinicio real con Postgres queda como hardening de integración. → backlog.
- **T065**: el threat-model ya lista Txxx por amenaza; el mapeo 1:1 test↔STRIDE se completa con T057/T058.
