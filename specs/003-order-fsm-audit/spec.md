# Feature Specification: Order — máquina de estados + auditoría append-only (Fundación B-2)

**Feature Branch**: `003-order-fsm-audit`

**Created**: 2026-07-11

**Status**: Draft

**Input**: Feature 002b (roadmap) — write-side de la Fundación B: FSM explícita de Order + auditoría
append-only de transiciones, como **maquinaria** de dominio que consumirán 003/004/005. Slice pequeño (XV):
NO añade endpoints de negocio; reutiliza `Order`/`version` de 002a y errores/observabilidad de 001.

## Clarifications

### Session 2026-07-11

- Q: ¿002b expone endpoint o es dominio puro? → A: **Dominio puro, sin endpoint HTTP nuevo**; la maquinaria
  (`applyTransition`/FSM/auditoría) la consumen 003/004/005 (que añaden endpoints + RBAC + pertenencia).
  Contract-first **N/A** (no hay interfaz HTTP nueva); verificación por tests dominio+repositorio contra Postgres real.
- Q: ¿Tabla de transiciones legales? → A: **exactamente** `draft→assigned`, `assigned→in_progress`,
  `in_progress→pending_review`, `pending_review→closed`, `pending_review→in_progress` (rechazo). Cualquier otra
  (mismo estado, desde `closed`) → ilegal (`INVALID_TRANSITION`/422).
- Q: ¿`reason` obligatorio? → A: **opcional (nullable)** en 002b; la obligatoriedad por caso (p. ej. rechazo en
  005) la imponen 003/004/005, no 002b.
- Q: ¿`actor_id` en la auditoría? → A: **siempre requerido** (toda transición tiene un actor que provee el llamador).

**Cierres del gate G1 (mismo día):**

- Q: ¿Sanea PII de `reason` 002b o el llamador? → A: **el llamador** (003/004/005) — precondición testada por
  cada uno; 002b lo persiste y jamás lo saca en logs/errores (H-001, Const. XI).
- Q: ¿Concurrencia obligatoria pese a ser stretch? → A: 002b exige **consistencia (no lost-update)** como
  *correctness* mandatory; la **exposición If-Match→409** al cliente sigue siendo *stretch* (003/004). Se
  reconcilia el texto de la constitution en gobernanza (H-002, BL).
- Q: ¿Append-only cómo? → A: **a nivel de BD** (REVOKE UPDATE/DELETE o trigger), no solo por API (H-005).
- Q: ¿Bypass de `status`? → A: **prohibido**; único punto de escritura `applyTransition` (test arquitectura, H-004).
- Q: ¿`draft→assigned`? → A: **fuera** de la tabla (creación fuera del proyecto; sin llamador, H-007).
- Q: ¿`OrderAudit` cubre BL-002 (accesos denegados)? → A: **no**; esa auditoría es una entidad separada (H-003).

> **Leyenda de IDs de hallazgo (convención de trazabilidad).** Los IDs `H-`/`S-`/`T-`/`K-` están **scoped a su
> panel y pasada**, y **NO** son identificadores globalmente únicos; el mismo número puede reaparecer en paneles
> distintos con significado distinto. La **fuente autoritativa** de cada hallazgo (con su descripción completa)
> son los informes de `specs/003-order-fsm-audit/gates/`. Prefijos usados aquí: `H-00x` **sin prefijo** en el
> bloque *Session 2026-07-11* y su *Cierres del gate G1 (mismo día)* = panel **G1 original** (primera pasada,
> pre-G2); `G2:*` = panel **G2** (consistencia + regresión); `G1:*` = panel **G1 re-entrada** (este ciclo). Para
> trazar una decisión, úsese la **descripción + el informe de gate**, no sólo el número.

**Cierres del gate G2 (remediación de consistencia, mismo día):**

