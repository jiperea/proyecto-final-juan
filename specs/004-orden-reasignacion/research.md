# Research — 004-orden-reasignacion

Decisiones de diseño (Phase 0). Cada una resuelve un punto que la spec dejó "a confirmar en plan" o que el
mapa del código dejó abierto. Sin `NEEDS CLARIFICATION` pendientes.

## D-01 · Método/ruta del endpoint

- **Decisión**: `POST /v1/orders/{orderId}/reassignments`, `operationId: reassignOrder`, rol `dispatcher`.
- **Rationale**: la reasignación es un **evento** que genera un registro de auditoría inmutable (semántica
  append-only), no una mutación idempotente de un campo. Un sub-recurso de evento (`POST .../reassignments`)
  modela mejor "crear una reasignación" que `PATCH .../assignee`, y encaja con `OrderAudit.event_type`. El
  `operationId` `reassignOrder` ya está usado en toda la trazabilidad de la spec y sobrevive a esta elección.
- **Alternativas**: `PATCH /orders/{id}/assignee` (idempotente, pero oscurece el evento de auditoría y sugiere
  reemplazo directo del campo); `POST /orders/{id}:reassign` (RPC-ish, rompe estilo REST del contrato).

## D-02 · Módulo write-side (reconciliación FR-006 de 002b, BL-065)

- **Decisión**: crear `domain/order/write-side/` y **reubicar** `apply-transition.ts` (002b) dentro, junto al
  nuevo `reassign-order.ts` y un puerto compartido `write-side-ports.ts`. El "único punto de escritura de
  `status`/`version`" pasa a ser este módulo (dominio) + su repo de infra.
- **Rationale**: la spec (FR-007) exige que `reassignOrder` viva en el **mismo módulo** que `applyTransition` y
  que un **test de arquitectura** verifique que nada fuera de él muta `status`/`version`. Reubicar es preferible
  a duplicar el invariante en dos sitios. `applyTransition` **no cambia de comportamiento** (sólo de ruta de
  import) → no viola XV (inmutabilidad de artefactos mergeados: 002b se preserva funcionalmente).
- **Alternativas**: (a) dejar `apply-transition.ts` donde está y declarar "módulo lógico" sin carpeta común →
  el arch test se vuelve frágil (lista de ficheros dispersa); (b) un único fichero gigante → peor cohesión.
- **Riesgo**: churn de imports en 002b. Mitigación: sólo se mueve el fichero; los tests de 002b siguen verdes
  (verificación en G3). Test de arquitectura nuevo cierra BL-065.

## D-03 · Primitiva atómica compartida (H-008)

- **Decisión**: en infra, generalizar `order-transition-repository.ts` → `order-write-side-repository.ts` con
  un método privado `conditionalWriteWithAudit(tx, { where, data, audit })` que ejecuta el **UPDATE condicional
  `updateMany`** (WHERE `id ∧ version=expectedVersion ∧ status ∈ predicado`) + el **insert de auditoría** en la
  **misma** `$transaction`. `applyTransition` y `reassignOrder` lo consumen con distinto `data`/`audit`.
- **Rationale**: evita divergencia entre las dos rutas de escritura (H-008); reutiliza el patrón ya probado de
  002b (`updateMany` + `writeAudit` + `classifyZeroRows`). La reasignación pasa `data: { assignedTo: destino,
  version: { increment: 1 } }` (NO toca `status`) y `audit: { event_type:'reassignment', from_assignee,
  to_assignee, from_status==to_status }`.
- **Alternativas**: repo separado para reasignación → duplica la lógica atómica y el mapeo P2003→FK.

## D-04 · Clasificación de 0-filas con precedencia status > version (S-001/H-006)

- **Decisión**: tras un `updateMany` que afecta 0 filas, releer la orden y clasificar **en este orden de
  evaluación**: (1) no existe → `ORDER_NOT_FOUND` (404); (2) `status ∉ {assigned,in_progress}` →
  `ORDER_NOT_REASSIGNABLE` que **colapsa a 404** (fuera de ámbito) — **evaluado antes que version**; (3) sólo si
  sigue reasignable pero `version ≠ expectedVersion` → `VERSION_CONFLICT` (409).
- **Rationale**: cierra el oráculo 409-vs-404 bajo carrera cruzada reasignación↔transición-FSM (una transición
  concurrente saca la orden de ámbito **y** bumpea version; si se evaluara version primero se filtraría 409).
  Diverge conscientemente del `classifyZeroRows` de 002b (que devuelve `VERSION_CONFLICT` antes de estado): la
  reasignación necesita `ORDER_NOT_REASSIGNABLE→404` con precedencia, porque su predicado de visibilidad **es**
  el estado (a diferencia de las transiciones internas de 002b, que no exponen endpoint).
- **Alternativas**: reutilizar `classifyZeroRows` de 002b tal cual → reintroduce S-001.

## D-05 · Extensión de OrderAudit + migración (H-007)

