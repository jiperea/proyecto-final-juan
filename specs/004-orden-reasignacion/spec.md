# Feature Specification: Reasignación de una orden por el dispatcher (Fundación — feature 003 del roadmap)

**Feature Branch**: `004-orden-reasignacion`

**Created**: 2026-07-11

**Status**: Draft

**Input**: Feature 003 del roadmap (write-side sobre la FSM de 002b y el RBAC de 001). Un **dispatcher**
reasigna una orden a otro técnico: cambia `assigned_to` **conservando** el `status`, con **auditoría
append-only atómica** y **RBAC dispatcher-only**. Primer endpoint HTTP que consume la maquinaria de dominio
de 002b (`applyTransition`/patrón atómico + `OrderAudit`), por lo que **salda la deuda de contrato** que 002b
dejó como "verificable sólo con endpoint" (BL-056/059/060/061/062).

> **Numeración física vs lógica** (heredada de 002b): esta feature es la **carpeta/rama
> `004-orden-reasignacion`** (numeración física secuencial de la extensión git) y **equivale a la "003
> (reasignación)"** del roadmap. Las siguientes serán 005 (ejecución = roadmap 004) y 006 (revisión = roadmap
> 005). Se referencian por **nombre** para evitar ambigüedad.

## Clarifications

### Session 2026-07-11

- Q: ¿Semántica de la reasignación respecto a la FSM de 002b? → A: **Conserva el estado** (caso de uso propio
  `reassignOrder` que reutiliza el patrón atómico de 002b; NO es transición de la FSM, NO la extiende). Reasignar
  una orden `in_progress` la deja en `in_progress` (no resetea). **Reconciliación necesaria** con `FR-006` de
  002b (único punto de escritura de `status`/`version` = `applyTransition`): el punto único pasa a ser el
  **módulo write-side del dominio** (`applyTransition` + `reassignOrder`), ambos vía UPDATE condicional atómico;
  ningún camino ad-hoc muta `status`/`version`. No rompe constitution (IV pertenencia es del technician, no del
  dispatcher; XI contempla "tras reasignar"; XV favorecido). Registrado para plan + gates (posible finding G2).
- Q: ¿Una orden en estado NO reasignable (closed/pending_review), pedida por un dispatcher, qué devuelve? → A:
  **404 no-enumeración estricto**. La visibilidad del dispatcher (constitution IV: "ve las reasignables") **es**
  el predicado "estado ∈ {assigned, in_progress}"; una orden fuera de esos estados NO está en su ámbito → **404
  indistinguible** de inexistente. Consecuencia: `ORDER_NOT_REASSIGNABLE` deja de ser un 409 al cliente y colapsa
  a **404**; el **único 409** que ve el dispatcher es `VERSION_CONFLICT` (reasignación concurrente con la orden aún
  reasignable). Coherente con FR-009 de 002b (regla (a): actor no autorizado → 404).
- Q: ¿Cómo se modela la reasignación en la auditoría (`OrderAudit` tiene `from_status`/`to_status`)? → A:
  **Extender `OrderAudit`** con `from_assignee`/`to_assignee` (FK→User, nullable) y un `event_type`
  (`transition` | `reassignment`); en reasignación `from_status == to_status`. Requiere **migración** (append de
  columnas; el trigger append-only de 002b se conserva). Consultable y explícito (alineado con XI: acción/motivo).
- Q: ¿Validación del técnico destino? → A: **Existe + rol `technician` + activo (`disabledAt IS NULL`) +
  distinto del asignatario actual**; cualquier fallo → **422** `INVALID_ASSIGNEE`. 001 modela `disabledAt`
  (nullable) ⇒ un technician deshabilitado no es destino válido. (`lockedUntil` es estado de login, no afecta a
  la elegibilidad como destino.)

### Session 2026-07-12

- Q: ¿Qué responde el endpoint ante un `orderId` de ruta **sintácticamente inválido** (no-uuid)? → A: el
  **mismo 404 genérico byte-idéntico** que "no existe". Un identificador que **no puede nombrar ninguna orden**
  equivale a inexistente (interpretación conforme de FR-004); se valida el formato uuid **antes** de tocar la BD
  para evitar un error de cast (P2023) que se distinguiría como 500. Es una **4ª vía** de 404 que se suma a las
  tres de SC-008 (inexistente / no-reasignable / colapso post-UPDATE), byte-idéntica a las demás. Ampliación
  compatible (superconjunto); no cambia ningún otro comportamiento congelado.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Reasignar una orden a otro técnico (Priority: P1)

Un **dispatcher** ve una orden que necesita cambiar de técnico (el asignado no está disponible, sobrecarga,
cambio de zona). Selecciona la orden y la reasigna a otro técnico, con un motivo. El sistema comprueba que
quien pide es dispatcher, que la orden es **reasignable** (está en un estado que admite reasignación) y que el
técnico destino es válido; aplica el cambio de asignatario de forma **atómica** y deja **rastro de auditoría
inmutable** (quién reasignó, cuándo, de qué técnico a qué técnico, motivo).

