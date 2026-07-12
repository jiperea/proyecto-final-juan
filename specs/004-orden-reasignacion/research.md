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
  La **clasificación de 0-filas NO se comparte** y **NO** se fusiona en una función paramétrica única.
- **Puerto de dominio con nombre de negocio (cierre G2-P3)**: el DOMINIO **no** conoce `conditionalWriteWithAudit`
  (helper privado de infra). El dominio inyecta un **puerto de negocio** `OrderReassignmentPort.reassign(cmd)`
  (en `write-side-ports.ts`), cuyo `cmd = {orderId, assigneeId, actorId, reason, expectedVersion}`. `reassign`
  devuelve un **resultado crudo, sin clasificar**: en éxito `{ count: 1, order: <fila> }`; en 0 filas
  `{ count: 0, order: <snapshot {id,status,assignedTo,version}> | null }` (null si no existe). El nombre
  `conditionalWriteWithAudit` es un **detalle interno privado** de `order-write-side-repository.ts`, nunca un
  símbolo del puerto de dominio.
- **Quién clasifica / quién audita**:
  - `applyTransition` **conserva intacto** su camino de 002b: su `classifyZeroRows`
    (NOT_FOUND → VERSION_CONFLICT → INVALID_TRANSITION → GUARD_UNMET, version-first) **no se toca**. **Sin
    cambio de comportamiento** (Constitution XV) — los tests de 002b siguen verdes (T008).
  - `reassignOrder` (DOMINIO, `reassign-order.ts`) recibe el resultado crudo de `OrderReassignmentPort` y aplica
    su **propio clasificador** con **precedencia status>version** (D-04). El unit test de dominio (con un
    **fake** del puerto que devuelve snapshots) prueba la **clasificación real**.
  - El **ensamblado de la fila de auditoría** de reasignación (`event_type='reassignment'`, `from_assignee`,
    `to_assignee`, `from_status==to_status`) ocurre en **INFRA** (dentro de `reassign`), que es quien tiene la
    `$transaction` y la fila; el dominio **no** ensambla la auditoría.
- **Origen del `status` de auditoría (cierre G2-P1)**: `from_status`/`to_status` de la fila de auditoría
  (NOT NULL, heredadas de 002b) = el **estado real de la orden**, obtenido por una **relectura dentro de la
  misma `$transaction`** en infra (patrón `attempt()` de 002b: `before = tx.order.findUnique`), tras confirmar
  el UPDATE condicional (`count=1`). Como la reasignación **conserva** el estado, `from_status == to_status ==`
  ese `status` leído. **No** se usa el `status` del snapshot de visibilidad para la auditoría (evita que un
  cambio `assigned↔in_progress` entre la lectura de visibilidad y el UPDATE grabe un `from_status` obsoleto).
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
- **`ORDER_NOT_REASSIGNABLE` colapsa a 404 byte-idéntico** (cierre G2-A5/N3, SC-008): es un **diagnóstico
  interno** (para logs/depuración), **nunca** un `code` distinto en el cuerpo al cliente. **Mecanismo concreto**
  (no basta con mapearlo a 404, porque el patrón por defecto del catálogo serializa el nombre del `ErrorCode`
  como `code`): en `error-mapper.ts` se añade un **caso explícito** que, cuando el `DomainError` interno es
  `ORDER_NOT_REASSIGNABLE`, **reescribe el cuerpo** al de `ORDER_NOT_FOUND` (mismo `code` genérico, sin
  `details`, mismas cabeceras) **antes de serializar** — es decir, `body.code` sale como `ORDER_NOT_FOUND`. Se
  añade `ORDER_NOT_REASSIGNABLE` al catálogo `ErrorCode`/`STATUS` (→404) para exhaustividad de `tsc`, pero su
  serialización al cliente es **idéntica** a `ORDER_NOT_FOUND`. El test de no-enumeración (T018) verifica la
  igualdad byte a byte.
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
  contra el `assigned_to` **del snapshot de visibilidad** (leído por el puerto D-12). **Lectura única (N7)**: el
  handler hace **una sola** llamada a `OrderVisibilityPort.findReassignable` y **pasa ese snapshot** al dominio;
  el dominio **no** dispara una segunda lectura de la orden (evita una ventana TOCTOU entre dos lecturas). El
  **handler es delgado**: extrae `req.auth`, invoca la visibilidad (puerto D-12) y delega en el dominio; **no**
  duplica la validación de destino. Cualquier fallo → **422 `INVALID_ASSIGNEE`**, cuerpo **genérico idéntico**
  para las 4 causas.
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

## D-10 · Catch-all de errores de BD → 500 genérico (FR-010, BL-060)

- **Decisión** (conforme a la spec CONGELADA, FR-010): **todo** error de BD que **no** sea la FK del asignatario
  —deadlock, timeout, BD no disponible/caída, UUID inválido no atrapado antes, constraint futura— colapsa a
  **500** genérico `{code,message,agent_action}`, sin filtrar SQLSTATE/constraint/columna/query. Un manejador de
  nivel superior convierte cualquier error no controlado en 500 genérico.
- **Mapeo `P2003` acotado por constraint (cierre G2-P4)**: el insert de auditoría tiene **tres** FK
  `onDelete:Restrict` (`actor_id`, `from_assignee`, `to_assignee`). El mapeo `P2003 → INVALID_ASSIGNEE (422)`
  aplica **sólo** cuando la constraint violada es la de **`to_assignee`** (destino) — se inspecciona
  `error.meta.field_name`/nombre de constraint. Una violación de `actor_id` o `from_assignee` (bug interno o
  carrera) **NO** es "destino inválido": → **500** genérico (fallo del sistema, no culpa del cliente).