- Q: ¿Qué código devuelve una guarda de pertenencia no satisfecha (G2:H-001/G2:S-004)? → A: un resultado de
  dominio propio **`GUARD_UNMET`** (sin status HTTP fijo; el mapeo lo gobierna FR-009), para el caso "orden
  existe + version correcta + status origen legal, pero la guarda inyectada no se cumple" (antes sin código).
  Reflejado en FR-003 (4) y en el catálogo de errores.
- Q: ¿Orden determinista al afectar 0 filas el UPDATE condicional (G2:H-002/G2:K-004)? → A: **(1) no existe→404;
  (2) version→409; (3) status no legal→422; (4) guarda→`GUARD_UNMET`**, unificado en spec ↔ research ↔ data-model.
- Q: ¿Append-only por REVOKE o por TRIGGER (G2:S-002/G2:H-003)? → A: **TRIGGER `BEFORE UPDATE OR DELETE`** que
  lanza excepción — un `REVOKE` NO afecta al **propietario** de la tabla (rol único `fieldops`) ⇒ test verde-falso.
  Migración **reversible** (`down`: DROP TRIGGER/FUNCTION); el test usa el **rol de runtime** de la app. Reflejado
  en FR-005 y SC-003.
- Q: ¿Cómo se verifica la concurrencia (G2:T-001/G2:H-006)? → A: propiedad de concurrencia optimista: N
  transiciones con la misma `expectedVersion` → **exactamente una gana**, el resto → `VERSION_CONFLICT`, 1 sola
  auditoría; garantizado por el UPDATE condicional **con o sin solape** (test con `Promise.all` + caso secuencial).
  El TOCTOU pertenencia se prueba de forma **determinista secuencial** (SC-005). Reflejado en SC-002/SC-005.
- Q: ¿Precondiciones de contrato para 003/004/005 (G2:S-005/G2:H-007/G2:H-008)? → A: **`actor_id` = usuario
  autenticado** (no arbitrario); **`guard`** es objeto tipado seguro (`{assignedTo?}`) → `where` parametrizado
  (no SQL crudo); **`OrderAudit.order_id onDelete: Restrict`** ⇒ una orden con auditoría no se borra físicamente
  (permanente). Reflejado en Assumptions.

**Cierres del gate G1 (re-entrada tras la remediación de G2, mismo día):**

- Q: ¿La clasificación 404/409/422 filtra existencia/estado a actores no autorizados (G1:S-001)? → A: sí era un
  oráculo de enumeración; se añade **FR-009** (contrato de no-enumeración): las consumidoras colapsan a **404**
  todo caso de actor no autorizado sobre la orden (incl. `GUARD_UNMET`/`VERSION_CONFLICT`/`INVALID_TRANSITION`)
  salvo que el actor ya esté autorizado. Resuelve también la asimetría HTTP (G1:H-003).
- Q: ¿SC-002 "solape real / falla si se serializa" es verificable (G1:T-001)? → A: **no**, era infalsable; la
  corrección de la concurrencia optimista **no depende del scheduling**. SC-002 reescrito a la propiedad real
  (exactamente uno gana) verificable con `Promise.all` + caso secuencial.
- Q: ¿Quién posee `draft→assigned` (G1:H-001)? → A: **nadie dentro del alcance**: la creación está fuera del
  proyecto; las órdenes entran ya en su estado operativo; `draft` es semilla sin transición saliente. Ninguna
  orden queda atascada dentro del roadmap. Reflejado en Edge Cases/Scope.
- Q: ¿GUARD_UNMET tiene Acceptance Scenario y SC de `reason` medible (G1:H-002/G1:S-002)? → A: se añaden el
  **Acceptance Scenario 6** (GUARD_UNMET) y **SC-006** (no-fuga de `reason`, verificable por grep negativo).
- Q: ¿SC-005 puede ser flaky (G1:H-004)? → A: se reescribe a test **determinista secuencial** (sin tercer
  mutador entre UPDATE y re-lectura). Riesgo residual de PII (G1:H-005) y mantenimiento del trigger
  (G1:H-008) → BL-055; defensa en profundidad (G1:S-003/S-004/S-005) → BL-056; fallo FK actor_id (G1:H-009) →
  `ACTOR_INVALID`. Reflejado en Assumptions/Edge Cases.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Transicionar una orden de forma segura y auditada (Priority: P1)