**Why this priority**: es la primera acción de negocio del roadmap que muta una orden vía HTTP; habilita la
operativa de despacho (reparto del trabajo) y ejercita —por primera vez con endpoint real— el RBAC de 001, la
FSM/atomicidad de 002b y el contrato de no-enumeración (FR-009 de 002b). Sin ella no hay reparto.

**Independent Test**: contra Postgres real (dominio + integración HTTP con Supertest): un dispatcher
autenticado hace la petición de reasignación sobre una orden reasignable a un técnico válido → 200, la orden
queda con el nuevo `assigned_to`, el `status` **no cambia**, `version`+1 y existe **exactamente un** registro
de auditoría de la reasignación. Un no-dispatcher, una orden no reasignable o un técnico destino inválido son
rechazados sin efecto.

**Acceptance Scenarios**:

1. **Given** una orden en `assigned` (asignada al técnico T1, version=0), **When** un dispatcher la reasigna a
   T2 con un motivo, **Then** responde **200**, la orden queda `assigned_to=T2` con `status=assigned`
   (sin cambio de estado), `version=1`, y existe **1** registro de auditoría
   `{order_id, actor=dispatcher, from_assignee=T1, to_assignee=T2, reason, at}`.
2. **Given** una orden en `in_progress` (reasignable), **When** un dispatcher la reasigna a otro técnico,
   **Then** responde **200**, `assigned_to` cambia, `status` **permanece** `in_progress`, `version`+1 y se
   audita la reasignación.
3. **Given** una orden en `pending_review` o `closed` (no reasignable → fuera del ámbito de visibilidad del
   dispatcher), **When** un dispatcher intenta reasignarla, **Then** responde **404** genérico e indistinguible
   de inexistente (no-enumeración) y **no** cambia la orden ni crea auditoría.
4. **Given** una petición **sin credenciales válidas**, **When** se intenta reasignar, **Then** responde
   **401** sin revelar si la orden existe.
5. **Given** un usuario autenticado con rol **technician o supervisor** (no dispatcher), **When** intenta
   reasignar una orden, **Then** responde **403** (rol no autorizado para la acción) sin efecto.
6. **Given** un dispatcher y un `orderId` que **no existe** o que **no es visible** para el ámbito del
   dispatcher, **When** intenta reasignar, **Then** responde **404** con cuerpo **genérico e indistinguible**
   entre "no existe" y "no visible" (FR-009 de 002b), sin efecto.
7. **Given** un dispatcher y una orden reasignable, **When** el técnico destino **no existe**, **no tiene rol
   technician**, o es **el mismo** que el asignatario actual, **Then** responde **422**
   (`INVALID_ASSIGNEE`) sin efecto.
8. **Given** dos dispatchers que reasignan la **misma** orden concurrentemente con la misma versión esperada
   (la orden sigue reasignable, luego visible para ambos), **When** ambas peticiones se procesan, **Then**
   **exactamente una** tiene éxito (200, `version`+1, 1 auditoría) y la otra falla con **409**
   (`VERSION_CONFLICT`) sin doble auditoría ni asignatario inconsistente. *(Es el único 409 visible al dispatcher.)*
9. **Given** una orden en `in_progress` (reasignable, version=V) que un dispatcher intenta reasignar con
   `expectedVersion=V`, **When** en paralelo **otra parte** ejecuta una **transición real de la FSM**
   (p. ej. un supervisor la lleva a `pending_review`/`closed` vía `applyTransition`, lo que bumpea `version`) y
   gana la carrera, **Then** el UPDATE condicional del dispatcher afecta **0 filas** y, por **precedencia de
   status sobre version** (FR-008), responde **404 genérico** (la orden salió de su ámbito) — **no 409** — sin
   efecto ni auditoría. *(Distingue el caso de S-001/H-006: cambio concurrente de estado ≠ conflicto de versión.)*

---

### User Story 2 - Concurrencia optimista explícita con `If-Match` (Priority: P3, *stretch*)

Un dispatcher que trabaja sobre una vista posiblemente desactualizada envía la versión que cree vigente
(`If-Match: "<version>"`). Si otro dispatcher ya reasignó la orden, la petición se rechaza con **409** en
lugar de pisar el cambio ajeno.

**Why this priority**: refuerzo de robustez (**stretch**, BL-001); no bloquea el gate. La consistencia
*interna* (no lost-update) ya es correctness obligatoria vía el UPDATE condicional (US1 escenario 8); esta US
sólo **expone** el control al cliente. La columna `version` ya existe (base-ready desde 002a).

**Independent Test**: con `If-Match` a una versión obsoleta → 409 `VERSION_CONFLICT` sin efecto; con la versión
correcta → 200. Sin cabecera `If-Match` → comportamiento de US1 (concurrencia interna sigue protegiendo).

**Acceptance Scenarios**:

1. **Given** una orden en version=1, **When** un dispatcher reasigna con `If-Match: "0"` (obsoleta),
   **Then** responde **409** (`VERSION_CONFLICT`) con `ETag` de la versión vigente y **sin** efecto.
2. **Given** una orden en version=1, **When** reasigna con `If-Match: "1"`, **Then** responde **200** y
   `ETag: "2"`.