- **Decisión**: añadir a `order_audit`: `from_assignee`/`to_assignee` (`@db.Uuid` nullable, FK→User
  `onDelete:Restrict` como los demás actores) y `event_type` (enum Prisma `OrderAuditEventType`:
  `transition`|`reassignment`) con **`DEFAULT 'transition'`**. Migración manual SQL: `ALTER TABLE ADD COLUMN`
  + `CREATE TYPE` + **backfill** implícito de filas legacy a `'transition'` (via DEFAULT) con
  `from_assignee`/`to_assignee` NULL. El trigger append-only se **conserva** (no se recrea).
- **Rationale**: append de columnas nullable + DEFAULT es una migración segura y compatible con el trigger
  (que sólo bloquea UPDATE/DELETE, no ALTER). `applyTransition` sigue escribiendo `event_type='transition'`
  (por el default) con par de asignatarios NULL; sólo `reassignOrder` escribe `'reassignment'` con el par.
- **Alternativas**: tabla separada `order_reassignment_audit` → rompe la consulta unificada de auditoría y
  duplica el trigger; columna `event_type` sin DEFAULT → backfill manual obligatorio y filas legacy en NULL.
- **Verificación**: test que, tras migrar, las filas de auditoría de 002b tienen `event_type='transition'` y
  par NULL (trazabilidad "Migración (OrderAudit)").

## D-06 · Origen de expectedVersion en flujo base (H-202)

- **Decisión**: en US1 (sin `If-Match`), el servidor **relee** la `version` vigente en la **consulta de
  visibilidad** de FR-004 y la usa como `expectedVersion` del UPDATE condicional. En US2 (stretch, `If-Match`),
  `expectedVersion` = la versión enviada por el cliente.
- **Rationale**: protege la ventana lectura→escritura interna (no lost-update entre dos reasignaciones
  concurrentes de la misma request-set, escenario 8) sin exigir al cliente enviar versión en el flujo base. El
  `WHERE` condicional es siempre el árbitro final.
- **Alternativas**: exigir versión en el body base → fricción de cliente innecesaria (If-Match es el mecanismo
  estándar y ya es stretch).

## D-07 · Validez del técnico destino y no-oráculo (S-003/S-006, FR-005)

- **Decisión**: tras pasar la visibilidad (FR-004), validar destino con **una** consulta a `User`
  (`existe ∧ role='technician' ∧ disabledAt IS NULL`) y comparar contra el `assigned_to` leído en visibilidad
  ("mismo técnico"). Cualquier fallo → **422 `INVALID_ASSIGNEE`** con cuerpo **genérico idéntico** para las 4
  causas (sin `details` distintivo). `reason` inválido → **422 `VALIDATION_ERROR`**.
- **Rationale**: cuerpo idéntico cierra el oráculo de enumeración por contenido (S-003). Paridad de **latencia**
  entre las 4 causas = residual documentado **BL-064** (no se fuerza en esta feature).
- **Alternativas**: `details` con la causa concreta → oráculo de enumeración de usuarios/roles.

## D-08 · Contrato de errores con agent_action (gap del error-mapper)

- **Decisión**: extender `DomainError` (`domain/result.ts`) con un `agentAction?` opcional y hacer que
  `sendError` (`handlers/error-mapper.ts`) lo emita como `agent_action` en el cuerpo. Se rellena por código de
  error con textos accionables (p. ej. 409 → "re-lee la orden y reintenta con la versión vigente").
- **Rationale**: el contrato OpenAPI y la constitución exigen `{code,message,details?,agent_action}`, pero el
  `sendError` actual **nunca** escribe `agent_action`. 004 es el primer endpoint que lo necesita en respuestas
  de negocio. Cambio aditivo y retrocompatible (opcional).
- **Alternativas**: dejar `agent_action` fuera → incumple contrato/constitución.

## D-09 · No-fuga de `reason` por la ruta HTTP real (FR-009, BL-059)

- **Decisión**: verificar que `reason` no aparece en logs de request/response/error ni en el body de error.
  `REDACT_PATHS` (`infra/logger.ts`) ya incluye `reason` y `*.reason`; añadir explícitamente las rutas anidadas
  del payload real del endpoint (p. ej. `req.body.reason`) y `err.reason`/`error.cause` si el logger de errores
  las alcanza. Test: `reason` centinela único + grep negativo sobre logs capturados y sobre el body de error,
  incluido un caso que fuerza error tras aceptar el payload (SC-006).
- **Rationale**: el `pino redact` con comodín cubre un nivel; el `reason` anidado en el body de request necesita
  ruta explícita (BL-059).

## D-10 · Catch-all de errores de BD → 500 genérico (FR-010, BL-060)

- **Decisión**: un manejador de nivel superior (extensión de `jsonErrorHandler`/`error-mapper`) convierte
  cualquier error no mapeado (incluido error de BD ≠ FK-asignatario: deadlock, timeout, UUID inválido) en
  **500** con cuerpo genérico `{code,message,agent_action}`, sin filtrar SQLSTATE/constraint/columna/query. La
  FK del asignatario (Postgres `P2003`) sí se mapea a `INVALID_ASSIGNEE`/`ACTOR_INVALID` según origen.
- **Rationale**: evita fuga de detalle de Postgres (BL-060); test que fuerza un error ≠ FK y hace grep negativo
  (SC-007).