Un caso de uso de negocio (reasignación 003, ejecución 004, revisión 005) necesita cambiar el estado de una
orden. La maquinaria valida que la transición es **legal** según la FSM, la aplica con **concurrencia
optimista** y deja **rastro de auditoría inmutable**, todo de forma **atómica**.

**Why this priority**: es la base transaccional y de trazabilidad sobre la que se construyen todas las
acciones de negocio de FieldOps; sin ella, 003/004/005 no pueden mutar estado de forma consistente.

**Independent Test**: a nivel de dominio+repositorio contra Postgres real: una transición legal cambia
`status`, incrementa `version` y crea un registro de auditoría (todo o nada); una ilegal o con versión
obsoleta no deja ningún efecto.

**Acceptance Scenarios**:

1. **Given** una orden en `assigned` (version=0), **When** se aplica la transición a `in_progress` con
   `expectedVersion=0`, **Then** la orden queda en `in_progress` con `version=1` **y** existe un registro de
   auditoría `{from:assigned, to:in_progress, actor, reason, at}`.
2. **Given** una orden en `assigned`, **When** se intenta la transición a `closed` (no legal desde `assigned`),
   **Then** falla con `INVALID_TRANSITION` (→422) y **no** cambia la orden ni crea auditoría.
3. **Given** una orden en `assigned` (version=1), **When** se aplica una transición con `expectedVersion=0`
   (obsoleta), **Then** falla con `VERSION_CONFLICT` (→409) y **no** cambia la orden ni crea auditoría.
4. **Given** una transición legal, **When** la escritura de auditoría falla, **Then** la transición entera se
   revierte (atomicidad: la orden no cambia de estado sin su registro de auditoría).
5. **Given** un registro de auditoría existente, **When** se intenta modificarlo o borrarlo, **Then** la
   operación no está permitida (append-only e inmutable).
6. **Given** una orden en estado y versión correctos pero con una **guarda de pertenencia inyectada que no se
   satisface** (p. ej. `assigned_to` distinto del actor), **When** se aplica la transición, **Then** afecta 0
   filas y el resultado es **`GUARD_UNMET`** sin cambiar la orden ni crear auditoría (el consumidor lo mapea
   según FR-009).

### Edge Cases

- Transición al **mismo** estado (no-op, p. ej. `in_progress`→`in_progress`) → `INVALID_TRANSITION` (no legal).
- Transición desde un estado **terminal** (`closed`) → `INVALID_TRANSITION`.
- Rechazo de revisión: `pending_review`→`in_progress` **es** legal (la usa 005).
- Dos transiciones concurrentes sobre la misma orden: solo una gana (la otra → `VERSION_CONFLICT`), sin doble
  auditoría ni estado inconsistente.
- `reason` es texto **pre-saneado** por el llamador → no PII cruda; **no se loguea ni va en errores**.
- `order_id` inexistente → `ORDER_NOT_FOUND` (**404**), sin efecto.
- `actor_id` inexistente → la FK de la auditoría falla y la transacción **revierte** entera (no efecto) — es
  también la técnica de test de atomicidad (SC-004).
- Transición ilegal Y versión obsoleta a la vez → clasificación determinista por el orden de FR-003
  (existencia → **version (409)** → status → guarda); version tiene precedencia sobre status ilegal.
- **`draft` es estado semilla sin transición saliente en el proyecto** (G2:H-001): la creación/alta de órdenes
  está **fuera del proyecto**; las órdenes entran directamente en su estado operativo inicial (`assigned` en
  adelante). `draft` sólo existe como dato semilla ilustrativo de "aún no asignada"; **ninguna** feature del
  roadmap (002a/002b/003/004/005) transiciona `draft→assigned`, por lo que su ausencia en la FSM es intencional
  y no deja órdenes "atascadas" dentro del alcance. Si en el futuro se añade el alta real, esa feature será la
  dueña de `draft→assigned` y la incorporará a la tabla.
