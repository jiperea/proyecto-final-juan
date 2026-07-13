# Feature Specification: Revisión por el supervisor

**Feature Branch**: `006-revision-supervisor`

**Created**: 2026-07-13

**Status**: Draft

**Input**: Brief Func #3 — "Revisión por parte del supervisor: aprobar o rechazar el trabajo registrado".
Roadmap #005 (rama física `006-revision-supervisor`). Un **supervisor** revisa una orden en `pending_review`
y la **aprueba** (`pending_review→closed`) o la **rechaza** (`pending_review→in_progress`) con **motivo
obligatorio**. La evidencia y las notas de ejecución registradas en **005** se **conservan intactas** en
ambos casos. Reutiliza el auth/RBAC de **001** y el patrón atómico + `OrderAudit` de **002b/003**
(inamovibles). La transición `pending_review→closed` la introduce esta feature; `pending_review→in_progress`
(rechazo) ya es legal en la FSM de 002b.

> **Alcance MVP (Constitution XV — specs pequeñas)**: sólo las **dos decisiones del supervisor** (write-side)
> sobre una orden ya en `pending_review`. **No** incluye:
> - **Lectura de detalle de orden** (notas + metadatos de evidencia para el supervisor; motivo del rechazo para
>   el technician): es una **feature read-side aparte** (ya implícita en FE-1 "detalle solo-lectura"). 006 **no**
>   expone endpoint de lectura nuevo. **Deuda trazada** como prerequisito de FE-1/FE-4; el que el technician lea
>   el motivo de su propio rechazo exige **enmienda de Constitution XI** (hoy la lectura de `OrderAudit.reason`
>   se restringe a supervisor/auditor) — se difiere, no se fuerza desde esta feature.
> - Subida/lectura del **binario** de evidencia (#007); **resumen IA** de la incidencia (#006-roadmap);
>   concurrencia optimista `If-Match`→409 (stretch #008); tope al ciclo `pending_review↔in_progress` (fuera en
>   002b); **auditoría forense de accesos denegados** (401/403/404) → diferida a **#009** (BL-002/067), como 005.
>
> Foco único → una feature pequeña y demostrable end-to-end vía API (la transición + auditoría son observables
> sin necesidad del read-side).

## Clarifications

### Session 2026-07-13

- Q: ¿Dónde se almacena el motivo del rechazo (texto libre del supervisor)? → A: en **`OrderAudit.reason`**,
  **pre-saneado por 006** (patrón de 003 FR-008: el llamador sanea; `reason` fue diseñado para el motivo de la
  transición). **No** se crea entidad separada — a diferencia de las *notas de ejecución* de 005
  (`OrderExecutionNotes`), el motivo de rechazo **es** el motivo de la transición. El **cifrado en reposo** de
  `OrderAudit.reason` queda **diferido a BL-051** (infra, transversal a 002b/003/004/005/006). El motivo nunca
  aparece en logs ni en cuerpos de error (grep negativo, SC-005).
- Q: ¿Orden de precedencia cuando fallan varias condiciones a la vez? → A: **`401` → `403` → `422` → `404`**
  (payload antes que recurso, igual que 005): el `422` de motivo inválido se evalúa **antes** que el `404` de
  orden no visible, porque el 422 de payload no correlaciona con el recurso (no filtra existencia).
- Q: ¿Umbral de latencia p95 de la decisión? → A: **p95 < 300 ms**, misma metodología que 005 SC-009 (50
  peticiones secuenciales, nearest-rank, BD de test caliente, warm-up descartado).
- Q: ¿Cota de longitud del motivo de rechazo? → A: **1–1000 caracteres** (no vacío tras saneo, `≤ 1000`);
  fuera de rango → `422 INVALID_REASON`.

### Session 2026-07-13 — remediación gate G1

> Decisiones que resuelven los hallazgos del panel G1 (informe en
> `gates/gate-G1-006-revision-supervisor.json` + propuestas del `remediador`).

- Q: **(B1)** ¿Cómo se valida el motivo en la **aprobación**? → A: **opcional**; si el campo `reason` está
  **presente** en el body se valida **idéntico** al rechazo (saneo, 1–1000 → `422 INVALID_REASON`); si está
  **ausente/`null`**, aprueba sin motivo (`OrderAudit.reason = NULL`). En FR-009 el `422` de motivo se evalúa en
  la **misma** posición (tras `403`, antes de `404`): en rechazo **siempre**, en aprobación **sólo si `reason`
  presente**.
- Q: **(B2)** ¿006 expone la **lectura** de los insumos de revisión (notas + metadatos de evidencia para el
  supervisor; motivo del rechazo para el técnico)? → A: **No — fuera de 006** (feature *write-only*). La lectura
  de detalle de orden es una feature **read-side aparte** (ya implícita en FE-1 "detalle solo-lectura"); 006 no
  crea endpoint de lectura nuevo. Se **traza como deuda** prerequisito de FE-1/FE-4, y el gap de que el
  **technician** necesita leer el motivo de su rechazo (hoy Constitution XI restringe la lectura de
  `OrderAudit.reason` a supervisor/auditor) se marca como **enmienda futura de Constitution XI** — no se fuerza
  desde esta feature.
- Q: **(A1)** ¿Definición exacta de "saneo" / "vacío tras saneo"? → A: `sanitizeReason()` = (1) `trim()`; (2)
  colapso de espacios en blanco internos repetidos a uno; (3) eliminación de caracteres de control Unicode
  (categoría Cc: `U+0000`–`U+001F`, `U+007F`) salvo `\n`; (4) normalización Unicode NFC. **"Vacío tras saneo"** =
  longitud 0 tras (1)-(4). No hay sanitización de markup (el motivo se persiste/muestra siempre como texto
  plano). Definición **local a 006**; retro-alinear 003/004/005 = deuda no bloqueante.
- Q: **(A2)** ¿`decision` ausente/fuera de enum/body no-JSON? → A: `422 VALIDATION_ERROR`, evaluado **antes** que
  `INVALID_REASON` (sin `decision` válida no se sabe si el motivo es obligatorio). Nuevo **FR-011**.
- Q: **(A3)** ¿006 usa la columna `attempt` de 005? → A: **No** — 006 no lee ni incrementa `attempt`; el
  versionado por intento (si se implementa) es de **005** al reenviar tras rechazo, o carve-out de **#008**.
- Q: **(M1)** ¿Error de escritura que no sea "BD no disponible"? → A: `500` genérico (`ACTOR_INVALID`,
  constraint inesperada — mapeo de 003 FR-009); `503` **sólo** para BD no disponible.
- Q: **(M2)** ¿Por qué `404` y no `403` para orden en estado ≠ `pending_review`? → A: la visibilidad del
  supervisor es **state-scoped** a `pending_review` (`listOrders`); una orden en otro estado **no es visible** →
  regla **(a) 404** de 003 FR-009. La regla **(b) 403** aplica a guardas de **pertenencia** sobre recursos
  visibles, no al filtro de estado que define la visibilidad del supervisor.
- Q: **(M3)** ¿Origen del `actor` de la auditoría? → A: **exclusivamente** del JWT verificado server-side, nunca
  del body/params (como 005 FR-007). Nuevo **FR-012** + test.
- Q: **(M4)** ¿Auditoría forense de accesos denegados (401/403/404)? → A: **diferida a #009** (BL-002/067),
  igual que 005.
- Q: **(M5)** ¿Segregación de funciones? → A: se asume **unicidad de rol operativo por usuario** en el MVP; SoD
  formal = backlog (fuera de 006).
- Q: **(M6)** ¿La aprobación re-valida evidencia? → A: **sí, guard defensivo fail-closed** — antes de aprobar
  verifica `COUNT(OrderEvidence) ≥ 1`; si la invariante de 005 no se cumple, no aprueba →
  **`409 CONFLICT EVIDENCE_REQUIRED`** (ronda 2 de remediación G1; ver **FR-013**).
- Q: **(M7)** ¿Visibilidad del nº de rechazos? → A: observable contando `OrderAudit {from:pending_review,
  to:in_progress}` de la orden (sin columna nueva); tope duro = backlog.
- Q: **(M8)** ¿Interacción con la reasignación (004)? → A: **ninguna** — `reassignOrder` sólo opera sobre
  `assigned`/`in_progress`, nunca sobre `pending_review`; no hay carrera posible.
- Q: **(L1)** ¿Cómo se mide SC-006? → A: p95 < 300 ms **por separado** para `approve` (sin motivo) y `reject`
  (motivo hasta 1000 chars); ambos caminos cumplen el umbral de forma independiente.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Aprobar una orden revisada (Priority: P1)

Un supervisor abre una orden que está en `pending_review` (registrada por el técnico en 005) y, tras
revisar el trabajo, la **aprueba**. La orden pasa a `closed` (cerrada) y queda constancia de quién y cuándo
aprobó. La evidencia y las notas del técnico permanecen accesibles e inalteradas.

**Why this priority**: Es el cierre del ciclo de vida de la orden y la razón de ser del rol supervisor;
sin aprobación el trabajo del técnico nunca se completa. Entrega valor por sí sola.

**Independent Test**: Con una orden semilla en `pending_review`, un supervisor la aprueba y se verifica que
queda en `closed`, con un registro de auditoría de la transición y sin pérdida de evidencia/notas.

**Acceptance Scenarios**:

1. **Given** una orden en `pending_review` y un supervisor autenticado, **When** la aprueba, **Then** la orden
   queda en `closed` con `version+1` **y** existe un registro `OrderAudit {from:pending_review, to:closed,
   actor:supervisor, at}` creado en la **misma transacción**.
2. **Given** una orden aprobada (ahora `closed`), **When** se consulta su evidencia y notas de ejecución,
   **Then** siguen presentes e inalteradas (la aprobación no borra ni modifica evidencia/notas).
3. **Given** una orden ya en `closed`, **When** un supervisor intenta aprobarla de nuevo, **Then** se rechaza
   (no visible / estado no legal) sin efecto sobre la orden ni la auditoría.

---

### User Story 2 - Rechazar con motivo y devolver al técnico (Priority: P1)

Un supervisor que detecta trabajo incompleto o incorrecto **rechaza** la orden aportando un **motivo
obligatorio**. La orden vuelve a `in_progress` para que el técnico la corrija; la evidencia y notas previas
se conservan, y el motivo del rechazo queda registrado.

**Why this priority**: El rechazo con motivo es la otra mitad de la decisión de revisión y el mecanismo que
cierra el bucle de calidad (Brief Func #3). Igual de crítico que aprobar.

**Independent Test**: Con una orden en `pending_review`, un supervisor la rechaza con un motivo válido y se
verifica que queda en `in_progress`, con auditoría del rechazo (incluido el motivo) y evidencia conservada;
rechazar sin motivo falla con 422.

**Acceptance Scenarios**:

1. **Given** una orden en `pending_review`, **When** el supervisor la rechaza con un motivo válido, **Then** la
   orden queda en `in_progress` con `version+1` **y** existe auditoría del rechazo con el motivo, en la misma
   transacción.
2. **Given** una orden en `pending_review`, **When** el supervisor intenta rechazarla **sin** motivo (o con
   motivo vacío/fuera de límites), **Then** se responde `422` con `{code, message, details, agent_action}` y la
   orden **no** cambia de estado.
3. **Given** una orden rechazada (ahora `in_progress`), **When** el técnico la vuelve a registrar vía 005
   (`submitOrderExecution`, que impone sus propias reglas de evidencia) y el supervisor la revisa de nuevo,
   **Then** a nivel de FSM el ciclo `pending_review↔in_progress` se puede repetir (sin tope en este MVP). 006 no
   evalúa la "novedad" de la evidencia del reenvío (eso es de 005); sólo ve el estado resultante `pending_review`.

---

### User Story 3 - Sólo el supervisor revisa, y sólo lo que está en revisión (Priority: P2)

El acceso a la decisión de revisión está restringido: sólo el rol **supervisor** puede aprobar/rechazar, y
sólo sobre órdenes que están efectivamente en `pending_review`. Cualquier otro caso se rechaza de forma
uniforme y sin filtrar información del recurso.

**Why this priority**: Es la garantía de control de acceso e integridad de la FSM; protege contra escalada de
privilegios y transiciones indebidas. Se apoya en el RBAC de 001 y la no-enumeración de 002b/005.

**Independent Test**: Con la misma orden en `pending_review`, un technician y un dispatcher reciben `403`; un
supervisor sobre una orden inexistente o en estado distinto de `pending_review` recibe `404` genérico.

**Acceptance Scenarios**:

1. **Given** un usuario no autenticado, **When** intenta revisar, **Then** `401` uniforme.
2. **Given** un technician o dispatcher autenticado, **When** intenta aprobar/rechazar, **Then** `403`
   (`FORBIDDEN_ROLE`) sin efecto.
3. **Given** un supervisor y una orden inexistente, ajena al alcance o en un estado distinto de
   `pending_review`, **When** intenta revisar, **Then** `404` genérico e indistinguible (no-enumeración).

---

### Edge Cases

- **Orden no en `pending_review`** (p. ej. `assigned`, `in_progress`, `closed`): fuera del alcance visible del
  supervisor → `404` genérico (mismo cuerpo que "inexistente"; no revela el estado real). Precede a cualquier
  comprobación de estado (no-enumeración; hereda `GUARD_UNMET→404` de 002b).
- **`orderId` malformado**: `404` genérico (no `400`/`422` distinguible del recurso), coherente con 005.
- **Rechazo sin motivo / motivo vacío tras saneo / motivo fuera de 1–1000**: `422` `INVALID_REASON` sin efecto.
- **Aprobación con motivo**: el motivo es **opcional** al aprobar. Si `reason` está **presente** en el body, se
  valida **idéntico** al rechazo (saneo + 1–1000 → `422 INVALID_REASON` si no cumple); si está **ausente/`null`**,
  aprueba sin motivo (`OrderAudit.reason = NULL`). Mismo tratamiento de saneo/PII (FR-008).
- **`decision` ausente / fuera del enum `{approve, reject}` / body no-JSON o malformado**: `422`
  `VALIDATION_ERROR` sin efecto, evaluado **antes** que `INVALID_REASON` (FR-011).
- **Doble decisión / carrera entre supervisores**: la primera transición gana; la segunda encuentra la orden
  fuera de `pending_review` → `404`. La concurrencia optimista explícita (`If-Match`→409) es **stretch #008**,
  fuera de este MVP.
- **Sin interacción con la reasignación (004)**: `reassignOrder` sólo opera sobre `assigned`/`in_progress`,
  nunca sobre `pending_review`; no existe carrera posible entre reasignación y decisión de revisión.
- **Aprobación sobre orden sin evidencia** (invariante de 005 rota por bug/migración): el guard defensivo
  fail-closed (FR-013) **no** la aprueba → `409 EVIDENCE_REQUIRED`.
- **Error de escritura no transitorio** (`ACTOR_INVALID`, constraint inesperada): `500` genérico (no `503`).
- **BD no disponible**: `503` fail-closed (nunca aplica media transición ni deja auditoría huérfana).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001** (aprobar): WHEN un supervisor autenticado aprueba una orden que está en `pending_review` THE
  sistema SHALL transicionarla a `closed` con `version+1` y responder `200` con la orden actualizada.
- **FR-002** (rechazar): WHEN un supervisor autenticado rechaza una orden que está en `pending_review` con un
  **motivo válido** THE sistema SHALL transicionarla a `in_progress` con `version+1` y responder `200`.
- **FR-003** (motivo obligatorio en rechazo): WHEN un rechazo llega sin motivo, con motivo **vacío tras saneo**,
  o con motivo de longitud fuera del rango **1–1000 caracteres** (medida **tras saneo**) THE sistema SHALL
  rechazarlo con `422` `INVALID_REASON` y `{code, message, details, agent_action}`, **sin** cambiar el estado de
  la orden.
  - **Saneo (`sanitizeReason`, determinista, aplicable a rechazo y aprobación)**: (1) `trim()`; (2) colapso de
    espacios en blanco internos repetidos a uno; (3) eliminación de caracteres de control Unicode (categoría Cc:
    `U+0000`–`U+001F`, `U+007F`) salvo `\n`; (4) normalización Unicode NFC. **"Vacío tras saneo"** = longitud 0
    tras (1)-(4). No hay sanitización de markup (el motivo se persiste y se muestra siempre como texto plano).
    Definición local a 006; retro-alinear 003/004/005 = deuda no bloqueante.
- **FR-004** (atomicidad + auditoría): WHEN una decisión de revisión se aplica con éxito THE sistema SHALL
  escribir la transición y su registro `OrderAudit` (`{from, to, actor, reason?, at}`) en **una única
  transacción** (todo o nada); si la persistencia falla, SHALL no dejar cambio de estado ni auditoría parcial.
- **FR-005** (conservación de evidencia/notas): WHILE se procesa una aprobación o un rechazo THE sistema SHALL
  conservar intactas la evidencia y las notas de ejecución registradas en 005 (no las borra ni modifica).
- **FR-006** (RBAC de rol): WHEN un usuario con rol distinto de supervisor intenta revisar THE sistema SHALL
  responder `403` `FORBIDDEN_ROLE` (o `401` si no autenticado), sin efecto y sin filtrar el recurso.
- **FR-007** (no-enumeración / estado): WHEN un supervisor apunta a una orden inexistente, con `orderId`
  malformado, o en un estado distinto de `pending_review` THE sistema SHALL responder `404` genérico e
  indistinguible, evaluando la **visibilidad (`pending_review`) antes que cualquier otra cosa** del recurso.
  Aplica la **regla (a) → 404** de 003 FR-009 y **no** la (b) → 403: la visibilidad del supervisor es
  **state-scoped** a `pending_review` (`listOrders`), de modo que una orden en otro estado **no es visible** para
  él (recurso no visible). La regla (b)/403 de 003 aplica a guardas de **pertenencia** sobre recursos que sí son
  visibles, no al filtro de estado que define la visibilidad del supervisor.
- **FR-008** (tratamiento del motivo — PII): WHEN se registra el motivo de un rechazo (**obligatorio**) o de una
  aprobación (**opcional, sólo si `reason` presente**) THE sistema SHALL guardarlo **pre-saneado**
  (`sanitizeReason`, FR-003) en `OrderAudit.reason`, acotado a 1–1000 caracteres, y **nunca** exponerlo en logs
  ni en cuerpos de error. El tratamiento de saneo/validación/PII es **idéntico** en aprobación y rechazo; sólo
  difiere la **obligatoriedad de la presencia** del campo. El **cifrado en reposo** de `OrderAudit.reason` es
  **BL-051** (diferido, infra transversal), no se implementa en 006. No se crea entidad separada para el motivo.
- **FR-009** (precedencia determinista de errores): WHEN una petición de revisión incumple varias condiciones a
  la vez THE sistema SHALL aplicar el orden único **`401` (no autenticado) → `403` (rol ≠ supervisor) → `422
  VALIDATION_ERROR` (`decision` ausente/inválida o body malformado, FR-011) → `422 INVALID_REASON` (motivo
  inválido: en rechazo **siempre**, en aprobación **sólo si `reason` presente**) → `404` (orden no visible en
  `pending_review`) → `409` (`EVIDENCE_REQUIRED`, guard de evidencia en aprobación, FR-013)**.
  `VALIDATION_ERROR` precede a `INVALID_REASON` porque sin una `decision` válida no se puede determinar si el
  motivo es obligatorio. El payload se valida antes que el recurso porque no correlaciona con la existencia de la
  orden (coherente con 005). El `409` va al final: sólo se evalúa sobre una orden ya resuelta como visible.
- **FR-010** (fallo de persistencia): WHEN la base de datos **no está disponible** (conexión caída/timeout de
  pool) THE sistema SHALL responder `503` fail-closed; WHEN se produce un error de BD **no transitorio**
  (`ACTOR_INVALID`, violación de constraint inesperada) THE sistema SHALL responder `500` genérico (mapeo de 003
  FR-009), **nunca** `503`. En ambos casos sin transición ni auditoría parcial (convención transversal de 001).
- **FR-011** (validación de `decision`): WHEN el body carece de `decision`, trae un valor fuera del enum
  `{approve, reject}`, o no es JSON válido/parseable THE sistema SHALL responder `422` `VALIDATION_ERROR` con
  `{code, message, details, agent_action}`, sin cambiar el estado, y evaluado **antes** que `INVALID_REASON`.
- **FR-012** (actor server-side): WHEN se registra el `actor` de la decisión en `OrderAudit` THE sistema SHALL
  derivarlo **exclusivamente** del JWT verificado server-side, **nunca** de un campo del body/params/query,
  aunque el cliente lo envíe (no-repudio de la auditoría; patrón 005 FR-007).
- **FR-013** (guard defensivo de evidencia): WHEN un supervisor aprueba una orden en `pending_review` THE sistema
  SHALL verificar **antes** de transicionar que la orden tiene **≥1 evidencia** asociada (`COUNT(OrderEvidence)
  ≥ 1`); si la invariante de 005 no se cumple, SHALL **no** aprobar y responder **`409 CONFLICT`
  `EVIDENCE_REQUIRED`** (fail-closed), en lugar de cerrar la orden silenciosamente. El `409` se evalúa **después**
  del `404` (la orden es visible y está en `pending_review`, pero su estado de datos entra en conflicto con la
  precondición de aprobación). Es un **suelo de integridad** (existe ≥1 evidencia), **no** un chequeo de
  frescura/novedad: si un reenvío tras rechazo aporta o no evidencia nueva es validación de **005**
  (`submitOrderExecution`), fuera de 006; el versionado por intento (`attempt`) es de 005/#008 (ver A3).

### Key Entities *(include if feature involves data)*

- **Order**: entidad de 002a; esta feature muta `status` (`pending_review→closed` | `pending_review→in_progress`)
  y `version` (+1). No introduce campos nuevos.
- **OrderAudit**: registro append-only de 002b/003; esta feature **añade** un registro por decisión
  (`from/to/actor/reason?/at`). No se modifica su forma.
- **Motivo de revisión** (rejection reason / optional approval note): texto libre del supervisor (1–1000
  caracteres, pre-saneado) que se persiste en **`OrderAudit.reason`** (no entidad nueva); cifrado en reposo
  diferido a BL-051.
- **Evidencia / notas de ejecución** (de 005): sólo se **leen/conservan**; no se crean ni modifican aquí.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El 100% de las aprobaciones sobre una orden en `pending_review` la dejan en `closed` con
  exactamente **un** nuevo registro de auditoría y `version` incrementada en 1.
- **SC-002**: El 100% de los rechazos con motivo válido dejan la orden en `in_progress` con auditoría del
  rechazo; el 100% de los rechazos sin motivo válido son `422` y dejan la orden **sin cambios**.
- **SC-003**: El 100% de los intentos de revisión por roles distintos de supervisor son `403` (o `401`), y el
  100% de los intentos sobre órdenes fuera de `pending_review` son `404` genérico (0 fugas del estado real).
- **SC-004**: En el 100% de los casos, tras aprobar o rechazar, la evidencia y notas de 005 siguen presentes e
  inalteradas (0 pérdidas).
- **SC-005**: 0 apariciones del motivo en logs y en cuerpos de error (grep negativo), y 0 transiciones/auditorías
  parciales ante fallo de BD (atomicidad verificada).
- **SC-006**: La decisión de revisión responde con **p95 < 300 ms**, medido **por separado** para el camino
  `approve` (sin motivo, 1 insert de auditoría) y para el camino `reject` (con motivo hasta 1000 caracteres);
  **ambos** caminos cumplen el umbral de forma independiente (50 peticiones secuenciales, nearest-rank, BD de
  test caliente, warm-up descartado); correlation-ID presente en respuesta y logs. Misma metodología que 005 SC-009.

## Contrato (OpenAPI) *(obligatorio si hay endpoints — Constitution II)*

- **Fichero de contrato**: extiende `contracts/orders.openapi.yaml` (OpenAPI 3.1), reutilizando `bearerAuth` y
  `ErrorResponse`.
- **Endpoints** (propuesta; forma exacta se fija en `/speckit-plan`):
  - `reviewOrder` — `POST /orders/{orderId}/review` — roles `supervisor` — body `{ decision: "approve" |
    "reject", reason?: string }` — respuestas `200 / 401 / 403 / 404 / 409 / 422 / 500 / 503`.
  - *(Alternativa a evaluar en plan: dos operaciones `approveOrder` / `rejectOrder`.)*
- **Esquemas**: `ReviewDecision` (`enum [approve, reject]`); `reason` con longitud acotada; reutiliza `Order`
  (con `closed` ya en el `enum` de `status`) y `OrderListResponse`.
- **Errores** `{ code, message, details, agent_action }` con HTTP correcto: `401` (uniforme), `403`
  (`FORBIDDEN_ROLE`), `404` (genérico, no-enumeración), `409` (`EVIDENCE_REQUIRED`, guard de evidencia en
  aprobación), `422` (`VALIDATION_ERROR` para `decision`/body; `INVALID_REASON` para el motivo), `500` (error no
  transitorio), `503` (fail-closed BD no disponible).
- **Fuera del contrato de 006**: ningún endpoint de **lectura** de detalle (notas/evidencia/motivo) — es
  read-side aparte (ver §Alcance MVP).

## Trazabilidad (RF → endpoint → tarea → test) *(obligatorio — Constitution VI)*

| FR | Endpoint(s) | Tarea(s) | Test(s) |
| ---- | ----------- | -------- | ------- |
| FR-001 | `reviewOrder` (approve) | T0xx | `should close order when supervisor approves pending_review` |
| FR-002 | `reviewOrder` (reject) | T0xx | `should return order to in_progress when supervisor rejects with reason` |
| FR-003 | `reviewOrder` (reject) | T0xx | `should 422 INVALID_REASON when rejecting without a valid reason` |
| FR-004 | `reviewOrder` | T0xx | `should write transition and audit atomically` |
| FR-005 | `reviewOrder` | T0xx | `should preserve evidence and execution notes after decision` |
| FR-006 | `reviewOrder` | T0xx | `should 403 when non-supervisor attempts review` |
| FR-007 | `reviewOrder` | T0xx | `should 404 generic when order not in pending_review or unknown` |
| FR-008 | `reviewOrder` | T0xx | `should never leak reason in logs or error bodies` |
| FR-009 | `reviewOrder` | T0xx | `should apply deterministic error precedence` |
| FR-010 | `reviewOrder` | T0xx | `should 503 when DB unavailable and 500 on non-transient write error` |
| FR-011 | `reviewOrder` | T0xx | `should 422 VALIDATION_ERROR when decision missing or invalid` |
| FR-012 | `reviewOrder` | T0xx | `should derive actor from JWT, ignoring body-supplied actor fields` |
| FR-013 | `reviewOrder` (approve) | T0xx | `should not approve when order has no evidence (defensive guard)` |

> Se mantiene en `docs/traceability.md`. Los `T0xx` los asigna `/speckit-tasks`.

## Eval de objetivos (promptfoo) *(obligatorio — Constitution XIV)*

- **SC → aserción**: cada SC medible se codifica como test(s) en `/evals/sc/006-revision-supervisor.yaml`.
- **Sin componente IA** en esta feature (el resumen IA es #006/roadmap): no aplican umbrales de faithfulness /
  alucinación; sí el grep negativo de no-fuga del motivo (SC-005).
- El gate **G3** falla si algún SC obligatorio no se cumple.

## Assumptions

- **Origen único `pending_review`**: la única forma de llegar a `pending_review` es el registro de ejecución de
  005, que garantiza ≥1 evidencia válida. Aun así, 006 **no confía ciegamente**: añade un **guard defensivo
  fail-closed** (FR-013) que re-verifica ≥1 evidencia al aprobar, coherente con el patrón fail-closed del resto
  de la spec (503, atomicidad, 404 genérico).
- **006 es write-only**: no expone lectura de notas/evidencia/motivo; esa lectura es una feature read-side
  aparte (§Alcance MVP), prerequisito de FE-1/FE-4 y con un gap de RBAC que exige enmendar Constitution XI
  (technician lee el motivo de su propio rechazo).
- **`attempt` no es de 006**: la columna `attempt` (introducida en 005 como base-ready) **no** se lee ni
  incrementa aquí; el versionado por intento, si se implementa, es de **005** al reenviar tras rechazo, o
  carve-out de **#008**. 006 sólo ve el estado resultante `pending_review`.
- **Unicidad de rol operativo por usuario**: se asume que un usuario no ostenta simultáneamente `dispatcher` y
  `supervisor` sobre las mismas órdenes. Es una asunción **de aprovisionamiento** (alta de usuarios), **sin
  enforcement** en el código de 006; la segregación de funciones (SoD) formal (impedir auto-aprobación de trabajo
  auto-asignado) es backlog (fuera de 006), coherente con el RBAC de 001.
- **Sin asignación para el supervisor**: cualquier supervisor puede revisar **cualquier** orden en
  `pending_review` (no hay `assigned_to` de supervisor); el alcance visible es exactamente el de `listOrders`
  (supervisor = `pending_review`).
- **Sin tope al ciclo de rechazo**: `pending_review↔in_progress` puede repetirse; el nº de rechazos es
  **observable** contando `OrderAudit {from:pending_review, to:in_progress}` de la orden (sin columna nueva). El
  límite/contador dedicado es backlog (declarado fuera en 002b), no se introduce aquí.
- **Concurrencia optimista `If-Match`→409 fuera de alcance** (stretch #008): el MVP resuelve la carrera por
  "primera transición gana → la segunda ve `404`".
- **Reutiliza inamovibles**: auth/RBAC (001), FSM + `applyTransition`/auditoría atómica (002b/003), contrato de
  errores y correlation-id (001). No se altera su forma.
- **`closed` es terminal**: tras aprobar no hay más transiciones (coherente con la FSM de 002b).