3. **Given** una orden que ya **salió de ámbito** (transicionada a `closed`/`pending_review`) **y** un
   `If-Match` **también** desactualizado, **When** el dispatcher reasigna, **Then** responde **404** genérico
   (no 409): el chequeo de ámbito/status **precede** al de version también por la vía `If-Match` (cierra S-007,
   coherente con la precedencia de FR-008).

---

### Edge Cases

- **Reasignar al mismo técnico** (destino == asignatario actual) → **422** `INVALID_ASSIGNEE` (no-op explícito
  rechazado; no consume version ni audita).
- **Orden reasignable sin asignatario** (`assigned_to == NULL`): es un **caso real**, no hipotético. El modelo
  de 001/002a define la FK `assigned_to` con `onDelete:SetNull`, por lo que dar de baja (borrar) al `User`
  técnico asignado deja la orden **huérfana** conservando su `status` reasignable (`assigned`/`in_progress`).
  Reasignar una orden huérfana a un técnico válido T2 es una operación **válida y esperada** (es justo el caso
  de uso: el técnico ya no está): el `from_assignee` de la auditoría es **NULL** (por eso las columnas
  `from_assignee`/`to_assignee` son nullable) y `to_assignee=T2`. Cubierto por test de integración con fixture
  de orden huérfana.
- **Técnico destino deshabilitado** (`disabledAt` no nulo, modelado por 001) → **422** `INVALID_ASSIGNEE`
  (no se reasigna a un usuario no operativo).
- **`orderId` de ruta sintácticamente inválido** (no-uuid) → **404** genérico byte-idéntico a "no existe"
  (Clarifications 2026-07-12): un identificador que no puede nombrar ninguna orden es indistinguible de
  inexistente; se valida el uuid antes de la BD (evita P2023→500). 4ª vía de SC-008.
- **`reason` ausente**: en reasignación el motivo es **obligatorio** (trazabilidad del reparto) → sin `reason`
  → **422** `VALIDATION_ERROR`. *(002b hace `reason` opcional a nivel de dominio; la obligatoriedad la impone
  esta feature consumidora, como previó 002b.)*
- **`reason` con PII cruda / demasiado largo**: se valida longitud máxima (contrato) y **nunca** se serializa
  en logs ni en el cuerpo de error (BL-059, FR-008 de 002b heredado por la ruta HTTP real).
- **Error de base de datos distinto de la FK del asignatario** (deadlock, timeout, constraint futura): se
  traduce a **500 genérico** sin filtrar detalle de Postgres (BL-060).
- **Colapso a 404 por no-enumeración**: como la visibilidad del dispatcher es "estado reasignable",
  `ORDER_NOT_REASSIGNABLE` **siempre** colapsa a **404** (la orden no está en su ámbito). `VERSION_CONFLICT` (409)
  e `INVALID_ASSIGNEE`/`VALIDATION_ERROR` (422) sólo se ven cuando la orden **es** reasignable (y por tanto
  visible). El 404 es indistinguible entre inexistente y no-visible en **cuerpo, cabeceras y latencia** (BL-061).

## Requirements *(mandatory)*

### Functional Requirements (EARS)

- **FR-001** *(acción de negocio)*: WHEN un dispatcher autenticado solicita reasignar una orden **reasignable**
  a un técnico destino válido con un motivo, THE sistema SHALL cambiar `assigned_to` al técnico destino,
  **conservar** el `status` (no es una transición de la FSM), incrementar `version` en 1 e insertar un registro
  de auditoría de la reasignación, respondiendo **200** con la orden actualizada y su nueva versión (`ETag`).
- **FR-002** *(estados reasignables — partición explícita, BL-062)*: THE sistema SHALL considerar reasignables
  **exactamente** los estados `assigned` e `in_progress`. La **visibilidad del dispatcher es ese predicado**
  (constitution IV: "ve las reasignables"), por lo que WHEN la orden está en cualquier otro estado
  (`pending_review`, `closed`, `draft`) **no está en su ámbito** y THE sistema SHALL responder **404 genérico
  indistinguible** de inexistente (no 409) sin efecto. El código interno `ORDER_NOT_REASSIGNABLE` es diagnóstico
  y **colapsa a 404** para el dispatcher. *(La reasignación conserva el estado; NO se añaden pares a la tabla de
  transiciones de 002b.)*
- **FR-003** *(RBAC — sólo dispatcher)*: WHEN quien solicita **no está autenticado**, THE sistema SHALL
  responder **401**. WHEN está autenticado pero su rol **no es dispatcher**, THE sistema SHALL responder
  **403** (`FORBIDDEN_ROLE`) sin efecto. La autorización se resuelve en backend (rol del token de 001), nunca
  desde parámetros del cliente.