- **Fallo real de FK de `actor_id`** (no de test, G2:H-009): como `actor_id` = usuario autenticado (existe por
  construcción), un fallo de FK indica un bug del llamador o un usuario borrado/revocado; se clasifica como
  error de dominio `ACTOR_INVALID` (resultado accionable, sin status HTTP propio → el llamador lo trata como
  error interno) y **el mensaje crudo de Postgres NUNCA se propaga** a logs/errores (FR-008 extendido a errores
  de BD, no sólo a `reason`).
- **Sin cancelación ni límite de rechazo** (decisión de alcance deliberada): 002b no define `*→cancelled` ni
  tope al ciclo `pending_review↔in_progress`; una vía de cancelación es feature futura (backlog).

## Requirements *(mandatory)*

### Functional Requirements (EARS)

- **FR-001**: THE sistema SHALL definir una **tabla de transiciones legales** determinista de Order:
  `assigned→in_progress`, `in_progress→pending_review`, `pending_review→closed`,
  `pending_review→in_progress` (rechazo). Cualquier otra (incl. mismo estado y desde `closed`) es ilegal.
  *(No se incluye `draft→assigned`: la creación/alta de órdenes está fuera del proyecto; `draft` es solo un
  estado semilla sin transición en el roadmap — H-007.)*
- **FR-002**: WHEN se solicita una transición cuyo par (origen→destino) **no** está en la tabla, THE sistema
  SHALL responder con `INVALID_TRANSITION` (mapea a **422**) y **no** producir ningún efecto.
- **FR-003** *(consistencia bajo concurrencia — correctness, NO el stretch If-Match)*: THE cambio de estado
  SHALL aplicarse mediante **un único UPDATE condicional atómico** `WHERE id=? AND version=expectedVersion AND
  status=<origen legal>` **+ predicados de guarda opcionales inyectados por el llamador** (p. ej.
  `AND assigned_to=?`) para que 003/004/005 **revaliden pertenencia dentro de la misma condición atómica**
  (cierra TOCTOU, G2:S-004). Si afecta 0 filas, THE sistema re-lee la orden y clasifica la causa
  (best-effort) en **este orden determinista** (unificado con research/data-model, H-002/K-004):
  (1) no existe → `ORDER_NOT_FOUND` (**404**); (2) `version` distinta → `VERSION_CONFLICT` (**409**);
  (3) `status` no es origen legal → `INVALID_TRANSITION` (**422**); (4) existe + version + status OK pero la
  guarda no se cumple → **`GUARD_UNMET`** (código de dominio propio; mapeo HTTP gobernado por **FR-009**) —
  G2:H-001/G2:S-004. **Estos códigos son un diagnóstico INTERNO de dominio**, NO una respuesta directa al
  cliente: los mapeos HTTP citados (404/409/422) son la referencia **para un actor autorizado sobre la orden**;
  la exposición a clientes la gobierna FR-009 (no-enumeración). Nota: bajo concurrencia el código es best-effort
  (el estado puede cambiar entre UPDATE y re-lectura); 003/004/005 no asumen correspondencia 1:1 exacta.
- **FR-004** *(atomicidad)*: WHEN la transición procede, THE sistema SHALL, en **una sola transacción**
  (todo o nada): (a) `status`→destino, (b) `version`+1, (c) insertar el registro de auditoría. Si CUALQUIER
  paso falla (p. ej. FK de `actor_id` inexistente en el insert de auditoría), la transacción **revierte** por
  completo: la orden no queda transicionada sin su auditoría. *(`order_id` inexistente ya se detecta en FR-003
  como `ORDER_NOT_FOUND` antes de llegar aquí — no es un camino de fallo de FK en el paso (c).)* En
  producción, un fallo de FK de `actor_id` (usuario borrado/revocado o bug del llamador) se traduce al resultado
  de dominio `ACTOR_INVALID` sin filtrar el error crudo de BD (G2:H-009, ver Edge Cases y FR-008).
