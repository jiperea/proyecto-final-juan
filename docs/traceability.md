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
físicas `004`/`005`/`006`). Nota: la ejecución (rama física `005-registro-ejecucion`) **no** reutiliza
`applyTransition`/`classifyZeroRows` de 002b para clasificar; usa su **módulo write-side propio**
(`classify-execution-guard.ts`) con precedencia payload→pertenencia(404)→estado(422), y mapea `GUARD_UNMET`→**404**
(no-enumeración, no 403). La reasignación (004) resuelve la visibilidad→404 antes de escribir.

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

---

## 005 · Registro de ejecución por el técnico — MVP magro (G1 PASS / G2 remediado / implementado)

Endpoints `startOrderWork` — `POST /v1/orders/{orderId}/start` y `submitOrderExecution` —
`POST /v1/orders/{orderId}/execution` (rol `technician`). Módulo write-side **propio de 005** (no reutiliza
`applyTransition`/`classifyZeroRows` de 002b para clasificar). Precedencia única **payload primero**
`401→403→422(payload)→404(pertenencia)→422(estado)`.

| FR / SC | Descripción | Endpoint | Tarea | Test(s) |
|----|-------------|----------|-------|---------|
| FR-001 | iniciar trabajo (assigned→in_progress, version+1, 1 auditoría reason NULL) | startOrderWork | T013-T014 | `integration/start-order-work`, `contract/start-order-work.contract` |
| FR-002 | registrar ejecución (in_progress→pending_review) en 1 tx: transición→auditoría (reason opaco)→evidencia[]→notas | submitOrderExecution | T019/T022 | `integration/submit-execution`, `contract/…` (via app) |
| FR-003 | precedencia única 401→403→422(payload)→404(pertenencia)→422(estado); pertenencia antes que estado; orderId malformado→404; payload primero | ambos | T010b/T013/T022 | `unit/classify-execution-guard`, `integration/start-order-work`, `integration/submit-execution` |
| FR-004 | evidencia por referencia bloqueante (≥1..10, allowlist, size, object_ref formato, sin duplicados) → EVIDENCE_REQUIRED/INVALID_EVIDENCE | evidence.ts / submit-execution | T010/T016/T017 | `unit/evidence`, `unit/submit-execution`, `integration/submit-execution` |
| FR-005 | notas 1..2000 code points (VALIDATION_ERROR); notes/object_ref nunca en logs/errores | submit-execution / logger | T009/T017/T024 | `unit/submit-execution`, `integration/execution-pii-redaction` |
| FR-006 | atomicidad todo-o-nada (transición+auditoría+evidencia+notas); append-only evidencia; único punto de escritura | order-write-side-repository | T019/T021/T023 | `integration/submit-execution-atomicity`, `unit/write-side-boundary` |
| FR-007 | actor server-side (uploaded_by/created_by/actor_id del token; `.strict()` rechaza body) | ambos | T016/T020 | `integration/submit-execution` (.strict + actor del token) |
| FR-008 | errores de BD → 500 genérico sin detalle de Postgres | error-mapper / handlers | T007/T025 | `integration/execution-db-error`, `contract/start-order-work.contract` (500) |
| Migración | +order_evidence (append-only trigger) +order_execution_notes (purgable), FKs RESTRICT, sin ALTER a orders/order_audit | — | T003-T006 | `integration/order-evidence-migration` |
| SC-001 | inicio válido → 200 in_progress + version+1 + 1 auditoría | startOrderWork | T012 | `integration/start-order-work` |
| SC-002 | registro válido → 200 pending_review + version+1 + 1 auditoría (reason opaco) + 1 notas + ≥1 evidencia | submitOrderExecution | T020 | `integration/submit-execution` (happy path) |
| SC-003 | precedencia RBAC+payload+pertenencia+estado | ambos | T012/T020 | `integration/start-order-work`, `integration/submit-execution` |
| SC-004 | evidencia bloqueante (0/>10/formato) → 422 | submitOrderExecution | T010/T020 | `unit/evidence`, `integration/submit-execution` |
| SC-005 | notas ausentes/vacías/>2000 → 422 VALIDATION_ERROR | submitOrderExecution | T017/T020 | `unit/submit-execution`, `integration/submit-execution` |
| SC-006 | atomicidad (fallo evidencia/auditoría/notas → sin efecto) | order-write-side-repository | T021 | `integration/submit-execution-atomicity` |
| SC-007 | no-fuga de notes/object_ref (logs y cuerpo de error); reason="execution_registered" | logger / handlers | T024 | `integration/execution-pii-redaction` |
| SC-008 | error de BD → 500 genérico sin SQLSTATE/constraint/columna/query | handlers | T025 | `integration/execution-db-error` |
| SC-009 | p95 < 300 ms (50 secuenciales, warm-up, nearest-rank); correlation-ID | — | T026 | `integration/execution-latency` (RUN_PERF) |