- **FR-004** *(no-enumeración por construcción — hereda FR-009 de 002b, BL-061; cierra T-002/H-010/S-001)*: THE
  visibilidad del dispatcher se resuelve con **una única consulta** `WHERE id=:orderId AND status IN
  ('assigned','in_progress')`. WHEN esa consulta devuelve **0 filas** —tanto si la orden **no existe** como si
  existe en un estado **no reasignable** (fuera de ámbito)— THE sistema SHALL responder **404** por el **mismo
  camino de código**, con cuerpo **byte-idéntico** (mismo `code` genérico, sin `details`) y **mismas cabeceras**;
  al ser el mismo camino, la latencia es indistinguible **por construcción** (no se requiere umbral numérico ni
  padding). El **orden de comprobación** es: (1) 401 si no autenticado; (2) 403 si rol ≠ dispatcher; (3) **la
  consulta de visibilidad** → 0 filas ⇒ 404; (4) sólo con la orden **visible** se validan destino (422) y
  concurrencia (409). Así el 422/409 **nunca** es alcanzable para una orden no visible (no hay oráculo por
  código HTTP, H-003).
- **FR-005** *(validez del técnico destino — sólo tras pasar la visibilidad de FR-004)*: WHEN el técnico
  destino **no existe**, **no tiene rol technician**, está **deshabilitado** (`disabledAt` no nulo), o
  **coincide** con el asignatario actual, THE sistema SHALL responder **422** (`INVALID_ASSIGNEE`) sin efecto.
  La comparación "coincide con el asignatario actual" se hace contra el `assigned_to` **leído en la consulta de
  visibilidad de FR-004** (la única lectura disponible en este punto del orden de comprobación: la validación de
  destino ocurre **antes** del UPDATE condicional de FR-008, por lo que aún no existe un valor "version-matched"
  —se corrige aquí el desfase temporal H-201). Si entre esa lectura y el commit otra reasignación concurrente
  cambiara el asignatario, la **guarda atómica de FR-008** (`version=expectedVersion`) aborta con **409** sin
  aplicar cambio: la consistencia final la garantiza FR-008, no esta comparación (que es un rechazo temprano
  best-effort del no-op "mismo técnico"). THE cuerpo del 422 SHALL ser **genérico e
  idéntico** para las cuatro causas (mismo `code`/`message`, **sin** `details` que revele cuál falló), para no
  convertir el endpoint en oráculo de enumeración de usuarios/roles/estado (S-003). *(`disabledAt` lo modela
  001; `lockedUntil` es estado de login y NO afecta a la elegibilidad como destino.)* **Residual de timing
  (S-006, MEDIA, documentado)**: la causa "mismo asignatario actual" se resuelve en memoria (O(1)) y las otras
  tres requieren consulta a `User`; la paridad de **cuerpo** está garantizada (arriba), pero la paridad de
  **latencia** entre las 4 causas no se fuerza (mismo tratamiento residual aceptado que BL-061). Mitigación
  completa (igualar el camino de comprobación) queda como deuda **BL-064**.
- **FR-006** *(motivo obligatorio y validado)*: WHEN la petición **no** incluye `reason` válido, THE sistema
  SHALL responder **422** (`VALIDATION_ERROR`). `reason` es **válido** sii, tras `trim()`, su longitud es de
  **1 a 500 puntos de código Unicode** (unidad de conteo: **code points**, no UTF-16 code units — cuenta
  `[...reason].length`, para que un emoji o carácter fuera del BMP cuente como 1) **y** contiene **al menos un
  carácter imprimible** (regex de rechazo: una cadena cuyos caracteres sean **todos** whitespace `\s` o de
  control `\p{Cc}`/`\p{Cf}` es inválida). Es decir, cadena vacía, sólo espacios o **sólo caracteres de control**
  (`\x00`–`\x1F`, etc.) **no** es un motivo válido (no aporta trazabilidad del reparto). El `reason` es **obligatorio** en reasignación (a
  diferencia del opcional de 002b a nivel de dominio). **Residual de PII (S-002, ALTA — heredado)**: `reason` es
  texto libre **operativo** que puede contener PII de cliente; esta feature aplica **defensas de contención** —
  longitud máxima 500, no-fuga por logs/errores (FR-009/SC-006) y guía operativa de "no incluir datos de
  cliente"— pero **no** implementa detección/redacción automática de PII, y el valor persiste **permanentemente**
  en `OrderAudit` (append-only inmutable). Se acepta como **residual documentado heredado**: el procedimiento
  correctivo de purga/anonimización es **BL-055** y el cifrado en reposo de `reason` es **BL-051** (ambos fuera
  de alcance de esta feature, ver Scope/Fuera).
- **FR-007** *(atomicidad + auditoría append-only)*: WHEN la reasignación procede, THE sistema SHALL aplicar en
  **una sola transacción** (todo o nada): (a) `assigned_to`→destino, (b) `version`+1, (c) inserción del
  registro de auditoría de la reasignación. Si cualquier paso falla, la transacción **revierte** por completo
  (la orden no queda reasignada sin su auditoría). La auditoría es **append-only inmutable** (trigger de BD de
  002b) y reutiliza una **primitiva atómica común** de bajo nivel (UPDATE condicional + insert de auditoría en
  la misma transacción) compartida con `applyTransition` (evita divergencia entre las dos rutas, H-008).
  `reassignOrder` reside en el **mismo módulo** que `applyTransition` — directorio `domain/order/write-side/`
  (reconciliación del "único punto de escritura" de `FR-006` de 002b): `status`/`version` sólo se mutan desde
  ese módulo, nunca por un camino ad-hoc. Verificable por **test de arquitectura**: ningún fichero fuera de
  `domain/order/write-side/*` muta `status`/`version` (T-003).