- **FR-005** *(append-only, enforcement real)*: `OrderAudit` SHALL ser **append-only a nivel de base de datos**
  mediante un **TRIGGER `BEFORE UPDATE OR DELETE` que lanza excepción** (mecanismo primario, **independiente del
  propietario** de la tabla — un `REVOKE UPDATE,DELETE` NO basta porque el rol único `fieldops` es propietario y
  conserva privilegios; G2:S-002). Verificable: un intento de UPDATE/DELETE sobre `order_audit` **falla con error
  de BD** (SC-003), incluso con el rol de la aplicación.
- **FR-006** *(único punto de escritura)*: `Order.status`/`version` SHALL mutarse **exclusivamente** vía
  `applyTransition` (repositorio con un único método de transición; ningún otro camino escribe `status`/
  `version`). Verificable por test de arquitectura (H-004).
- **FR-007** *(separación de responsabilidades)*: LA maquinaria (`applyTransition` + FSM + auditoría) reside en
  el dominio como **función exportada** (único punto de escritura, FR-006); **NO** decide rol ni pertenencia:
  003/004/005 aplican el RBAC y pasan sus **predicados de pertenencia como guarda** al UPDATE atómico (FR-003)
  para revalidar sin TOCTOU. *(La "reutilización" por 003/004/005 se verificará en esas features; en 002b el
  criterio testeable es FR-006 — único punto de escritura.)*
- **FR-008** *(PII de `reason`)*: `reason` es **texto pre-saneado por el llamador** (003/004/005) — precondición:
  **NO** debe contener PII cruda (Const. XI: auditoría con texto saneado). 002b lo persiste verbatim y
  **NUNCA** lo serializa en **logs NI en `details`/`agent_action`** de los errores. Cada feature consumidora
  tiene la responsabilidad (y el test) de sanear `reason` antes de invocar. `reason` es opcional; `actor_id`
  requerido.
- **FR-009** *(contrato de no-enumeración para consumidoras — seguridad transversal, G1:S-001)*: los códigos de
  dominio de FR-003 son diagnóstico interno, NO una respuesta directa al cliente. **Precedencia con la
  autenticación**: FR-009 aplica **sólo después** de que la capa de auth de 001 haya resuelto la autenticación
  (petición sin credenciales válidas → **401**, sin cambios); el colapso a 404 es exclusivamente para un actor
  **autenticado pero no autorizado** sobre la orden concreta (G1:S-003). Reglas de mapeo uniformes para 003/004/005:
  - **(a) Actor NO autorizado sobre la orden** (no es visible para su rol/ámbito): THE consumidor SHALL devolver
    **404** con un **body/mensaje genérico e indistinguible** del de `ORDER_NOT_FOUND` — mismo status **y** mismo
    cuerpo (sin `code` de dominio interno, sin `details`), para no reabrir el oráculo por el canal del body
    (G1:S-001). Aplica a `GUARD_UNMET`, `VERSION_CONFLICT` e `INVALID_TRANSITION` cuando el actor no está autorizado.
  - **(b) Actor autorizado sobre la orden** (visible para su rol) pero la operación falla: `VERSION_CONFLICT`→**409**,
    `INVALID_TRANSITION`→**422**. Para **`GUARD_UNMET`** el mapeo depende del **origen de la autorización**
    (cierra el TOCTOU-oráculo, G2:H-004 cínico): si la visibilidad del actor **depende del propio predicado de
    pertenencia** (p. ej. técnico que sólo ve órdenes asignadas a sí mismo), entonces un actor recién desasignado
    ya **no** está autorizado → **404** (regla (a), no 403); si la visibilidad es **independiente de la
    pertenencia** (p. ej. supervisor/dispatcher por ámbito de rol), `GUARD_UNMET`→**403** (puede ver, no puede
    actuar). La "autorización" se evalúa con el **mismo dato fresco** que la guarda atómica, no con la lectura
    RBAC previa (evita el oráculo en reasignación concurrente). Regla uniforme para 003/004/005 (G1:H-001).
  - **Nota (diagnóstico best-effort → semántica de reintento, G2:H-003 cínico)**: bajo carrera el código de
    FR-003 puede no corresponder 1:1 con la causa real. Es **seguro** porque las consumidoras tratan **409**
    como "re-leer y reintentar" y **422/403/404** como terminal-para-este-intento; como el cliente **re-lee ante
    cualquier no-2xx**, un diagnóstico transitorio se autocorrige en el siguiente intento (riesgo residual aceptado).
  *(Requisito sobre las consumidoras; 002b lo enuncia como contrato, no lo implementa por no tener endpoint.
  Verificado en los gates de 003/004/005.)*
  - **Nota (side-channel de tiempo, G1:S-004)**: los 4 casos de FR-003 pueden tener latencias distintas (re-lectura
    vs predicado único); el riesgo de inferencia por tiempo se **acepta como residual** en este slice y se registra
    para acotarlo/normalizarlo en 003/004/005 (BL-056).
  - **`ACTOR_INVALID`** (G2:H-005 cínico): **no** debería alcanzarse por request normal (`actor_id` es server-side,
    contrato duro); si ocurriera, las consumidoras lo tratan como **error interno genérico (500)** sin filtrar
    detalle — queda fuera del contrato de exposición (a)/(b) por ser inalcanzable con entrada del cliente.

