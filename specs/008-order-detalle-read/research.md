# Research — Detalle de orden (read-side) · #010

Decisiones de diseño (Phase 0). No hay `NEEDS CLARIFICATION`: G1 (ronda 7, PASS) fijó las reglas; aquí se
consolidan las decisiones técnicas para `/tasks` e implementación.

## D1 · Mecanismo del motivo = opción B (leer OrderAudit.reason acotado)

- **Decisión**: leer el motivo de `OrderAudit.reason` de la **última transición de rechazo** de la propia orden del
  técnico, habilitado por la **excepción de mínimo privilegio de Constitution XI ≥ v1.9.0**. Sin columna
  denormalizada, sin tocar 004/005/006, sin migración, sin backfill.
- **Rationale**: la opción A (columna denormalizada en `Order`) tocaba 004/005/006 + migración + **backfill con
  fuga de PII** (motivos históricos no saneados) + problema de reasignación. La excepción XI acotada es menos
  invasiva y ya está mergeada a `develop`.
- **Alternativas descartadas**: columna denormalizada (A); feature #011 de saneo aparte (innecesaria: se sanea al
  leer con el redactor de 007).
- **Acotación (mínimo privilegio)**: puerto de lectura dedicado que devuelve **solo** `reason` de la última reject
  de **una** orden asignada al actor. No expone otras transiciones/órdenes/accesos denegados.

## D2 · "Transición de rechazo" y "rechazo sin atender"

- **Decisión**: la transición de rechazo es la fila de `order_audit` con `fromStatus=pending_review` y
  `toStatus=in_progress` (el reject de 006). Es la **única** operación que produce ese par (aprobación =
  `pending_review→closed`; reasignación de 004 opera sobre `assigned`/`in_progress`, nunca desde `pending_review`).
  Su `reason` es **obligatorio y no vacío** (006: 1–1000 tras saneo, `422 INVALID_REASON` si falta) → nunca NULL.
- **"Rechazo sin atender"**: la última reject es **estrictamente posterior** (`at`) al último `submitOrderExecution`
  (reason `execution_registered`). Tras el reenvío (→ `pending_review`) el motivo se omite.
- **Desempate**: `at` y, en empate (submit vs reject), el `id`/uuid v7 monótono mayor (fuente única monótona; el
  mecanismo de generación se fija en implementación para garantizar orden real de inserción).
- **Rationale**: ata motivo y notas/evidencia al **mismo ciclo**, evitando la mezcla de ciclos del bucle de 006.

## D3 · Ciclo vigente (notas + evidencia)

- **Decisión**: el ciclo vigente = el `audit_id` del **último** `submitOrderExecution`; `order_execution_notes` y
  `order_evidence` se filtran por ese `audit_id` (misma regla que 007 H-001; **no** `max(attempt)` por tabla).
- **`evidence`** = `{count, content_types}` con `content_types` **ordenada por `at` asc** de cada `order_evidence`
  (desempate por `id`) e invariante `count == content_types.length`. Sin ciclo aún → `{count:0, content_types:[]}`
  (un submit siempre trae ≥1 evidencia, 005 FR-004). Nunca `object_ref` ni binario.

## D4 · Snapshot consistente (anti estados híbridos)

- **Decisión**: el **guard de propiedad/visibilidad** (`orders.assigned_to`/`status`), la **última reject** y el
  **último submit** (+ sus notas/evidencia) se leen en **un único snapshot** (`$transaction`, READ COMMITTED por
  defecto con lecturas dentro de la misma tx, o una consulta con subconsultas). 
- **Rationale**: un `submit` o una `reasignación` concurrentes no deben producir motivo del ciclo N-1 junto a notas
  del ciclo N, ni permitir al **ex-dueño** leer el motivo tras una reasignación concurrente (guard + lectura del
  motivo en el mismo snapshot).
- **Verificación**: test de concurrencia (GET vs submit/reasignación en vuelo) — ver quickstart y trazabilidad.

## D5 · Saneo al leer (pii-redactor) + fail-closed

- **Decisión**: el motivo pasa por `domain/ai/pii-redactor` (007: email/teléfono/DNI-NIF/NIE/matrícula/IBAN/tarjeta)
  **antes** de servirse. Si el redactor **falla/no está disponible**, se **omite** `last_rejection_reason` (nunca el
  `reason` crudo) — **fail-closed**.
- **Distinción de "saneo"**: NO confundir con `sanitizeReason` de 006 (normalización de formato/longitud en
  escritura, que **no** redacta PII). El redactor PII en lectura es **obligatorio y no redundante**.
- **`notes`**: NO pasan por el redactor — payload IX (005) servido solo a technician dueño/supervisor; residual IX
  documentado (cierre = 005 D4 cifrado/purga + backlog multi-tenant). No es fuga cruzada de roles.

## D6 · RBAC, no-enumeración y precedencia de errores

- **Decisión**: alcance por rol reutilizando la política de 002a (`orderScopeFor`): technician = sus
  `assigned`/`in_progress`/`pending_review`; supervisor = `pending_review`; dispatcher = `assigned`/`in_progress`.
  `draft`/`closed` fuera de alcance → 404. Rol no reconocido → alcance vacío → **404** (fail-secure, default-deny).
- **404 uniforme, sin 403**: un 403 sobre un `orderId` concreto revelaría existencia. Difiere deliberadamente de
  `listOrders` (que usa 403 para rol fuera de allowlist, sin revelar recursos concretos).
- **`orderId` malformado → 404** (no 400): `orderId` se tipa como string (no `format: uuid`) para que la validación
  de esquema no emita un 400 distinguible (oráculo de enumeración).
- **Precedencia**: `401` (no autenticado) precede a toda resolución de visibilidad/existencia.

## D7 · Auditoría de accesos denegados (FR-009, Constitution XI)

- **Decisión**: cada `401`/`404` de `getOrderDetail` escribe un registro **append-only** (actor si lo hay,
  endpoint, `recurso`) con `recurso` **saneado**: si el `orderId` matchea patrón UUID se guarda; si no, marcador
  fijo `"<malformed>"`/hash — **nunca** el path crudo (anti-inyección de PII en un log no purgable).
- **Modo de fallo**: **best-effort no bloqueante** — el 401/404 se devuelve igual aunque falle la escritura de
  auditoría; el fallo se loguea (con `recurso` saneado). No degrada a 500/503 por un fallo de auditoría no crítico.
- **Read-only vs XI**: FR-007 aclara que "read-only" = sin mutación de **dominio**; el registro de accesos
  denegados es infraestructura transversal de auditoría exigida por XI, no una mutación del recurso.

## D8 · Testing y verificación (sin IA → sin promptfoo)

- **Decisión**: SC verificables con **tests deterministas** (Vitest unit dominio + Supertest integración/contract).
  No hay proveedor IA en #010 (el pii-redactor es dominio puro), así que **no se usa promptfoo**.
- **Cobertura clave**: por rol (technician/supervisor/dispatcher), ramas de 404, "rechazo sin atender" (incl.
  multi-ciclo y ya-reenviada), snapshot concurrente, fail-closed del redactor, auditoría de 401/404, contrato
  ×5 códigos, `object_ref`/PII nunca en cuerpo/logs.