- **FR-008** *(guarda atómica de reasignabilidad — cierra TOCTOU de version/status, BL-056/062)*: THE cambio de
  `assigned_to` SHALL aplicarse mediante un **único UPDATE condicional atómico** cuyo `WHERE` revalida, dentro de
  la misma operación, `id`, `version=expectedVersion` **y** `status ∈ {assigned, in_progress}`. **Origen de
  `expectedVersion`** (H-202): en el **flujo base** (US1, sin `If-Match`) es la `version` **releída por el
  servidor dentro de la misma request** (de la consulta de visibilidad de FR-004), de modo que el UPDATE
  condicional protege contra lost-update en la ventana lectura→escritura interna; con **`If-Match`** (US2/FR-012,
  stretch) es la versión que envía el cliente. En ambos casos el `WHERE` condicional es el árbitro de
  consistencia. Si afecta 0 filas,
  THE sistema re-lee la orden y clasifica la causa en un **orden de evaluación determinista con precedencia de
  status sobre version** (cierra S-001/H-006 — carrera cruzada reasignación↔transición FSM): **(1)** la orden
  **no existe** → **404**; **(2)** la orden existe pero su `status ∉ {assigned, in_progress}` (salió de ámbito,
  p. ej. otra parte la transicionó a `pending_review`/`closed` concurrentemente) → diagnóstico interno
  `ORDER_NOT_REASSIGNABLE` que **colapsa a 404** para el dispatcher (fuera de su ámbito de visibilidad) — **se
  evalúa ANTES que version, y NUNCA se reporta 409 para una orden fuera de ámbito**; **(3)** sólo si la orden
  **sigue siendo reasignable** (`status ∈ {assigned, in_progress}`) pero `version ≠ expectedVersion` → **409**
  `VERSION_CONFLICT` (reasignación concurrente con la orden aún visible). Es decir: 409 es **inalcanzable** salvo
  con status reasignable; ante status fuera de ámbito el resultado es 404 **con independencia** de la version.
  THE guarda de reasignación **NO** exige pertenencia `assigned_to==actor` (el dispatcher no es el asignatario);
  esta feature **declara explícitamente** que su única guarda atómica es (status reasignable ∧ version) evaluada
  en ese orden — la partición queda cubierta sin predicados sin clasificar (BL-062).
  **Residual TOCTOU de destino (H-004, best-effort documentado)**: la validez del técnico destino (FR-005:
  existencia/rol/`disabledAt`) se comprueba **fuera** de este UPDATE condicional (que sólo revalida id/status/
  version, no `disabledAt` del destino). Existe por tanto una ventana en la que el destino podría deshabilitarse
  entre la validación de FR-005 y el commit; se acepta como **residual best-effort documentado** (baja
  probabilidad, sin impacto de integridad de la orden; el destino inválido no rompe la FSM). La mitigación
  completa (revalidar `disabledAt` del destino dentro de la transacción) queda como deuda **BL-063**.
- **FR-009** *(no-fuga de `reason` por la ruta HTTP real, BL-059 — ALTA)*: THE sistema SHALL garantizar que el
  valor de `reason` **no aparece** en ningún log emitido por la **ruta HTTP real** (middleware, handler,
  logger de request/response, manejadores de error) ni en el cuerpo de error serializado. El `pino redact` con
  comodín cubre un solo nivel; THE configuración SHALL ampliar las rutas de redacción para cubrir el `reason`
  **anidado** en el payload de la request (p. ej. cuerpo de la request y `error.cause`). Verificable forzando
  un `reason` centinela por el endpoint y haciendo grep negativo sobre los logs y sobre la respuesta de error.
- **FR-010** *(saneo de errores de BD — catch-all, BL-060)*: WHEN se produce un error de base de datos que
  **no** sea la violación de FK del asignatario (deadlock, timeout, validación de UUID, constraint futura),
  THE sistema SHALL responder **500** con un cuerpo **genérico** `{code, message, agent_action}` **sin**
  filtrar detalle de Postgres (SQLSTATE, nombres de columna/constraint, fragmento de query). Un manejador de
  nivel superior convierte cualquier error no controlado en 500 genérico.
- **FR-011** *(actor infalsificable, BL-056)*: THE `actor_id` de la auditoría SHALL derivarse **exclusivamente**
  del contexto de autenticación verificado server-side (el `userId` del token de 001), **NUNCA** de un
  parámetro de la request. El contexto de actor se pasa como **objeto de actor autenticado tipado** (no
  `string` plano) a la maquinaria de dominio.
- **FR-012** *(concurrencia optimista explícita — stretch, BL-001)*: WHEN la petición incluye `If-Match:
  "<version>"` y la versión no coincide con la vigente, THE sistema SHALL responder **409**
  (`VERSION_CONFLICT`) con el `ETag` de la versión vigente y sin efecto; con versión coincidente → 200 y
  `ETag` de la nueva versión. **El `If-Match` NO altera la precedencia de FR-008**: si la orden salió de ámbito
  (status no reasignable), THE sistema responde **404** aunque el `If-Match` esté también desactualizado (el
  chequeo de ámbito/status precede al de version por ambas vías, cerrando el oráculo S-005). *(Stretch; no
  bloquea gate. Sin `If-Match`, la concurrencia interna de FR-008 sigue protegiendo contra lost-update.)*

