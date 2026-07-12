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

## 002a — Order + listado por rol (RF→tarea→test)

| RF | Descripción | Tarea(s) | Test(s) |
|----|-------------|----------|---------|
| FR-001 | Listado 200 filtrado por rol | T014 | `contract/orders.contract`, `integration/orders-list` |
| FR-002/003/004 | Alcance technician/supervisor/dispatcher | T005 | `unit/order-scope`, `integration/orders-list` |
| FR-005 | 401 uniforme | T014/reuse 001 | `integration/orders-authz` |
| FR-006 | Default-deny 403 (allowlist, msg genérico) | T013 | `unit/orders-authorize` |
| FR-007 | Campos públicos + assigned_to UUID | T014 | `contract/orders.contract` |
| FR-008/015 | Filtro backend no ampliable por query | T012/T014 | `integration/orders-list` (params) |
| FR-009 | Lista vacía → 200 | T014 | `integration/orders-list` (technician3) |
| FR-010 | Order + version base-ready | T001 | migración + `data-model` |
| FR-011 | Error contract + correlation-id | T008 | `contract/orders.contract` |
| FR-012 | Orden created_at desc, id desc | T012 | `integration/orders-list` (tiebreak) |
| FR-013 | Sin paginación (conjunto completo) | T014 | `integration/orders-list` (ausencia de comportamiento) |
| FR-014 | bearerAuth + orden 401→403 | T014/T015 | `integration/orders-authz` |
| FR-016 | Política única orderScopeFor | T005 | `unit/list-orders`, `unit/order-architecture` |
| FR-017 | title/description no en logs | T016 | `integration/orders-log-redaction` |
| SC-001/004 | 0 fugas / IDOR mismo-estado | — | `integration/orders-list` |
| Const. III | Hexagonal (domain sin infra) | T011 | `unit/order-architecture` |

**Diferido 002a**: SC-002 perf P95<300ms (T017) → BL-038 (perf, junto con 001).

## 002b — Order FSM + auditoría append-only (RF→tarea→test)

> Dominio puro (write-side): sin endpoint HTTP (contract-first N/A). Verificado contra Postgres real.

| RF | Descripción | Tarea(s) | Test(s) |
|----|-------------|----------|---------|
| FR-001 | FSM como tabla de transiciones legales | T003 | `unit/transition-table` |
| FR-002 | `isLegalTransition` + rechazo de ilegales | T002/T003/T015 | `unit/transition-table`, `unit/apply-transition`, `integration/order-transition-errors` |
| FR-003 | Concurrencia optimista + clasificación determinista (404→409→422→GUARD_UNMET) | T016 | `integration/order-transition-errors`, `-concurrency`, `-guard` |
| FR-004 | Auditoría atómica (misma transacción, rollback todo-o-nada) | T007/T009/T016 | `integration/order-transition`, `-atomicity` |
| FR-005 | `OrderAudit` append-only a nivel de BD (TRIGGER, no REVOKE) | T001/T010 | `integration/order-audit-append-only` |
| FR-006 | Único punto de escritura de `status`/`version` | T014/T016 | `unit/order-transition-architecture` |
| FR-007 | Puerto `applyTransition` + guarda de pertenencia tipada | T005/T012/T016 | `unit/apply-transition`, `integration/order-transition-guard` |
| FR-008 | `reason` pre-saneado, nunca en logs/errores | T013/T017 | `integration/order-audit-redaction` |
| SC-001 | Transición legal: status/version+1/1 auditoría; ilegales sin efecto | T007/T008 | `integration/order-transition`, `-errors` |
| SC-002 | No lost-update: exactamente una gana (correctness) | T011 | `integration/order-transition-concurrency` |
| SC-003 | Inmutabilidad forense (UPDATE/DELETE bloqueado por TRIGGER, rol runtime) | T010 | `integration/order-audit-append-only` |
| SC-004 | Atomicidad: FK actor inválida → rollback + ACTOR_INVALID sin filtrar BD | T009 | `integration/order-transition-atomicity` |
| SC-005 | Guarda de pertenencia (+ TOCTOU determinista) | T012 | `integration/order-transition-guard` |
| SC-006 | No-fuga de `reason` (logs + error serializado) | T013 | `integration/order-audit-redaction` |
| Const. III | Hexagonal (`domain/order` sin infra) | T014 | `unit/order-transition-architecture` |

