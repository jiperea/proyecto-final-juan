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

## D-03 · Primitiva atómica compartida (H-008) — alcance ACOTADO (cierre G2-B2)

- **Decisión**: en infra, generalizar `order-transition-repository.ts` → `order-write-side-repository.ts` con
  un método privado `conditionalWriteWithAudit(tx, { where, data, audit })` que ejecuta el **UPDATE condicional
  `updateMany`** (WHERE `id ∧ version=expectedVersion ∧ status ∈ predicado`) + el **insert de auditoría** en la
  **misma** `$transaction`. `applyTransition` y `reassignOrder` lo consumen con distinto `data`/`audit`.
- **Lo que se comparte es SOLO el boilerplate** (el UPDATE condicional + insert de auditoría transaccional).
  La **clasificación de 0-filas NO se comparte** y **NO** se fusiona en una función paramétrica única:
  - `applyTransition` **conserva intacto** su clasificador de 002b (`classifyZeroRows`:
    NOT_FOUND → VERSION_CONFLICT → INVALID_TRANSITION → GUARD_UNMET, version-first). **Sin cambio de
    comportamiento** (Constitution XV) — verificado porque los tests de 002b siguen verdes (T007) y el arch
    boundary test no altera su lógica.
  - `reassignOrder` usa su **propio clasificador** con **precedencia status>version** (D-04). Vive junto al
    caso de uso, no dentro de la primitiva compartida.
- **Rationale**: H-008 pedía evitar **divergencia accidental** del patrón atómico (que una ruta olvide la
  auditoría o el WHERE condicional), NO homogeneizar la clasificación (que debe divergir a propósito: 002b es
  dominio puro sin endpoint; reasignación expone endpoint y su predicado de visibilidad es el estado). Compartir
  el boilerplate cierra H-008 sin arriesgar la semántica de 002b.
- **Alternativas**: (a) función de clasificación única paramétrica → riesgo de cambiar en silencio el código de
  error de `applyTransition` en una carrera de 002b (rechazada, G2-B2); (b) repo separado para reasignación →
  duplica el boilerplate atómico y el mapeo P2003→FK (rechazada).

## D-04 · Clasificación de 0-filas con precedencia status > version (S-001/H-006)

- **Decisión**: tras un `updateMany` que afecta 0 filas, releer la orden y clasificar **en este orden de
  evaluación**: (1) no existe → `ORDER_NOT_FOUND` (404); (2) `status ∉ {assigned,in_progress}` →
  `ORDER_NOT_REASSIGNABLE` que **colapsa a 404** (fuera de ámbito) — **evaluado antes que version**; (3) sólo si
  sigue reasignable pero `version ≠ expectedVersion` → `VERSION_CONFLICT` (409).
- **Rationale**: cierra el oráculo 409-vs-404 bajo carrera cruzada reasignación↔transición-FSM (una transición
  concurrente saca la orden de ámbito **y** bumpea version; si se evaluara version primero se filtraría 409).
  Diverge conscientemente del `classifyZeroRows` de 002b (que devuelve `VERSION_CONFLICT` antes de estado): la
  reasignación necesita `ORDER_NOT_REASSIGNABLE→404` con precedencia, porque su predicado de visibilidad **es**
  el estado (a diferencia de las transiciones internas de 002b, que no exponen endpoint). Este clasificador es
  **propio de `reassignOrder`** y **no** modifica el de 002b (ver D-03).
- **`ORDER_NOT_REASSIGNABLE` colapsa a 404 byte-idéntico** (cierre G2-A5, SC-008): es un **diagnóstico interno**
  (para logs/depuración), **nunca** un `code` distinto en el cuerpo al cliente. En `error-mapper.ts` se mapea al
  **mismo 404 genérico** que `ORDER_NOT_FOUND` (idéntico `code`, sin `details`, mismas cabeceras). Se añade
  `ORDER_NOT_REASSIGNABLE` al catálogo `ErrorCode`/`STATUS` (→404) para que `tsc` sea exhaustivo, pero su
  serialización es indistinguible de `ORDER_NOT_FOUND`.
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

## D-07 · Validez del técnico destino y no-oráculo (S-003/S-006, FR-005) — validación en DOMINIO (cierre G2-A2)

- **Decisión**: la validación de destino es **regla de negocio del DOMINIO**, no del handler. El caso de uso
  `reassign-order.ts` la ejecuta **una sola vez** a través de un **puerto de usuarios inyectado**
  (`UserLookupPort.findAssignableTechnician(id)` → existe ∧ `role='technician'` ∧ `disabledAt IS NULL`) y compara
  contra el `assigned_to` **leído en la consulta de visibilidad** (D-11). El **handler es delgado**: sólo
  extrae `req.auth`, invoca la visibilidad (puerto, D-11) y delega en el dominio; **no** duplica la validación
  de destino. Cualquier fallo → **422 `INVALID_ASSIGNEE`**, cuerpo **genérico idéntico** para las 4 causas.