*Contrato de errores uniforme (Constitution): todo error responde `{code, message, details?, agent_action}`
con el HTTP correcto; `reason` y detalle de Postgres nunca aparecen en `details`/`agent_action`/mensaje.*

### Key Entities *(include if feature involves data)*

- **Order** (existente, 002a/002b): se muta `assigned_to` (FK→User, técnico) y `version`; `status` se
  **conserva**. Estados reasignables: `assigned`, `in_progress`.
- **OrderAudit** (existente, 002b — append-only inmutable): se **extiende** para registrar la reasignación.
  Esquema actual `{id, order_id, actor_id, from_status, to_status, reason, at}`; se **añaden** (migración,
  append de columnas conservando el trigger append-only): `from_assignee`/`to_assignee` (FK→User, nullable) y
  `event_type` (`transition` | `reassignment`). En una reasignación `from_status == to_status` y el par
  origen→destino vive en `from_assignee`/`to_assignee`. Rastro inmutable de quién/cuándo/por qué/origen→destino.
  **Estrategia de migración (H-007)**: `event_type` se crea con **`DEFAULT 'transition'`** y se hace **backfill**
  de las filas de auditoría preexistentes de 002b a `'transition'` (todas eran transiciones FSM); `from_assignee`/
  `to_assignee` quedan **NULL** en esas filas legacy y en las futuras de `applyTransition` (una transición FSM no
  registra par de asignatarios — se interpreta como "no aplica", nunca como reasignación). `applyTransition`
  **no cambia** su comportamiento (no viola XV): sigue escribiendo `event_type='transition'` (vía el default) con
  par de asignatarios NULL. Sólo `reassignOrder` escribe `event_type='reassignment'` con el par no-NULL.
- **User** (existente, 001): el técnico destino debe existir y tener rol **technician**; el actor debe ser
  **dispatcher**.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001** *(happy path completo)*: el 100% de las reasignaciones válidas (dispatcher + orden reasignable +
  técnico destino válido + motivo) responden **200**, cambian `assigned_to`, conservan `status`, incrementan
  `version` en 1 y crean **exactamente 1** registro de auditoría con origen→destino correctos.
- **SC-002** *(matriz RBAC completa)*: el 100% de los casos de autorización responden el código correcto: sin
  auth → **401**; rol ≠ dispatcher → **403**; orden inexistente o no visible para el dispatcher → **404**
  indistinguible; sin efecto en todos los rechazos.
- **SC-003** *(estados no reasignables)*: el 100% de los intentos de un dispatcher sobre `pending_review`/
  `closed`/`draft` responden **404 genérico indistinguible** de inexistente (fuera de su ámbito), sin efecto.
- **SC-004** *(concurrencia — no lost-update, y precedencia status>version)*: **(a)** dadas **N** reasignaciones
  concurrentes sobre la misma orden con la misma versión esperada, **exactamente una** tiene éxito (`version`+1,
  **1** auditoría) y el resto → **409** `VERSION_CONFLICT`; verificado con `Promise.all` + un caso secuencial
  determinista. **(b)** carrera **cruzada** reasignación↔transición-FSM: cuando una transición real (vía
  `applyTransition`) saca la orden de ámbito reasignable antes del UPDATE del dispatcher, éste responde **404**
  (no 409), verificando la precedencia de status sobre version de FR-008 (cierra S-001/H-006).
- **SC-005** *(técnico destino inválido)*: el 100% de los destinos inválidos (inexistente / no-technician /
  deshabilitado `disabledAt≠null` / igual al actual) responden **422** `INVALID_ASSIGNEE` sin efecto.
- **SC-006** *(no-fuga de `reason` por la ruta HTTP real — BL-059)*: WHEN se envía una reasignación con un
  `reason` centinela único a través del endpoint, THE valor **no aparece** en ningún log de la ruta HTTP
  (request/response/error) ni en el cuerpo de la respuesta de error. Verificado por grep negativo sobre logs
  capturados y sobre el body de error, incluyendo un caso que fuerza un error tras aceptar el payload.
- **SC-007** *(saneo de errores de BD — BL-060)*: WHEN se fuerza un error de BD ≠ FK-asignatario, THE respuesta
  es **500** con cuerpo genérico y **no** contiene SQLSTATE, nombre de constraint/columna ni fragmento de
  query (grep negativo).