- **Rationale**: FR-010 (aprobada en G1) fija explícitamente 500 para estos casos; `reassignOrder` **NO** expone
  503. Evita fuga de detalle de Postgres (BL-060). Test: SC-007 (error ≠ FK → 500 sin detalle, grep negativo).
- **Reconciliación diferida (BL-066)**: `listOrders` (002a) usa **503** fail-closed para BD no disponible.
  Distinguir 503 (transitorio-reintentable) de 500 en `reassignOrder` sería una mejora de doctrina, pero
  **cambia el contrato observable** y contradice la FR-010 congelada; se difiere a **BL-066** (reconciliar la
  doctrina 503/500 entre endpoints en una **revisión de spec** futura, no en 004).
- **Alternativas**: añadir 503 ahora → contradice la spec congelada e introduce deriva spec↔plan (rechazada,
  G2-N1).

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

## D-12 · Consulta de visibilidad como puerto inyectado (cierre G2-A3) + alcance de "lectura única" (P2)

- **Decisión**: la consulta de visibilidad de FR-004 (`WHERE id=:orderId AND status IN
  ('assigned','in_progress')`, que decide el 404 y de la que se relee `version`) se expone como **método de
  puerto inyectado** —`OrderVisibilityPort.findReassignable(orderId)` → `{ id, status, assignedTo, version } |
  null`— implementado en infra (Prisma); **no** se llama a Prisma directamente desde el handler. Incluye
  `status` (P1) para que el dominio disponga del estado en su validación/clasificación.
- **Alcance de "lectura única" (N7, aclarado P2)**: "una sola lectura" se refiere a la **capa handler/dominio**
  — el handler llama a `OrderVisibilityPort` **una vez** y pasa el snapshot al dominio; el dominio **no**
  dispara otra lectura de aplicación. La **primitiva atómica de infra** (`reassign`/`conditionalWriteWithAudit`)
  hace, **dentro de su `$transaction`**, su propia relectura (patrón `attempt()` de 002b) para construir el
  `WHERE` condicional y el `status` de auditoría (P1): esto **NO** viola N7 —es una operación **within-tx
  TOCTOU-safe**, no una segunda lectura de capa de aplicación—. La ventana TOCTOU que N7 cierra es entre dos
  lecturas de **aplicación** (handler + dominio), no la relectura transaccional interna.
- **Rationale**: respeta la inyección de dependencias; permite **testear la no-enumeración con fakes** en unit y
  mantiene los handlers sin import de Prisma (hexagonal, Constitution III). Cierra G2-A3/H-004/P2.
- **Alternativas**: Prisma directo en el handler → fuga de infra sin fake (rechazada); no releer en infra →
  imposibilita el `WHERE` condicional atómico y el `status` de auditoría (rechazada).

## D-13 · Conteo de longitud de `reason`: code points en ambas capas (cierre G2-M5)

- **Decisión**: el límite `1..500` de `reason` se cuenta en **code points Unicode** en las dos capas. En el
  contrato OpenAPI, `maxLength`/`minLength` de JSON Schema ya se definen **por code points** (spec JSON Schema),
  así que ajv cuenta bien. En Zod, **no** usar `.min()/.max()` (cuentan UTF-16 code units) sino un
  **refinamiento** sobre `[...reason].length` (más el requisito ≥1 carácter imprimible, FR-006).
- **Rationale**: evita discrepancia entre el contract test (ajv) y el test de FR-006 (Zod) en inputs con
  caracteres astrales (emoji) en el límite (G2-M5/H-005).

## D-14 · Validación del path param `orderId` → 404 genérico (cierre G2-N5/S-101)

- **Decisión**: el path param `orderId` se valida como **uuid** en el handler, **tras** `authenticate`/
  `requireRole` y como parte de la resolución de visibilidad. Si `orderId` **no es un uuid válido**, se responde
  el **mismo 404 genérico byte-idéntico** que `ORDER_NOT_FOUND` (un id malformado no puede corresponder a
  ninguna orden), **cortocircuitando ANTES de tocar Prisma**.
- **Rationale**: evita que un `orderId` malformado llegue a Prisma y provoque un cast error `P2023` que la
  doctrina D-10 mapearía a **500** — lo que abriría una **4ª vía** de respuesta no cubierta por el test
  byte-idéntico de SC-008. Tratarlo como 404 genérico (no 400) lo integra en la no-enumeración: inexistente,
  no-reasignable, colapso post-UPDATE y **orderId malformado** dan **todos** el mismo 404. No filtra nada (un
  id malformado no es un identificador enumerable). El test de no-enumeración (T018) añade esta 4ª vía.
- **Alternativas**: 400/422 por id malformado → introduce un código distinguible por forma del id (rechazada);
  dejar que Prisma lance P2023→500 → 4ª vía inconsistente con SC-008 (rechazada, S-101).
- **Conformidad con la spec congelada (P5)**: tratar un `orderId` sintácticamente inválido como **404** es una
  **interpretación conforme** de FR-004, no una ampliación del contrato: FR-004 responde 404 para "no existe / no
  visible", y un identificador que **no puede nombrar ninguna orden** cae en "no existe". El comportamiento
  observable sigue siendo el **mismo 404 genérico** ya especificado; no añade códigos ni respuestas nuevas, por
  lo que **no requiere reabrir la spec** (G1 congelado). Se documenta aquí el razonamiento para la trazabilidad.
- **Fallo de BD durante la visibilidad (P6)**: si `OrderVisibilityPort.findReassignable` falla por un error real
  de BD, la excepción **propaga** al catch-all → **500** (FR-010); **no** se captura para devolver `null` (que
  daría un 404 falso, enmascarando una caída). El test de errores lo cubre explícitamente.