### Key Entities

- **OrderAudit** (append-only, inmutable): `id` (UUID v7), `order_id` (FK→Order), `actor_id` (FK→User),
  `from_status`, `to_status` (OrderStatus), `reason` (texto **pre-saneado por el llamador**, sin PII cruda;
  nunca en logs/errores), `at` (timestamptz). Es la auditoría de **transiciones**; la auditoría forense de
  **accesos denegados** (BL-002) es una **entidad SEPARADA** (no se fuerza sobre este esquema — H-003).
- **Transición** (valor de dominio): `{ from, to }` sobre `OrderStatus`; la tabla de legales es la FSM.

## Success Criteria *(mandatory)*

- **SC-001**: El 100% de las transiciones legales de la tabla se aplican con status+version+auditoría
  consistentes; el 100% de las ilegales se rechazan (422) sin efecto.
- **SC-002** *(consistencia — correctness, mandatory; distinta del stretch If-Match de 003/004)*: dadas **N
  transiciones con la misma `expectedVersion`** sobre la misma orden, **exactamente una** tiene éxito
  (`version`+1 y **1** fila de auditoría) y **todas las demás** afectan 0 filas → `VERSION_CONFLICT` (sin
  lost-update ni doble auditoría). Esta propiedad la **garantiza el UPDATE condicional atómico** (el predicado
  `version=expectedVersion` hace que el escritor tardío no encuentre fila) **independientemente de si las
  transacciones se solapan o se serializan** — el bloqueo de fila de Postgres serializa las escrituras y la
  columna `version` decide el ganador. Test: dos `applyTransition` con la misma `expectedVersion` lanzados con
  `Promise.all` → 1 ok + 1 `VERSION_CONFLICT` + 1 fila de auditoría; **más** un caso secuencial determinista de
  version obsoleta. *(No se afirma "el test falla si se serializa": sería infalsable — la corrección no depende
  del scheduling, G1:T-001.)* La **exposición** `If-Match`→409 al cliente es *stretch* (003/004; reconciliación
  constitution → BL-050).