- **SC-008** *(indistinguibilidad del 404 por construcción — BL-061)*: las **cuatro** vías que producen 404
  —"no existe", "no visible/estado no reasignable" (misma consulta de FR-004), el colapso post-UPDATE de FR-008
  (status salió de ámbito entre lectura y escritura) y **`orderId` sintácticamente inválido (no-uuid)**—
  responden por el **mismo camino de código** y son **byte-idénticas** en `status`, cuerpo (mismo `code`
  genérico, sin `details`) y cabeceras. Verificación: **cuatro** peticiones —(a) orden inexistente,
  (b) orden existente-no-reasignable, (c) colapso post-UPDATE de FR-008 (escenario 9), (d) `orderId` malformado
  (no-uuid)— producen respuestas cuyo cuerpo y cabeceras relevantes son **iguales byte a byte entre las cuatro**
  (aserción de igualdad estricta en test, incluida la 4ª vía). Al ser el mismo camino, **no se mide ni se fija
  umbral de latencia** (indistinguibilidad por construcción, no estadística); se elimina cualquier escape
  "documentado/mitigado".
- **SC-009** *(atomicidad real, sin mockear ORM)*: WHEN se fuerza el fallo de la inserción de auditoría (p. ej.
  actor/asignatario que viola FK dentro de la transacción), THE orden **no** queda reasignada (assigned_to,
  status, version intactos; 0 filas de auditoría) y el mensaje crudo de Postgres **no** se propaga.
- **SC-010** *(latencia)*: medido sobre **50 peticiones secuenciales** de reasignación (happy path) contra la
  **BD de test local caliente** (tras un warm-up que descarta la primera petición de cold-start), el **p95**
  responde en **< 300 ms** (NFR "rápido" cuantificado); correlation-ID presente en la respuesta y en los logs.

> Cada SC es **medible** (Constitution XIV) y se verifica con **Vitest + Supertest** contra Postgres real
> (dominio puro + integración HTTP). Esta feature no tiene componente IA → sin eval de promptfoo (verificación
> determinista por tests; convención BL-058).

## Contrato (OpenAPI) *(obligatorio — Constitution II)*

Contract-first: el contrato se escribe/actualiza **antes** del código y es la única fuente de verdad; el
esquema Zod se deriva de él.

- **Fichero de contrato**: se **extiende** el contrato de órdenes existente (002a) con la operación de
  reasignación (nombre de fichero definitivo confirmable en plan).
- **Endpoint** (operationId → método ruta → roles → respuestas):
  - `reassignOrder` — `POST /v1/orders/{orderId}/reassignments` — rol `dispatcher` —
    respuestas: `200` (orden actualizada + `ETag`), `401`, `403`, `404` (genérico: inexistente / no visible /
    estado no reasignable), `409` (`VERSION_CONFLICT` — **único** 409 visible al dispatcher),
    `422` (`INVALID_ASSIGNEE` | `VALIDATION_ERROR`), `500`. Cabecera opcional `If-Match` (stretch); `ETag`.
    *(Método/ruta a confirmar en plan: `POST …/reassignments` (sub-recurso de evento) vs `PATCH …/assignee`.)*
- **Esquemas** clave: cuerpo `{ assignee_id (uuid), reason (string, 1..N) }`; respuesta con `status` (enum),
  `assigned_to`, `version`. Boundary `snake_case` externo / `camelCase` interno.
- **Errores** con `{ code, message, details?, agent_action }` y HTTP correcto; `reason`/detalle de BD nunca
  presentes en el cuerpo de error.

## Trazabilidad (RF → endpoint → tarea → test) *(obligatorio — Constitution VI)*

| FR | Endpoint(s) | Tarea(s) | Test(s) |
|----|-------------|----------|---------|
| FR-001 | `reassignOrder` | TBD (`/speckit-tasks`) | `should reassign to new technician, keep status, bump version and audit` |
| FR-002 | `reassignOrder` | TBD | `should collapse non-reassignable status to generic 404 (no 409)` |
| FR-003 | `reassignOrder` | TBD | `should return 401 unauth / 403 non-dispatcher` |
| FR-004 | `reassignOrder` | TBD | `should return generic 404 for missing and not-visible (body+headers)` |
| FR-005 | `reassignOrder` | TBD | `should return 422 for invalid/duplicate/non-technician assignee` |
| FR-006 | `reassignOrder` | TBD | `should return 422 when reason missing/empty/whitespace-only/control-only or >500 code points` |
| FR-007 | `reassignOrder` | TBD | `should be atomic: no reassignment without its audit row` + `should confine status/version writes to write-side/ module (arch test)` |
| FR-008 | `reassignOrder` | TBD | `should classify 0-row update deterministically` + `should return 404 (not 409) when status left scope concurrently (status>version precedence)` |
| FR-009 | `reassignOrder` | TBD | `should never log reason via the real HTTP path (sentinel grep)` |
| FR-010 | `reassignOrder` | TBD | `should map non-FK DB errors to generic 500 (no Postgres detail)` |
| FR-011 | `reassignOrder` | TBD | `should derive actor from token, never from request param` |
| FR-012 | `reassignOrder` | TBD | `should honor If-Match: 409 on stale, 200 on match (stretch)` + `should return 404 (not 409) when out-of-scope AND If-Match stale (precedence, stretch)` |
| Migración (OrderAudit) | — | TBD | `should backfill legacy audit rows to event_type=transition with null assignees` |

> Se mantiene sincronizada en `docs/traceability.md`. Un FR sin test no está "hecho".

## Assumptions