**FR-009 (contrato de no-enumeración)** y el contrato **`actor_id` = server-side** (nunca de input del
cliente, G1:S-002 re-run) **NO se implementan en 002b** (dominio puro, sin endpoint): se enuncian como
contrato y son **precondición verificada en 003/004/005** (reasignación/ejecución/revisión — carpetas
físicas `004`/`005`/`006`), que consumen `applyTransition` y mapean `GUARD_UNMET`→403 / no-autorizado→404.

**Diferido 002b** (documentado, no silencioso): If-Match→409 al cliente (BL-050); cifrado de `reason` en
reposo (BL-051); accesos denegados como entidad (BL-052); hardening bypass status (BL-053);
cancelación/límite (BL-054); PII correctiva + health-check del trigger (BL-055); defensa en profundidad
del contrato (BL-056).

## Diferido (hardening, documentado — NO silencioso)

- **T057 (perf P95 SC-001/005)** y **T058 (paridad de timing anti-enumeración)**: son gates de
  **rendimiento** (N≥200, server-side, D9). Se dejan como verificación de **CI/manual** (flakey en
  runner local emulado); las invariantes de contenido uniforme ya están cubiertas por
  `contract/error-details.contract`. → backlog perf.
- **T060/T061 (restart/cache per-request end-to-end)**: las invariantes (fallback a BD, fail-closed,
  write-through, re-eval TTL H-006) están cubiertas por `unit/session-state` + `unit/authenticate`;
  la variante de reinicio real con Postgres queda como hardening de integración. → backlog.
- **T065**: el threat-model ya lista Txxx por amenaza; el mapeo 1:1 test↔STRIDE se completa con T057/T058.

---

## 004 · Reasignación de orden (dispatcher) — MVP magro (G1 PASS / G2 PASS / implementado)

Endpoint `reassignOrder` — `POST /v1/orders/{orderId}/reassignments`. Suite completa **215/215 verde**.

| FR | Descripción | Endpoint | Tarea | Test(s) |
|----|-------------|----------|-------|---------|
| FR-001 | reasignar (assigned_to, estado conservado, version+1, 1 auditoría atómica) | reassignOrder | T026-T031 | `integration/reassign-order` (happy + huérfana), `unit/reassign-order` |
| FR-002 | estados reasignables assigned/in_progress; resto → 404 | reassignOrder | T029/T030 | `integration/reassign-order-notfound`… (dentro de reassign-order) |
| FR-003 | RBAC 401 / 403 FORBIDDEN_ROLE | reassignOrder | T030/T031 | `integration/reassign-order` (RBAC) |
| FR-004 | no-enumeración 404 (inexistente/no-visible/uuid malformado, cuerpo idéntico); orden 401→403→404→422 | reassignOrder | T030 | `integration/reassign-order` (no-enum, precedencia), `contract/reassign` |
| FR-005 | destino inválido (4 causas) → 422 INVALID_ASSIGNEE genérico | reassign-order (dominio) | T028 | `integration/reassign-order` (destino 422), `unit/reassign-order` |
| FR-006 | reason 1..500 code points ≥1 imprimible; assignee_id uuid → 422 VALIDATION_ERROR | schemas | T026 | `integration/reassign-order` (body/reason) |
| FR-007 | atómico (SELECT FOR UPDATE + UPDATE condicional + auditoría) + único punto de escritura (arch test) | order-write-side-repository | T029 | `integration/reassign-order-atomicity`, `unit/order-transition-architecture` |
| FR-008 | actor sólo del token | reassignOrder | T030 | `integration/reassign-order` (actor) |
| FR-009 | no-fuga de reason (logs/errores) + errores de BD → 500 genérico | error-mapper, logger | T012/T013 | `integration/reassign-order` (no-fuga), `contract/reassign` |
| Migración | OrderAudit +event_type/+from-to_assignee, from/to_status nullable, CHECK, backfill; trigger conservado | — | T003-T006 | `integration/order-audit-migration` |
| SC-010 | p95 < 300 ms (50 secuenciales, warm-up, nearest-rank) | — | T034 | `integration/reassign-order-latency` |

> Residuales/stretch (no MVP, documentados): BL-001 (If-Match/409), BL-063/064/066 (hardening), BL-067
> (gobernanza XI accesos denegados), BL-002/051/055 (heredados).