- **SC-005** *(TOCTOU pertenencia — verificación determinista, sin carrera)*: la guarda dentro del WHERE atómico
  cierra el TOCTOU. Test **determinista secuencial** (no flaky, G1:H-004): (1) el llamador lee la orden; (2) se
  muta `assigned_to` **en una transacción ya confirmada** (simula la reasignación concurrente); (3) el llamador
  aplica la transición con la guarda **obsoleta** (`expectedVersion` correcta, `assigned_to` antiguo) → afecta
  **0 filas** → re-lectura → `GUARD_UNMET` (no transiciona, no audita). Al controlar el entorno (sin un tercer
  mutador entre UPDATE y re-lectura) el resultado es reproducible pese al carácter best-effort de FR-003.
- **SC-006** *(no-fuga de `reason` — medible, G1:S-002)*: WHEN `applyTransition` emite cualquier log o error con un
  `reason` marcador único, THE valor de `reason` SHALL **no aparecer** en ningún log emitido ni en el payload de
  error serializado (`details`/`agent_action`/mensaje). Verificado por test que fuerza un error con un `reason`
  centinela y hace grep negativo sobre logs y sobre el error propagado.
- **SC-003**: Un intento de UPDATE/DELETE sobre `OrderAudit` **falla con error de BD** (append-only enforce a
  nivel de BD, no solo por API — comprobado).
- **SC-004** *(atomicidad, sin mockear ORM — Const. VII)*: se fuerza el fallo de la inserción de auditoría con
  un **`actor_id` inexistente** (viola la FK dentro de la transacción); resultado: la orden **no** queda
  transicionada (status/version intactos, 0 filas de auditoría) — atomicidad real contra Postgres. El test
  **además** aserta que el resultado de dominio es **`ACTOR_INVALID`** y que el **mensaje crudo de Postgres NO
  se propaga** al llamador ni a logs (cierre de FR-004/FR-008, G1:H-009 / G2:H-003 cínico).

## Scope

**Dentro**: FSM (tabla de transiciones legales), caso de uso `applyTransition` (validación + concurrencia
optimista + auditoría atómica), entidad `OrderAudit` append-only, catálogo de errores INVALID_TRANSITION(422)
/VERSION_CONFLICT(409), verificación por dominio+repositorio contra Postgres real.

**Fuera** (otras features): endpoints HTTP de transición y su RBAC/pertenencia (003 reasignación, 004
ejecución, 005 revisión), evidencia/fotos, resumen IA, creación/alta inicial de órdenes (fuera del proyecto),
auditoría forense de accesos denegados (base-ready, comportamiento en BL-002), multi-tenant.

## Assumptions

- **Congelado en `## Clarifications`**: 002b es **dominio puro** (sin endpoint; endpoints en 003/004/005),
  tabla de transiciones fija, `reason` opcional, `actor_id` requerido.
- Reutiliza `Order`/`version` de 002a y error-mapper/logger/config de 001.
- `OrderAudit` audita **transiciones**; la auditoría de **accesos denegados** (BL-002) es otra entidad
  (no se fuerza sobre este esquema) → se diseñará cuando se aborde BL-002.
- `actor_id`/`reason` los provee el llamador (003/004/005): `actor_id` requerido; `reason` **pre-saneado** (sin
  PII cruda). 002b no valida semánticamente, pero SÍ garantiza que `reason` nunca sale en logs/errores.
- **Pertenencia + concurrencia (para 003/004/005)**: la comprobación de pertenencia (p. ej. `assigned_to==user`)
  debe **revalidarse dentro** de la condición atómica de `applyTransition` (misma `expectedVersion`) para
  evitar TOCTOU frente a una reasignación concurrente (G2:S-004); 002b expone el UPDATE condicional que lo permite.
- Cifrado en reposo / control de lectura de `reason` en `OrderAudit`: fuera de 002a/b (infra) → **BL-051**.
- **`actor_id` = usuario autenticado (derivado server-side, contrato duro)**: 003/004/005 SHALL derivar
  `actor_id` **exclusivamente** del contexto de autenticación verificado server-side (el `userId` del JWT/sesión
  de 001) y **NUNCA** de un parámetro de la request del cliente — precondición **obligatoria** (no meramente
  documental) testada en el gate de cada consumidora, para preservar no-repudio/integridad de la auditoría
  (G1:S-002). El endurecimiento a un tipo `AuthenticatedActor` (en vez de `string`) queda en BL-056; el contrato
  server-side es exigible ya. La FK de `actor_id` sólo garantiza existencia del usuario (fallo → `ACTOR_INVALID`),
  no identidad.