- **Semántica de la reasignación (resuelta en Clarifications)**: la reasignación **cambia `assigned_to`
  conservando el `status`** (assigned→assigned, in_progress→in_progress). **No** es una transición de la FSM de
  002b; es una mutación de asignatario que **reutiliza el patrón atómico** (UPDATE condicional + `version`+1 +
  auditoría append-only) mediante un **caso de uso propio** (`reassignOrder`) en el **mismo módulo write-side**
  que `applyTransition` (reconciliación de FR-006 de 002b). NO se extiende la FSM (contra XV).
- **Estados reasignables = `assigned` + `in_progress`** (roadmap). Reasignar una orden `in_progress` **no**
  reinicia el trabajo ni el estado; sólo cambia el técnico responsable (resuelto en Clarifications: conserva estado).
- **Visibilidad del dispatcher por ámbito de rol** (no por `assigned_to`): el dispatcher ve las órdenes
  reasignables de su ámbito (definición heredada del RBAC de 001). Por eso el `GUARD_UNMET` de pertenencia
  **no aplica** aquí; la guarda atómica es (version ∧ status reasignable), y el 404 por no-visible se rige por
  ámbito de rol (coherente con FR-009 de 002b, regla rol-scoped).
- **Técnico destino** (resuelto en Clarifications): debe **existir**, tener rol `technician`, estar **activo**
  (`disabledAt IS NULL`, campo modelado por 001) y ser **distinto** del asignatario actual; si no → 422
  `INVALID_ASSIGNEE`. `lockedUntil` (login) no afecta a la elegibilidad como destino.
- **`reason` obligatorio en reasignación** (trazabilidad del reparto), **pre-saneado** por esta feature antes
  de invocar la maquinaria de 002b (precondición de 002b: sin PII cruda), con longitud máxima del contrato.
- **Modelado de la reasignación en `OrderAudit`** (resuelto en Clarifications): se **extiende** el esquema con
  `from_assignee`/`to_assignee` (FK→User, nullable) y `event_type` (`transition`|`reassignment`); reasignación
  ⇒ `from_status==to_status`. Migración que **añade** columnas y **conserva** el trigger append-only de 002b.
- **Deuda de 002b saldada aquí** (punto natural, roadmap): BL-059 (redacción de `reason` por la ruta HTTP
  real → FR-009/SC-006), BL-056 (actor tipado + guarda atómica declarada → FR-008/FR-011), BL-062 (partición
  completa de la guarda → FR-002/FR-008), BL-061 (404 indistinguible en cabeceras/latencia → FR-004/SC-008),
  BL-060 (catch-all de errores de BD → FR-010/SC-007). Se **declaran en la spec** y se **fuerzan en los gates**.
- **Idempotency-key diferida** (Constitution X pide clave de idempotencia en operaciones que cambian estado):
  se difiere como **stretch** junto a `If-Match` (BL-001); la consistencia obligatoria (no lost-update) la
  cubre el UPDATE condicional de FR-008. Desviación **ya reconciliada** en gobernanza (BL-050), no nueva.
- **Reconciliación FR-006 de 002b**: el "único punto de escritura" de `status`/`version` pasa de "sólo
  `applyTransition`" a "sólo el módulo write-side `domain/order/write-side/` (`applyTransition` +
  `reassignOrder`)". Este gate (G1 re-entrada) **es** el punto que lo reclama, así que se registra **ahora**
  como ítem de gobernanza **BL-065** (nota/ADR de reconciliación del invariante) — fuente de verdad única para
  las features 005/006. No se re-escribe la spec de 002b (ya mergeada); la reconciliación vive en gobernanza y
  se verifica con el test de arquitectura de FR-007.
- **Reutiliza**: RBAC/401-403/rbacProbe y contrato de errores de **001**; `Order`/`version` de **002a**;
  `applyTransition`/patrón atómico/`OrderAudit`/trigger append-only/FR-009 no-enumeración de **002b**.
- **Sin API de pago**: verificación 100% determinista (Vitest + Supertest + Postgres docker-compose de test);
  sin componente IA → sin eval de promptfoo.

## Scope

**Dentro**: endpoint HTTP de reasignación (`reassignOrder`) bajo `/v1` con contrato OpenAPI 3.1 + Zod; RBAC
dispatcher-only (401/403/404/409/422/500); mutación atómica de `assigned_to` conservando estado, con `version`+1
y auditoría append-only atómica; validación de técnico destino; motivo obligatorio y saneado; no-enumeración
(cuerpo+cabeceras+latencia); catch-all de errores de BD; actor server-side tipado; correlation-ID; latencia
cuantificada. Concurrencia optimista `If-Match`→409 como **stretch**.

**Fuera** (otras features / backlog): creación/alta inicial de órdenes (fuera del proyecto), iniciar
trabajo/registrar ejecución con evidencia (roadmap 004), aprobar/rechazar en revisión (roadmap 005), resumen
IA, notificaciones al técnico reasignado, auditoría forense de accesos denegados (BL-002), cifrado en reposo
de `reason` (BL-051), idempotency-key (parte de BL-001; sólo If-Match aquí como stretch).