> Arquitectura: `unit/write-side-boundary` (status/version sólo en el repo write-side) y
> `unit/execution-guard-single-source` (start/execution usan el clasificador propio de 005, no
> `classifyZeroRows` de 002b — precedencia pertenencia-antes-que-estado).
>
> Deuda trazada (no MVP, documentada): **BL-069** (cifrado en reposo + purga/retención de
> `OrderExecutionNotes.notes`, IX; distinto de BL-051/055); **BL-068** (subida binaria + at-rest de
> `object_ref`, #007); **BL-001** (If-Match/409, #008); **BL-002/067** (auditoría de accesos denegados, #009).

## 006 — Revisión por el supervisor (`reviewOrder`)

| RF | Descripción | Endpoint | Tarea(s) | Test(s) |
|----|-------------|----------|----------|---------|
| FR-001 | approve → pending_review→closed (200, version+1, 1 auditoría) | reviewOrder (approve) | T009-T012 | `integration/review-order-approve` |
| FR-002 | reject → pending_review→in_progress con motivo (200, version+1, auditoría) | reviewOrder (reject) | T015-T017 | `integration/review-order-reject` |
| FR-003 | motivo obligatorio en reject; 1..1000 tras saneo | dominio | T006/T015/T017 | `unit/sanitize-reason`, `integration/review-order-reject` |
| FR-004 | atomicidad transición+auditoría (todo o nada) | order-write-side-repository | T011/T018 | `integration/review-order-atomicity` |
| FR-005 | conservación de evidencia/notas de 005 | order-write-side-repository | T019 | `integration/review-order-preservation` |
| FR-006 | RBAC sólo-supervisor → 403 (401 sin auth) | requireRole + handler | T012/T013 | `integration/review-order-approve` (403), `contract/review-order.contract` |
| FR-007 | no-enumeración: no visible/malformado → 404 genérico (state-scoped) | classify-review-guard | T007/T012 | `unit/classify-review-guard`, `integration/review-order-approve` |
| FR-008 | motivo pre-saneado en OrderAudit.reason; nunca en logs/errores | sanitize-reason / logger | T005/T006/T021 | `integration/review-pii-redaction` |
| FR-009 | precedencia 401→403→422(VALIDATION_ERROR)→422(INVALID_REASON)→404→409 | handler + repo | T013/T017 | `integration/review-order-reject` (precedencia + caso cruzado uuid) |
| FR-010 | BD no disponible → 503; error no transitorio → 500 genérico | repo + handler | T021/T022 | `integration/review-db-errors`, `contract/review-order.contract` (500/503) |
| FR-011 | decision ausente/fuera de enum/body no-JSON → 422 VALIDATION_ERROR (antes que INVALID_REASON) | Zod + handler | T008/T017 | `integration/review-order-reject` (FR-011) |
| FR-012 | actor de la auditoría del token server-side (`.strict()` rechaza body) | handler | T012 | `integration/review-order-approve` (actor_id en body → 422) |
| FR-013 | guard de evidencia en approve (≥1 dentro del UPDATE) → 409 EVIDENCE_MISSING, tras 404 | classify-review-guard + repo | T007/T011/T012 | `unit/classify-review-guard`, `integration/review-order-approve` |
| SC-001 | approve → closed, 1 auditoría, version+1 | reviewOrder | T012 | `integration/review-order-approve` |
| SC-002 | reject con/sin motivo (200 / 422 sin efecto) | reviewOrder | T017 | `integration/review-order-reject` |
| SC-003 | RBAC (403/401) + no visible (404) sin fuga de estado | reviewOrder | T012 | `integration/review-order-approve` |
| SC-004 | evidencia/notas conservadas (0 pérdidas) | reviewOrder | T019 | `integration/review-order-preservation` |
| SC-005 | 0 fugas del motivo (logs/errores) + atomicidad | logger / repo | T018/T021 | `integration/review-pii-redaction`, `integration/review-order-atomicity` |
| SC-006 | p95 < 300 ms por camino (approve/reject) | — | T023 | `integration/review-latency` (RUN_PERF) |

> Arquitectura: `unit/write-side-boundary` extendido (review no muta status/version fuera del repo write-side;
> approve usa `UPDATE … EXISTS(evidencia)`; review-order no reutiliza applyTransition/classifyZeroRows).
> Ciclo cruzado 006↔005 (US2 AC3): `integration/review-reject-resubmit-cycle`.
> Deuda trazada: **BL-070** (#010 read-side + enmienda XI), **BL-071** (reconciliar 003 FR-006), **BL-051**
> (cifrado at-rest de `reason`), **#008** (If-Match/409), **#009** (accesos denegados).

## 007 — Resumen de incidencia por IA (`summarizeOrderIncident`) — G1 PASS / G2 PASS / implementado

| RF | Qué garantiza | Dónde | Test(s) |
| ---- | ------------- | ----- | ------- |
| FR-001 | resumen fiel (200 sufficient=true) sobre contenido suficiente | summarize-order-incident + handler | `integration/ai-summary-ok`, `unit/summarize-incident` |
| FR-002 | fallback no-inventa (umbral FR-015 sin proveedor **o** provider sufficient=false) | summarize-order-incident | `unit/summarize-incident`, `integration/ai-summary-fallback` |
| FR-003 | minimización PII por capas ANTES del proveedor (allowlist + redacción) | pii-redactor + use case | `unit/pii-redactor`, `unit/summarize-incident`, `integration/ai-summary-pii` |
| FR-004(a) | detector estructural en salida → blocked_pii → fallback | pii-redactor + use case | `unit/summarize-incident`, `integration/ai-summary-fallback` |
| FR-004(b) | nombres/direcciones (best-effort): golden cases de no-fuga | eval promptfoo | `evals/` (gate G3) |
| FR-005 | no persistir/loguear prompt/resumen (incl. stderr) | logger REDACT + provider | `unit/claude-cli-provider` (stderr), `integration/ai-summary-pii` |
| FR-006 | RBAC supervisor → 403 (dentro del handler, K5) | handler | `integration/ai-summary-authz`, `contract/ai-summary` |
| FR-007 | no-enumeración → 404 genérico (no visible/malformado) | handler + repo | `integration/ai-summary-authz`, `contract/ai-summary` |
| FR-008 | rate-limit 10/60s por usuario → 429 + Retry-After | handler + InMemoryRateLimit | `integration/ai-summary-ratelimit` |
| FR-009 | proveedor por CLI en dev, mock en tests | container + mock-provider | (todos los tests usan mock) |
| FR-009b | temperature=0 (determinismo) | config + claude-cli-provider | `unit/claude-cli-provider` (buildPrompt), config default |
| FR-009c | invocación segura del proceso (execFile/argv/stdin, sin shell) — Constitution IX | claude-cli-provider | `unit/claude-cli-provider` (no-fuga; nonce) |
| FR-010 | timeout/fallo → 503; no conforme (incl. JSON malformado) → 200 fallback | use case + provider + handler | `integration/ai-summary-provider-failure`, `integration/ai-summary-fallback`, `unit/*` |
| FR-011 | contrato de salida `{summary,sufficient}` | DTO + handler | `contract/ai-summary`, `integration/ai-summary-ok` |
| FR-012 | precedencia 401→403→429→404→proveedor | handler | `integration/ai-summary-authz`, `integration/ai-summary-access-event` |
| FR-013 | evento de acceso sin PII en cada salida (incl. denied + deniedReason) | handler + access-logger | `integration/ai-summary-access-event` |
| FR-014 | cota `summary` ≤ 1200 → fallback | use case | `unit/summarize-incident` |
| FR-015 | umbral mínimo (≥30 chars no-ws Y ≥1 evidencia) determinista — Constitution VIII | use case + repo | `unit/summarize-incident`, `integration/ai-summary-fallback` |
| FR-016 | notas como datos no confiables (nonce-delimitado, anti prompt-injection) | claude-cli-provider (buildPrompt) | `unit/claude-cli-provider`, `integration/ai-summary-pii` |

> Fidelidad/no-fuga/fallback semánticos (SC-001..003) se anclan a **promptfoo** (gate G3, provider `claude -p`,
> sesión dev autenticada). Deuda trazada: **BL-072..078** (proveedor prod+re-eval, PII texto libre, segmentación
> por ámbito, juez runtime, robustez anti-injection, juez de familia distinta, rate-limit multi-réplica) — ver
> `spec.md §Modelo de amenaza` y `gates/dispositioned.md`.