- **`guard`** es un objeto **tipado y seguro** (p. ej. `{ assignedTo?: string }`) que 002b traduce a un
  `where` parametrizado de Prisma (nunca SQL crudo interpolado por el llamador) — evita inyección/deriva (H-007).
- **`OrderAudit.order_id` con `onDelete: Restrict`**: una `Order` con auditoría **no** puede borrarse
  físicamente (decisión permanente aceptada; retención/GDPR → soft-delete futuro, backlog) — H-008.
- **Append-only por TRIGGER** (no REVOKE): el rol `fieldops` es propietario de la tabla y conservaría
  privilegios pese a un REVOKE; el trigger es independiente del propietario (G2:S-002). El test usa el mismo rol
  de runtime de la app.
- **`guard.assignedTo` referencia `Order.assignedTo` de 002a** (G2:H-007): 002a define `assignedTo` (FK→User,
  nullable; columna `assigned_to`) en el esquema de `Order`. El objeto `guard` (`{ assignedTo?: string }`) mapea
  a ese campo exacto; si 002a lo renombrara, esta guarda debe actualizarse (dependencia formal, no sólo ejemplo).
- **PII mal saneada en `reason` = riesgo residual permanente** (G2:H-005): si un llamador inserta PII cruda pese
  a su precondición, el trigger append-only y `onDelete: Restrict` impiden corregirla dentro del sistema. El
  **procedimiento correctivo** (migración controlada que deshabilita el trigger, purga/anonimiza y lo rehabilita,
  con revisión y registro) se difiere a **BL-055**; hasta entonces se acepta como riesgo residual documentado.
- **Mantenimiento legítimo de `order_audit`** (G1:H-008): cualquier migración estructural futura sobre la tabla
  (p. ej. backfill de columna) usa el mismo procedimiento controlado de BL-055 (deshabilitar trigger dentro de
  la migración revisada); el diseño NO asume que la tabla jamás necesite intervención.
- **Numeración física vs lógica** (consist-G2:K-001): esta feature es la **carpeta/rama `003-order-fsm-audit`**
  (numeración física secuencial de la extensión git) y **equivale a la "002b"** del roadmap. Las consumidoras
  del roadmap **003 (reasignación) / 004 (ejecución) / 005 (revisión)** serán las **carpetas físicas 004/005/006**.
  Cuando la spec o T019 dicen "verificado en 003/004/005" se refieren a esas **features consumidoras por nombre**
  (reasignación/ejecución/revisión), **no** a esta carpeta 003. Se referencian por nombre para evitar ambigüedad.
- **Reconciliación Constitution XI — campo de evidencia** (consist-G2:K-006): XI pide que cada transición registre
  actor/timestamp/acción/motivo **y una referencia/hash de la evidencia**. `OrderAudit` de 002b **no** incluye el
  campo de evidencia porque las transiciones de este slice **no llevan evidencia** (fotos/notas llegan en 004
  ejecución, fuera de alcance). Es una **desviación temporal aceptada y documentada** (análoga a BL-050): el
  campo `evidence_ref`/hash se añadirá cuando 004 introduzca evidencia → **BL-057**. No es incumplimiento de XI:
  XI aplica a transiciones con evidencia asociada.
- **Defensa en profundidad diferida** (G2:S-003/S-004/S-005): endurecer `actor_id` a un objeto de actor
  autenticado tipado (no `string` plano), distinguir en el tipo `guard` obligatorio vs opcional, y un control
  operativo del `down` de la migración del trigger — son mejoras de robustez que **escalarían el contrato de
  este slice (XV)**; se registran en backlog (BL-056) y se abordan al integrar 003/004/005, no en 002b.
