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
- **Desempate**: `at` y, en empate (submit vs reject), el `id`/uuid v7 monótono mayor. El `id` se genera
  **server-side en la escritura** (004/005/006 ya lo hacen), de modo que es **monótono con el orden de commit** —
  no en el cliente/aplicación fuera de la tx (evita inversión de orden que decidiría mal mostrar/omitir el motivo).
- **Rationale**: ata motivo y notas/evidencia al **mismo ciclo**, evitando la mezcla de ciclos del bucle de 006.

## D3 · Ciclo vigente (notas + evidencia)

- **Decisión**: el ciclo vigente = el `audit_id` del **último** `submitOrderExecution`; `order_execution_notes` y
  `order_evidence` se filtran por ese `audit_id` (misma regla que 007 H-001; **no** `max(attempt)` por tabla).
- **`evidence`** = `{count, content_types}` con `content_types` **ordenada por `at` asc** de cada `order_evidence`
  (desempate por `id`) e invariante `count == content_types.length`. Sin ciclo aún → `{count:0, content_types:[]}`
  (un submit siempre trae ≥1 evidencia, 005 FR-004). Nunca `object_ref` ni binario.

## D4 · Snapshot atómico (anti estados híbridos)

- **Decisión**: el **guard de propiedad/visibilidad** (`orders.assigned_to`/`status`), la **última reject** y el
  **último submit** (+ sus notas/evidencia) se leen como **una sola consulta atómica** (CTE/subconsultas en un
  `SELECT`) **o**, si son varias lecturas, dentro de una `$transaction` en **`REPEATABLE READ`/`SERIALIZABLE`**.
- **Prohibido**: múltiples `SELECT` en **READ COMMITTED** — el aislamiento por sentencia da a cada lectura su propio
  snapshot, así que una `reasignación`/`submit` que comitee entre lecturas produce estado híbrido (motivo del ciclo
  N-1 con notas del N) o deja al **ex-dueño** pasar el guard y leer el motivo. El READ COMMITTED por defecto **no**
  satisface FR-003/FR-005.
- **Rationale**: FR-003 exige que motivo y notas pertenezcan al mismo ciclo y que el guard de propiedad y la lectura
  del motivo compartan instante lógico (anti fuga a ex-dueño).
- **Verificación**: test de concurrencia **determinista** (advisory locks / dos clientes Prisma con pausa en tx para
  forzar el interleaving; **no** timing real, que no es reproducible en CI) — ver quickstart T029 y trazabilidad.

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

## D7 · Observabilidad de accesos denegados (FR-009) — el registro durable es #009

- **Decisión**: cada `401`/`404` de `getOrderDetail` **emite una entrada de log best-effort** (actor si lo hay,
  endpoint, `recurso`, `outcome`∈{401_unauth,404_not_visible}) por el **logger `pino` compartido** mediante un
  **puerto propio** `DeniedAccessLoggerPort` (+ adaptador fino). **No** reutiliza el `AccessLogPort`/`AccessEvent`
  de 007 (tipado para el resumen IA: `actor`/`orderId` obligatorios, enum cerrado **sin caso 401**; 007 inamovible).
  A diferencia del handler de `ai-summary` (que omite el evento sin actor), #010 **sí emite en 401**. Con `recurso`
  **saneado**: si el
  `orderId` matchea patrón UUID se emite; si no, marcador fijo `"<malformed>"` — **nunca** el path crudo.
- **Por qué NO append-only durable en #010**: `order_audit.order_id` es **FK NOT NULL a `orders`** → no puede
  sostener un registro de un `401` (sin orden) ni de un `404` por orden inexistente/malformada. Construir una tabla
  nueva sería una **migración** (contradice read-side puro) y **duplicaría** la feature de roadmap **#009**
  (`auditoria-accesos-denegados`, BL-002/067), que es la responsable del registro **forense durable transversal**
  (401/403/404 de **todos** los endpoints) y está **fuera del MVP funcional**. #010 sigue el **residual honesto ya
  aceptado por 007 (M5)**: señal de observabilidad ahora, durabilidad en #009.
- **Modo de fallo**: **best-effort no bloqueante** — el 401/404 se devuelve igual aunque falle la emisión del log.
- **Reconciliación de roadmap**: #009 no queda duplicada; su alcance sigue siendo el registro durable + extenderlo
  al resto de endpoints. (La actualización de `docs/06-roadmap.md` que aclare "#010 emite señal, #009 la hace
  durable" es una nota de **fundación**, fuera de esta rama — junto con el alta de BL-080.)
- **Alternativas descartadas**: (a) tabla nueva de accesos denegados en #010 (migración + duplica #009); (b)
  reutilizar `order_audit` (imposible por la FK NOT NULL).

## D8 · Testing y verificación (sin IA → sin promptfoo)

- **Decisión**: SC verificables con **tests deterministas** (Vitest unit dominio + Supertest integración/contract).
  No hay proveedor IA en #010 (el pii-redactor es dominio puro), así que **no se usa promptfoo**.
- **Cobertura clave**: por rol (technician/supervisor/dispatcher), ramas de 404, "rechazo sin atender" (incl.
  multi-ciclo y ya-reenviada), snapshot concurrente, fail-closed del redactor, auditoría de 401/404, contrato
  ×5 códigos, `object_ref`/PII nunca en cuerpo/logs.