- **Rationale**: evita la doble validación handler↔dominio (H-003/G2-A2) y respeta hexagonal (Constitution III:
  dominio con la regla, handler orquesta). Cuerpo idéntico cierra el oráculo por contenido (S-003). Paridad de
  **latencia** entre las 4 causas = residual documentado **BL-064**.
- **Alternativas**: validar en el handler → viola hexagonal y arriesga divergencia con el dominio (rechazada).
  `details` con la causa concreta → oráculo de enumeración (rechazada).

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

## D-10 · Doctrina de errores de BD: 503 (BD no disponible) vs 500 (inesperado) (FR-010, BL-060; cierre G2-M1)

- **Decisión**: dos casos distintos, coherentes con `listOrders` (que ya usa 503) y con Constitution X:
  - **BD no disponible / caída / timeout de conexión** → **503** (fail-closed, reintentable), **misma doctrina**
    que `listOrders`. Reutiliza el `SERVICE_UNAVAILABLE→503` ya existente en el catálogo.
  - **Error de BD inesperado ≠ FK-asignatario** (deadlock, constraint futura, UUID inválido no atrapado antes)
    → **500** genérico `{code,message,agent_action}`, sin filtrar SQLSTATE/constraint/columna/query.
  - **FK del asignatario** (Postgres `P2003`) → `INVALID_ASSIGNEE` (422) según origen.
- **Rationale**: un cliente/agente distingue transitorio-reintentable (503) de fallo real (500), consistente
  con el resto de la API para el mismo tipo de incidente (G2-M1/H-007). Evita fuga de detalle de Postgres
  (BL-060). El contrato de `reassignOrder` añade **503**. Tests: SC-007 (error ≠ FK → 500 sin detalle) + caso
  de BD no disponible → 503.

## D-11 · Orden de validación en el handler: visibilidad ANTES que forma del body (cierre G2-B1)

- **Decisión**: el pipeline del handler ejecuta, en **este orden estricto** (FR-004): (1) `authenticate` →
  401; (2) `requireRole('dispatcher')` → 403; (3) **consulta de visibilidad** (puerto D-12) → 0 filas ⇒ **404**
  genérico; (4) **sólo con la orden visible**: parseo/validación de forma del body (Zod `.strict()` + `reason`)
  y validez de destino → **422** (`VALIDATION_ERROR`/`INVALID_ASSIGNEE`); (5) guarda atómica → 409/200. La
  validación de forma del body **NO** se monta como middleware previo genérico (patrón habitual de 001/002),
  sino **dentro del handler, después** de la visibilidad.
- **Rationale**: garantiza que **ningún 422 es alcanzable para una orden no visible** — el 422 nunca precede al
  404. Así, para una orden inexistente o no reasignable, la respuesta es **siempre 404** con independencia de si
  el body es válido (cierra el oráculo 404-vs-422, G2-B1). Verificación: test que cruza **"orden no visible ×
  body inválido (reason ausente/>500cp / campo extra / assignee_id mal formado)"** → **404** (no 422).
- **Alternativas**: validar el body como middleware antes de la visibilidad → un body inválido daría 422 antes
  del 404, desviándose del orden de FR-004 (rechazada, G2-B1). *(Aunque un 422 uniforme por body-inválido no
  filtra existencia por sí solo, se adopta el orden de FR-004 al pie de la letra para no dejar la garantía
  dependiente de ese matiz y simplificar el razonamiento de seguridad.)*

## D-12 · Consulta de visibilidad como puerto inyectado (cierre G2-A3)

- **Decisión**: la consulta de visibilidad de FR-004 (`WHERE id=:orderId AND status IN
  ('assigned','in_progress')`, que decide el 404 y de la que se relee `version`) se expone como **método de
  puerto inyectado** —`OrderVisibilityPort.findReassignable(orderId)` → `{ id, assignedTo, version } | null`—
  implementado en infra (Prisma); **no** se llama a Prisma directamente desde el handler.
- **Rationale**: respeta la inyección de dependencias del Constitution Check; permite **testear la
  no-enumeración con fakes** en unit (no sólo integración) y mantiene los handlers sin import de Prisma
  (hexagonal, Constitution III). Cierra G2-A3/H-004.
- **Alternativas**: Prisma directo en el handler → fuga de infra sin fake (rechazada).

## D-13 · Conteo de longitud de `reason`: code points en ambas capas (cierre G2-M5)

- **Decisión**: el límite `1..500` de `reason` se cuenta en **code points Unicode** en las dos capas. En el
  contrato OpenAPI, `maxLength`/`minLength` de JSON Schema ya se definen **por code points** (spec JSON Schema),
  así que ajv cuenta bien. En Zod, **no** usar `.min()/.max()` (cuentan UTF-16 code units) sino un
  **refinamiento** sobre `[...reason].length` (más el requisito ≥1 carácter imprimible, FR-006).
- **Rationale**: evita discrepancia entre el contract test (ajv) y el test de FR-006 (Zod) en inputs con
  caracteres astrales (emoji) en el límite (G2-M5/H-005).
