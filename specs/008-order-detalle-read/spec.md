# Feature Specification: Detalle de orden (read-side)

**Feature Branch**: `008-order-detalle-read`

**Created**: 2026-07-13

**Status**: Draft

**Input**: Roadmap #010 (BL-070, origen: BLOQUEANTE del gate G1 de 006 diferido). **Prerequisito de la fase
Front** (FE-1/FE-2/FE-4): un endpoint de **lectura** del detalle de una orden. Las specs 004–006 son
*write-side* y no exponen la lectura del detalle (notas de ejecución + metadatos de evidencia + motivo del
rechazo). El brief (`docs/00-brief-original.md`) dice *"el usuario puede ver sus órdenes"* y define
aprobar/rechazar; el ciclo de 006 rechaza devolviendo la **misma** orden a `in_progress` (no crea una nueva),
así que el técnico necesita ver **por qué** para corregir y reenviar.

> **Alcance MVP (Constitution XV)**: **LECTURA pura** del detalle de una orden visible según el rol. El motivo
> del último rechazo se **lee de `OrderAudit.reason`** acotado a la propia orden del técnico, habilitado por la
> **excepción de mínimo privilegio de Constitution XI (≥ v1.9.0)** — **sin** columna denormalizada, **sin** tocar
> 004/005/006, **sin** migración ni backfill (opción B; se descartó denormalizar por más invasiva y por riesgo de
> PII en el backfill). **No** incluye: mutaciones; subida/descarga del binario de evidencia (#007-subida);
> listado (002a); resto del registro de auditoría (restringido, XI); detalle de órdenes `closed` (futuro).

## Clarifications

### Session 2026-07-13

- Q: ¿Cómo se sirve el motivo del último rechazo? → A: ~~columna denormalizada en `Order`~~ **[SUPERADA en la
  ronda 2 de G1 → opción B: leer `OrderAudit.reason` acotado, XI v1.9.0]** (la denormalización resultó más
  invasiva: tocaba 004/005/006 + migración + backfill con fuga de PII).
- Q: ¿Qué roles ven el motivo? → A: **solo el técnico dueño** (confirmado en ronda 2; ver abajo).

### Session 2026-07-13 — remediación gate G1 (ronda 1)

- Q: **(mecanismo, revisado)** ¿Columna atada al ciclo (limpiada en 005/006)? → A: ~~mantener la columna atada al
  ciclo~~ **[SUPERADA en la ronda 2 → opción B]** (el toque a 004/005/006 + backfill-PII pesaba más que enmendar
  XI de forma acotada).
- Q: **(quién ve el motivo, revisado)** El motivo vive en órdenes rechazadas (`in_progress`), fuera del alcance
  del supervisor (`pending_review`). → A: **solo el technician dueño**. Supervisor y dispatcher **no** ven el
  motivo en el detalle (el supervisor ya lo conoce al escribirlo). Sin ampliar alcances.
- Q: **(403 vs 404)** ¿Qué código para orden no visible? → A: **404 genérico uniforme** (no-enumeración). El
  endpoint es de lectura abierto a los 3 roles autenticados; la visibilidad filtra a 404. **No se usa 403** (se
  retira del contrato de este endpoint).
- Q: **(campos de fecha)** → A: `created_at` y `updated_at` (ISO-8601 UTC), como `OrderDto` de 002a.
- Q: **(ausencia de valor)** → A: **omitir la clave** del JSON cuando no aplica (notes/evidence/motivo);
  convención uniforme (no `null`).
- Q: **(metadatos de evidencia)** → A: `content_types` **lista** (un `content_type` por evidencia del ciclo,
  duplicados posibles) + `count`, igual que la `EvidenceMeta` de 007.
- Q: **(órdenes `closed`)** → A: **fuera de alcance** de #010 (ningún rol tiene `closed` en su alcance de
  trabajo; el detalle de cerradas es una necesidad futura, no del brief). Documentado.
- Q: **(ciclo vigente tras rechazo, antes de reenviar)** → A: el "ciclo vigente" son las notas/evidencia del
  **último `submitOrderExecution`** (el que fue rechazado) — es justo lo que el técnico debe ver para corregir.

### Session 2026-07-13 — remediación gate G1 (ronda 2): mecanismo del motivo = opción B

- Q: **(mecanismo, re-revisado con costes de G1)** La columna denormalizada (A) tocaba 004/005/006 + migración +
  backfill con **fuga de PII** (motivos históricos no saneados) + problema de reasignación. → A: **opción B** —
  leer `OrderAudit.reason` acotado a la propia orden, habilitado por **Constitution XI v1.9.0** (excepción de
  mínimo privilegio). **Sin columna, sin tocar 004/005/006, sin migración, sin backfill.** #010 vuelve a ser
  **read-side puro**.
- Q: **(403 vs 404, propagación)** → A: **404 uniforme, sin 403** en TODO el spec (FR-004, FR-008, SC-003,
  contrato, trazabilidad) — corregida la propagación incompleta.
- Q: **(forma de `evidence`)** → A: ~~`evidence` **siempre presente**~~ **[SUPERADA en ronda 5 → `evidence` es
  opcional/omitible: omitido para el dispatcher; `{count:0,content_types:[]}` = "sin ciclo aún" para
  technician/supervisor]** (`{count, content_types}` cuando presente).
- Q: **(aislamiento supervisor/dispatcher)** → A: es el **modelo de organización única** de la constitution
  (multi-tenant fuera, YAGNI); cualquier supervisor/dispatcher ve datos de su alcance de estado en toda la org.
  Residual **aceptado y trazado (BL-074)** — no un defecto de #010; la segmentación por equipo/tenant es backlog.

### Session 2026-07-13 — remediación gate G1 (ronda 3): resolver el motivo en #010 (B endurecida)

- Q: **(atado al ciclo con B)** motivo (última transición de rechazo) vs notas (último submit) divergen tras
  reenviar. → A: mostrar el motivo **solo si hay rechazo SIN atender** = última transición de rechazo **posterior**
  al último `submitOrderExecution`; tras reenviar (`pending_review`) se omite → motivo y notas del **mismo ciclo**.
- Q: **(PII histórica con B)** leer `OrderAudit.reason` directo lee filas históricas no saneadas. → A: **sanear al
  leer** con el `pii-redactor` compartido de 007 (defensa en profundidad); eso **define "PII cruda"** de SC-004.
  No hace falta feature #011 aparte.
- Q: **(dispatcher)** → A: **mínimo privilegio** — sin notas ni metadatos de evidencia (solo campos de la orden).
- Q: **(reasignación)** → A: el motivo lo ve el **dueño actual** (debe corregir la orden; el motivo va saneado).
- Q: **(alcance técnico / `draft`)** → A: "activas" del técnico = assigned/in_progress/pending_review de SUS
  órdenes; **`draft`** fuera de alcance de todo rol → `404` (pre-asignación, no es fuga).

### Session 2026-07-13 — remediación gate G1 (ronda 5): consistencia del DTO `evidence`

- Q: **(H-001, evidence en el esquema)** FR-001 dice que `evidence` se **omite** para el dispatcher, pero el DTO
  de la Key Entity y el esquema del contrato lo mostraban sin `?` (requerido). → A: **`evidence` es opcional/omitible**
  en ambos sitios (`OrderDetailResponse = { order, notes?, evidence?, last_rejection_reason? }`), coherente con
  FR-001/FR-002: **omitido** para el dispatcher; **presente-pero-vacío** `{count:0, content_types:[]}` solo cuando
  technician/supervisor ven un ciclo sin ficheros. Resuelve H-001 (contrato con esquema único sin contradicción).
- Q: **(H-002, 403 en SC-005)** el gate marcó que SC-005 «sigue diciendo 403/404». → A: **falso positivo** — SC-005
  ya no menciona `403` (retirado en ronda 2/4); las únicas apariciones de "403" en el spec son negaciones («sin 403»).
  Sin cambios; se re-ejecuta el gate para que re-renderice sin el hallazgo obsoleto.

### Session 2026-07-13 — remediación gate G1 (ronda 6): honestidad de SC-004, XI y consistencia cruzada

- Q: **(BLOQUEANTE, `notes` sin sanear vs SC-004)** SC-004 prometía «0 PII estructural en TODA la respuesta» pero
  solo se sanea el `motivo`; las `notes` (texto libre del técnico) se sirven en crudo. → A: **acotar SC-004/FR-006**
  al `object_ref` (todo) y al `motivo` (saneo estructural); las `notes` son **payload autoría del propio técnico
  (IX)** servido solo a técnico dueño/supervisor (no a terceros; no es el caso 007→IA) → **residual IX aceptado**,
  no fuga. SC-004 pasa a ser verificable y honesta.
- Q: **(S-001, fallo del pii-redactor)** ¿fail-open o fail-closed? → A: **fail-closed** — si el redactor falla/no
  está disponible, se **omite** `last_rejection_reason` (nunca se sirve el `reason` crudo).
- Q: **(S-002/XI, auditoría de accesos denegados)** XI exige registrar 401/404. FR-007 decía «sin efectos
  secundarios». → A: nuevo **FR-009** — se registra el acceso denegado (append-only, `recurso` opaco, sin PII);
  FR-007 aclara que "read-only" = sin **mutación de dominio** (la auditoría es infraestructura transversal de XI).
- Q: **(C-001, `evidence {count:0}` vs 005)** un submit exige ≥1 evidencia (005 FR-004), así que "ciclo con 0
  ficheros" es irrealizable. → A: reformulado: `{count:0, content_types:[]}` = **"sin ciclo de ejecución aún"**;
  invariante `count == content_types.length`.
- Q: **(C-002/C-003 reasignación)** justificación de FR-005 y qué ve el nuevo dueño. → A: la razón es **mínimo
  privilegio** (no "el supervisor ya lo conoció"); el contexto cruzado entre supervisores = **BL-080**. El nuevo
  dueño ve **notas/evidencia del ciclo del técnico anterior + motivo** (intencional, para corregir); la atribución
  de autoría es cometido de la Front.
- Q: **(H-003/H-004/H-005 FR-003)** discriminador de la transición de rechazo, `reason` NULL, empate de timestamp.
  → A: el reject es la **única** operación `pending_review→in_progress` (006); su `reason` es **obligatorio y no
  vacío** (nunca NULL); empate `at` submit-vs-reject se resuelve por `id`/uuid v7 monótono.
- Q: **(varios: T-001, T-002, S-003, C-006, H-006, H-007)** orden de `content_types` (por `at` asc), snapshot que
  incluye el **guard de propiedad** (anti ex-dueño), precedencia **401→404**, alcance del técnico explícito vs
  002a, y el `404` post-aprobación como **limitación MVP** documentada.

### Session 2026-07-13 — remediación gate G1 (ronda 7): endurecimiento de FR-009 y residuales

- Q: **(ALTA, FR-009 podría loggear PII)** el `recurso` del log de accesos denegados podría persistir el `orderId`
  malformado crudo (texto libre con PII inyectada) en un registro append-only no purgable. → A: **`recurso`
  saneado** — si matchea patrón UUID se guarda; si no, marcador fijo `"<malformed>"`/hash, nunca el valor crudo.
- Q: **(FR-009 modo de fallo)** ¿qué pasa si falla la escritura de auditoría? → A: **best-effort no bloqueante** —
  la respuesta 401/404 se devuelve igual; el fallo se registra en logs (no se pierde en silencio).
- Q: **(ALTA, efecto compuesto notes+BL-074)** `notes` sin redactor + visibilidad org-wide de supervisores expone
  PII estructural a todo el pool de supervisores. → A: documentado como **residual combinado reconocido**; su
  cierre pertenece a 005 (cifrado/purga D4) + backlog multi-tenant, no a este endpoint read-side.
- Q: **(FR-006 justificación de notes)** "las escribió quien las lee" es falsa tras reasignación. → A: la razón de
  no redactar `notes` se apoya en su **clasificación IX** (payload retenible), no en la autoría.
- Q: **(varios MEDIA)** rol no reconocido → **404** (fail-secure, default-deny como 002a); reasignaciones
  **encadenadas** (autoría ≠ dueño inmediato anterior); **canal lateral de tiempos** fuera de alcance MVP
  (residual); colisión de ID **BL-075→BL-080** (BL-075 ya usado por 007; alta de BL-080 por rama de fundación).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - El técnico ve el detalle de su orden y por qué se la rechazaron (Priority: P1)

Un technician abre una orden suya que volvió a `in_progress` tras un rechazo. Ve el detalle (estado, sus notas
de ejecución del ciclo vigente, metadatos de la evidencia) y **el motivo del último rechazo**, para poder
corregir y reenviar (bucle de 006).

**Why this priority**: sin ver el motivo, el rechazo es inútil y el bucle corregir→reenviar del brief no
funciona. Es el valor central de la lectura para el técnico.

**Independent Test**: con una orden propia rechazada (motivo registrado en 006), el technician pide el detalle
y recibe `200` con el estado, sus notas/metadatos de evidencia del ciclo vigente y el **motivo del rechazo**;
sobre una orden ajena recibe `404`.

**Acceptance Scenarios**:

1. **Given** una orden propia en `in_progress` tras rechazo (con motivo), **When** el technician pide el
   detalle, **Then** `200` con estado, notas del ciclo vigente, metadatos de evidencia (sin `object_ref`) y el
   **motivo del último rechazo**.
2. **Given** una orden **ajena** (de otro técnico) en cualquier estado, **When** el technician pide el detalle,
   **Then** `404` genérico (no-enumeración), sin filtrar existencia.
3. **Given** una orden propia que **nunca** fue rechazada (o ya reenviada), **When** pide el detalle, **Then**
   `200` con el detalle y la clave del motivo **omitida** del JSON (sin `last_rejection_reason`; convención de
   omitir la clave, **no** `null`).

### User Story 2 - Supervisor y dispatcher ven el detalle según su alcance (Priority: P2)

El supervisor ve el detalle de órdenes en `pending_review` (su alcance de 006) para decidir; el dispatcher ve
el detalle de órdenes `assigned`/`in_progress` (su alcance de 004). Cada rol solo ve lo visible para él.

**Why this priority**: completa el detalle para los otros roles reutilizando la visibilidad ya definida; base
de FE-3/FE-4. P2 porque el desbloqueo crítico de la Front es el detalle del técnico (P1) + supervisor.

**Independent Test**: supervisor pide el detalle de una orden en `pending_review` → `200`; de una fuera de su
alcance → `404`. Igual para dispatcher con su alcance.

**Acceptance Scenarios**:

1. **Given** el supervisor y una orden en `pending_review`, **When** pide el detalle, **Then** `200` con estado
   + notas + metadatos de evidencia del ciclo vigente (lo que necesita para revisar).
2. **Given** el dispatcher y una orden `assigned`/`in_progress`, **When** pide el detalle, **Then** `200` con el
   detalle de su alcance.
3. **Given** cualquier rol y una orden fuera de su alcance de visibilidad, **When** pide el detalle, **Then**
   `404` genérico e indistinguible.

### Edge Cases

- **`orderId` malformado / inexistente / fuera de alcance**: `404` genérico idéntico (no-enumeración, coherente
  con 002a/004/005/006). Sin llamar a nada tras el guard de visibilidad.
- **Orden sin ciclo de ejecución** (p. ej. `assigned` sin ejecución aún): `200` con el detalle disponible; notas
  `notes` omitido y `evidence` presente con `{count:0, content_types:[]}` (no es error).
- **Orden con varios ciclos** (rechazada y reenviada varias veces, bucle de 006): se muestran las notas/evidencia
  del **ciclo vigente** (el `auditId` del último `submitOrderExecution`) y el **motivo del último rechazo**; no se
  mezclan ciclos anteriores (coherente con la decisión H-001 de 007).
- **Motivo con datos sensibles**: además del saneo de escritura (XI), el motivo se **sanea al leer** con el
  `pii-redactor` estructural (defensa en profundidad); si el redactor falla, se **omite** el motivo (fail-closed,
  FR-006). Nunca se expone `object_ref` ni PII estructural en el motivo.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001** (detalle por visibilidad): WHEN un usuario autenticado pide el detalle de una orden **visible para
  su rol** (mismo criterio de alcance que 002a: technician = sus órdenes activas; supervisor = `pending_review`;
  dispatcher = `assigned`/`in_progress`) THE sistema SHALL devolver `200` con el detalle: `id`, `title`,
  `description`, `status`, `assigned_to`, `version`, `created_at`, `updated_at` (ISO-8601 UTC). Los tres campos
  de trabajo — `notes`, `evidence` y `last_rejection_reason` — son **opcionales y se OMITEN** del JSON cuando no
  aplican al rol/estado (convención uniforme, no `null`): para el **dispatcher** se omiten `notes`/`evidence`
  (mínimo privilegio, FR-002); para todos se omite `last_rejection_reason` salvo el técnico dueño con rechazo sin
  atender (FR-005). Cuando el técnico/supervisor ven una orden **sin ciclo de ejecución aún** (p. ej. `assigned`
  sin `submitOrderExecution`), `evidence` es `{count:0, content_types:[]}` (presente-pero-vacío ≠ omitido:
  presente = "hay visibilidad de evidencia pero aún no hay ciclo"; omitido = "este rol no ve evidencia"). **Un
  ciclo ya enviado siempre tiene ≥1 evidencia** (005 FR-004 exige 1..10), por lo que `count:0` **solo** ocurre
  antes del primer submit. Invariante: `count == content_types.length`.
- **FR-002** (notas + metadatos de evidencia del ciclo vigente — mínimo privilegio): THE detalle SHALL incluir
  las **notas de ejecución** y los **metadatos de evidencia** `{ count, content_types }` (donde `content_types`
  es la **lista** de `content_type` por evidencia del ciclo, duplicados posibles, **ordenada por `at` ascendente
  de cada `OrderEvidence`** y desempate por `id`, con invariante **`count == content_types.length`**) del
  **ciclo vigente** (el
  `auditId` del último `submitOrderExecution`) **solo para el technician dueño y el supervisor** (quienes
  ejecutan/revisan el trabajo). El **dispatcher NO** recibe notas ni metadatos de evidencia (su función es
  asignar/reasignar, no necesita el trabajo del técnico ni datos de cliente — mínimo privilegio): su detalle se
  limita a los campos de la orden. **Nunca** el `object_ref` crudo ni el binario.
- **FR-003** (motivo del último rechazo — lectura acotada, opción B): WHEN el **technician dueño** pide el detalle
  de SU orden y ésta tiene un **rechazo SIN atender** THE sistema SHALL incluir el **motivo del último rechazo**
  leído de **`OrderAudit.reason` de la última transición de rechazo de esa orden**, habilitado por la **excepción
  de mínimo privilegio de Constitution XI (≥ v1.9.0)** (solo el `motivo`, solo la última transición de rechazo,
  solo de una orden asignada al propio actor; no abre el resto del registro).
  - **Qué es una "transición de rechazo":** una fila de `OrderAudit` de la revisión de 006 con
    `fromStatus=pending_review` y `toStatus=in_progress` (el reject de 006; su `reason` es el motivo). En la FSM,
    **el reject de 006 es la ÚNICA operación** que produce ese par de estados (la aprobación es
    `pending_review→closed`; la reasignación de 004 opera sobre `assigned`/`in_progress`, nunca desde
    `pending_review`); 006 mismo cuenta rechazos por `{from:pending_review, to:in_progress}`. El `reason` de un
    reject es **obligatorio y no vacío** (006: 1–1000 code points tras saneo, `422 INVALID_REASON` si falta), por
    lo que **nunca es NULL/vacío**. Se toma la transición **más reciente** por `at` (empate → mayor `id`/uuid v7
    monótono).
  - **Regla de "rechazo sin atender" (atado al ciclo, resuelve la mezcla de ciclos):** el motivo se incluye **si y
    solo si** esa transición de rechazo es **estrictamente posterior** (`at`) al último `submitOrderExecution` de
    la orden (i.e. la orden está en `in_progress` tras un rechazo y **aún no** se ha reenviado). Tras el reenvío
    (→ `pending_review`) el motivo se **omite**. **Todas** las lecturas de la petición — **el guard de propiedad
    (`Order.assigned_to`)**, la última reject y el último submit — se resuelven en una **única consulta/snapshot
    consistente** (criterio observable a nivel spec; el mecanismo exacto de aislamiento se fija en `/plan`), de
    modo que ni un submit ni una **reasignación** concurrentes produzcan estados híbridos: así el ex-dueño no puede
    obtener el motivo tras dejar de serlo, y notas/evidencia (del último submit) y motivo pertenecen **siempre al
    mismo ciclo y al dueño actual**. **Empate submit vs reject** con el mismo `at`: el `id`/uuid v7 monótono mayor
    define el orden (un reject registrado tras un submit tiene id mayor → se considera **posterior** → motivo
    visible).
  - **Saneo al leer (defensa en profundidad, resuelve la PII histórica):** el motivo se pasa por el **detector/
    redactor de PII estructurada compartido** (`domain/ai/pii-redactor`, de 007) **antes** de servirlo — así, aun
    si un motivo histórico se guardó sin sanear, no se filtra PII estructurada al técnico. Esto **define** el
    criterio de "PII cruda" verificable de SC-004. **No confundir con el `sanitizeReason` de 006** (normalización
    de formato/longitud 1–1000 en escritura, que **no** redacta PII): esta capa de **redacción PII en lectura** es
    **obligatoria y NO redundante** — el handler de #010 SIEMPRE invoca el `pii-redactor` sobre el `reason` leído.
  - Sin columna denormalizada, sin tocar 004/005/006, sin migración.
- **FR-004** (RBAC + no-enumeración): WHEN el usuario no está autenticado THE sistema SHALL responder `401`.
  **Precedencia de errores (coherente con FR-009 de 006):** la comprobación de autenticación **precede** a toda
  resolución de visibilidad/existencia — una petición **sin token Y con `orderId` malformado** devuelve `401`
  (no `400`/`404`); solo tras autenticar se evalúa la visibilidad. Además, un `orderId` **malformado de un usuario
  autenticado** devuelve el **mismo `404`** (no un `400` de validación de esquema que reintroduciría un oráculo de
  enumeración). WHEN un usuario autenticado pide una orden **no visible** para su rol (inexistente, ajena,
  `orderId` malformado, o fuera de su alcance de estado) THE sistema SHALL responder **`404` genérico e
  indistinguible**,
  **sin** revelar existencia (coherente con 002a/006). El endpoint es de **lectura abierto a los tres roles**
  autenticados; la **visibilidad filtra a `404`** — **no se usa `403`** en este endpoint (un `403` sobre un
  `orderId` concreto rompería la no-enumeración). `closed` no está en el alcance de ningún rol → `404` (detalle
  de cerradas fuera de #010). **Rol no reconocido (fail-secure):** un actor **autenticado** cuyo rol no sea
  `technician`/`supervisor`/`dispatcher` (claim corrupto, rol nuevo, etc.) obtiene **alcance vacío** de
  `orderScopeFor` → **`404`** para toda orden (default-deny, coherente con el allowlist de roles de 002a). Nunca
  se amplía la visibilidad por un rol desconocido.
- **FR-005** (quién ve el motivo — mínimo privilegio): **SOLO el technician dueño ACTUAL** (`assigned_to` = el
  actor) ve el motivo, para corregir su orden con rechazo sin atender. **Supervisor y dispatcher NO** lo reciben
  **por mínimo privilegio** (Constitution XI): su función no es corregir el trabajo rechazado y su alcance
  —`pending_review`/`assigned`/`in_progress` sin motivo— no requiere el `reason` de la transición. La
  justificación es de **mínimo privilegio**, no "el supervisor ya lo conoció": en el modelo de organización única
  (BL-074) el supervisor que revisa un reenvío puede **no** ser el que rechazó, y el **contexto cruzado entre
  supervisores** (ver el motivo del rechazo previo al revisar) es una necesidad de la fase Front → **backlog
  BL-080** (no se resuelve exponiéndolo por este endpoint de mínimo privilegio). El technician **nunca** ve el
  motivo de otra orden ni ningún otro registro de auditoría.
  - **Reasignación (autoría del ciclo):** si una orden con rechazo sin atender se reasigna a otro técnico, el
    **nuevo dueño** ve el motivo **y** las notas/metadatos de evidencia del **ciclo vigente** —que fueron autoría
    de **otro técnico** (el que ejecutó ese submit; puede haber **varias** reasignaciones encadenadas sin reenvío
    intermedio, así que no es necesariamente el dueño inmediatamente anterior)—: es **intencional y necesario**
    para corregir y reenviar (mismo criterio que ver el motivo). No es fuga: el nuevo dueño es ahora el
    **responsable** de la orden. La **atribución visible** de la
    autoría del ciclo (mostrar de qué técnico son las notas) es cometido de la **Front** (los metadatos de autoría
    ya viven en `OrderAudit`), no de este DTO. El motivo pasa por el saneo estructural (FR-006); la PII de texto
    libre que el supervisor pudiera haber escrito es el residual **BL-073**. El campo se **omite** para todo
    rol/actor que no sea el dueño actual.
- **FR-006** (no-fuga de PII): THE respuesta SHALL **no** contener `object_ref` crudo (nunca, para ningún campo ni
  rol) ni **PII estructurada** en el **motivo** (`last_rejection_reason`); los `id`/`assigned_to` uuid son campos
  del contrato, no PII. El motivo servido pasa por el **detector estructural compartido** (`domain/ai/pii-redactor`
  de 007: email/teléfono/DNI-NIF/NIE/matrícula/IBAN/tarjeta) y no contiene ninguno de esos patrones. **Fail-closed
  del redactor:** si el `pii-redactor` **falla o no está disponible** al servir el motivo, THE sistema SHALL
  **omitir `last_rejection_reason`** (nunca servir el `reason` crudo) — jamás fail-open. **En logs**: el
  `OrderAudit.reason` crudo **no** se registra — `reason` ya está en `REDACT_PATHS` del logger (de 004/006).
  **Definición verificable de "PII cruda"** = lo que detecta ese redactor estructural (aserción de test, no juicio
  subjetivo).
  - **Alcance del saneo (`notes` vs `motivo`):** el redactor estructural se aplica **solo al motivo** (`OrderAudit.reason`,
    contenido histórico del registro leído bajo la excepción XI). Las **`notes` de ejecución NO** pasan por el
    redactor: son **payload de trabajo (Constitution IX;** 005 las clasifica como *Payload PII*), servidas **solo**
    al **technician dueño ACTUAL** y al **supervisor** en su alcance (quienes ejecutan/revisan el trabajo) —
    **nunca** a un tercero externo (no es el caso de 007→IA, donde sí se minimiza antes de salir del sistema). La
    decisión de no redactarlas se apoya en su **clasificación IX** (payload retenible), **no** en "las escribió
    quien las lee" (tras reasignación el dueño actual ≠ autor; ver FR-005). La eventual PII en `notes` es un
    **residual IX aceptado** (cifrado en reposo/purga = backlog D4 de 005), no una fuga cruzada de roles.
  - **Efecto compuesto (residual reconocido explícitamente):** `notes` sin redactor **+** visibilidad org-wide de
    supervisores (BL-074) implica que PII estructural que un técnico escriba por error en `notes` queda visible en
    claro a **todo el pool de supervisores** de la organización (no solo al asignado). No es nuevo alcance de #010
    (que solo **lee**), pero se documenta el riesgo **combinado**: su cierre pertenece a 005 (cifrado/purga D4) y a
    la segmentación por equipo/tenant (backlog multi-tenant), no a este endpoint read-side.
  - **Residual (BL-073):** la PII de **texto libre** (nombres/direcciones) que un supervisor pudiera escribir en el
    **motivo** **no** la capta el detector estructural — mismo residual best-effort que 007; mitigado porque el
    motivo lo autoría el **supervisor** (rol de confianza). Endurecimiento (NER / disciplina de escritura en 006) = BL-073.
- **FR-007** (read-only): THE endpoint SHALL ser de **lectura pura** (GET), **sin mutación de dominio** (ni estado,
  ni versión, ni notas/evidencia/auditoría de negocio) y **sin** servir el binario de evidencia (eso es
  #007-subida). **Excepción explícita (Constitution XI):** el **registro append-only de accesos denegados**
  (`401`/`404`: actor, endpoint, `recurso` como **identificador opaco sin PII**) exigido por XI **sí** se escribe —
  es **infraestructura transversal de auditoría/observabilidad**, no una mutación de dominio, y NO rompe la
  semántica read-only del recurso (FR-009).
- **FR-009** (auditoría de accesos — Constitution XI): WHEN una petición a `getOrderDetail` resulta en `401`
  (no autenticado) o `404` (no visible/inexistente/malformado) THE sistema SHALL registrar el acceso denegado en
  el registro **append-only** de XI (actor si lo hay, endpoint, `recurso`, **sin PII cruda**), de modo que el
  sondeo/enumeración deje rastro forense. Un `200` no requiere registro de acceso denegado.
  - **`recurso` saneado (anti-inyección de PII en el log):** el `orderId` llega como path param arbitrario; **no**
    se persiste crudo. Si **matchea el patrón UUID** se guarda tal cual (identificador opaco); si **no** matchea
    (malformado / texto libre que podría llevar PII inyectada), se persiste un **marcador fijo** `"<malformed>"`
    (o su hash), **nunca** el valor recibido. Así el registro append-only —no purgable— jamás almacena PII/texto
    arbitrario del path.
  - **Modo de fallo (best-effort, no bloqueante):** el registro de acceso denegado es **infraestructura
    transversal**; si su escritura falla, la respuesta `401`/`404` **se devuelve igual** (no degrada a `500`/`503`
    por un fallo de auditoría no crítico), pero el fallo de escritura **se registra en logs** —usando el `recurso`
    **ya saneado** (UUID o `<malformed>`), nunca el path crudo— sin perderse en silencio. El detalle transaccional
    exacto se fija en `/plan`.
- **FR-008** (contrato): THE respuesta `200` SHALL ajustarse a un `OrderDetailResponse` versionado en
  `contracts/*.openapi.yaml` (OpenAPI 3.1, ruta bajo `/v1`); los errores usan `{code, message, details,
  agent_action}` (**401/404/500/503**, sin 403; convención transversal 001/006).

### Key Entities *(include if data involved)*

- **Order** (002a): se **lee** (estado + campos + visibilidad). No se muta ni se le añaden campos.
- **OrderAudit** (003/006): se **lee acotadamente** — solo `reason` de la **última transición de rechazo** de la
  propia orden del técnico (excepción XI ≥ v1.9.0). No se expone el resto del registro.
- **OrderExecutionNotes / OrderEvidence** (005): **fuente** de notas + metadatos del ciclo vigente; se **leen**;
  nunca `object_ref` crudo.
- **Motivo del último rechazo**: `OrderAudit.reason` de la última transición de rechazo de la orden, **leído
  acotadamente** (excepción XI ≥ v1.9.0) y **saneado al leer** (pii-redactor de 007) antes de servirlo; se muestra
  solo si el rechazo está **sin atender** (FR-003) y solo al **técnico dueño** (FR-005).
- **OrderDetailResponse** (efímera): DTO de lectura `{ order, notes?, evidence?, last_rejection_reason? }` — los tres
  campos de trabajo son **opcionales/omitibles** (convención uniforme, no `null`; coherente con FR-001). Cuando
  `evidence` está presente (technician/supervisor con ciclo visible) su forma es `{count, content_types}`
  (`{count:0, content_types:[]}` si el ciclo no tiene ficheros); se **omite** entero para el dispatcher (mínimo
  privilegio, FR-002). Forma exacta en `/plan`. Sin PII cruda.

## Success Criteria *(mandatory)*

- **SC-001** (detalle visible): el 100% de las peticiones de una orden **visible para el rol** devuelven `200`
  con el detalle correcto (estado + notas/metadatos del ciclo vigente).
- **SC-002** (motivo al técnico): el 100% de las órdenes propias con **rechazo SIN atender** (última transición
  de rechazo posterior al último `submitOrderExecution`) muestran al technician dueño el **motivo saneado**; el
  100% de las órdenes **ya reenviadas** (en `pending_review`) o **no propias** **omiten** el motivo. (Criterio
  medible: el estado "rechazo sin atender" está definido por comparación de timestamps, FR-003.)
- **SC-003** (RBAC + no-enumeración): el 100% de las peticiones sin autenticar son `401` y el 100% de las
  peticiones fuera del alcance del rol son `404` genérico (**sin 403** en este endpoint); **0** fugas de
  existencia entre roles (mismo **código y cuerpo** para inexistente/ajena/fuera-de-estado/malformado). Los
  canales laterales de **tiempo de respuesta** (constant-time entre ramas de `404`) quedan **fuera de alcance
  MVP** (residual documentado; mitigación futura si el modelo de amenaza lo exige).
- **SC-004** (no-fuga de PII, verificable): **0** apariciones de `object_ref` crudo en **toda** la respuesta (ningún
  campo/rol); **0** apariciones de **PII estructural** (patrones del `pii-redactor` de 007) en
  `last_rejection_reason` (motivo saneado al leer; y si el redactor falla, el campo se **omite**, nunca crudo — 
  fail-closed, FR-006); y **0** apariciones del `OrderAudit.reason` crudo en **logs** (cubierto por `REDACT_PATHS` →
  `reason`). **Alcance del criterio:** la garantía estructural se afirma sobre `object_ref` (todo) y el `motivo`; las
  `notes` **no** están en el alcance del redactor (payload autoría del técnico servido solo a técnico dueño/supervisor,
  residual IX, FR-006). Residuales conocidos: PII de texto libre en el motivo (BL-073); PII en `notes` (payload IX).
- **SC-005** (excepción XI de mínimo privilegio respetada): el endpoint **solo** expone el motivo de la última
  transición de rechazo de la **propia** orden del técnico dueño — **no ofrece ninguna vía** para pedir otra
  transición, otra orden ni el resto del registro de auditoría. Verificado: pedir el detalle de una orden ajena →
  `404` (no expone su motivo); el detalle nunca incluye más de ese único campo de auditoría.

## Contrato (OpenAPI) *(obligatorio — Constitution II)*

- **Fichero**: extiende `contracts/orders.openapi.yaml` (OpenAPI 3.1), reutilizando `bearerAuth`/`ErrorResponse`.
- **Endpoint** (propuesta; forma exacta en `/plan`): `getOrderDetail` — `GET /orders/{orderId}` — roles
  technician/supervisor/dispatcher (según visibilidad) — respuestas `200 / 401 / 404 / 500 / 503` (**sin 403**:
  la visibilidad filtra a 404, no-enumeración).
- **Esquema** `OrderDetailResponse` (order + notes? + evidence? + last_rejection_reason?) — `evidence` es
  **opcional** en el esquema (no `required`): **omitido** para el dispatcher (mínimo privilegio, FR-002) y
  **presente-pero-vacío** `{count:0, content_types:[]}` solo cuando technician/supervisor ven un ciclo sin ficheros.
  El test de contrato del dispatcher verifica la **ausencia** de `evidence` (y `notes`).

## Trazabilidad (RF → endpoint → tarea → test) *(obligatorio — Constitution VI)*

| FR | Endpoint | Test(s) (nombres previstos) |
| ---- | -------- | --------------------------- |
| FR-001 | `getOrderDetail` | `should return order detail for a visible order per role` |
| FR-002 | `getOrderDetail` | `should include current-cycle notes + evidence metadata (no object_ref)` |
| FR-003 | `getOrderDetail` | `should include last rejection reason read from OrderAudit scoped to own order (XI v1.9.0 exception)` · `should show reason only when reject is after last submit (multi-cycle: picks latest reject, ignores older)` · `should keep reason+notes from same cycle under concurrent submit (consistent snapshot)` |
| FR-004 | `getOrderDetail` | `should 404 generic (no 403) for out-of-scope/nonexistent/malformed/closed/draft` · `should 401 unauth before any visibility check (unauth + malformed id → 401, not 400/404)` |
| FR-005 | `getOrderDetail` | `only owning technician sees reason; supervisor/dispatcher never; no other order/audit` · `reassigned owner sees prev-technician current-cycle notes/evidence + reason` · `ex-owner cannot read reason after concurrent reassignment (guard+read same snapshot)` |
| FR-006 | `getOrderDetail` | `should never leak object_ref in body (any role)` · `should redact structural PII in reason; omit reason if redactor fails (fail-closed)` · `should not log raw OrderAudit.reason` |
| FR-007 | `getOrderDetail` | `should be read-only (no domain state/version/notes/audit mutation)` |
| FR-008 | `getOrderDetail` | contract test × 200/401/404/500/503 (sin 403); `evidence`/`notes` optional; dispatcher body omits them |
| FR-009 | `getOrderDetail` | `should append an immutable denied-access record (opaque resource, no PII) on 401/404` |

> Se mantiene en `docs/traceability.md`. Los `T0xx` los asigna `/speckit-tasks`.

## Assumptions

- **Visibilidad reutilizada** de 002a (mismo `orderScopeFor` por rol) y coherente con el 404 no-enumeración de
  004/005/006. **Alcance efectivo de #010 (explícito, no heredado en silencio):** technician =
  `assigned`/`in_progress`/`pending_review` de SUS órdenes; supervisor = `pending_review`; dispatcher =
  `assigned`/`in_progress`. Si el `orderScopeFor` de 002a (listado) incluyera `closed`/`draft` para algún rol,
  **#010 los excluye deliberadamente** (→ `404`): el detalle de `closed`/`draft` es alcance futuro; esta
  restricción es intencional y trazada, no una deriva accidental respecto a 002a.
- **Ciclo vigente** = el `auditId` del último `submitOrderExecution` (misma decisión que 007 H-001), para no
  mezclar ciclos del bucle de 006.
- **Motivo por lectura acotada (opción B), XI v1.9.0**: el motivo se **lee de `OrderAudit.reason`** de la última
  transición de rechazo, **acotado a la propia orden del técnico**, por la **excepción de mínimo privilegio de
  Constitution XI ≥ v1.9.0**. **Sin columna, sin tocar 004/005/006, sin migración, sin backfill** (se descartó la
  denormalización por invasiva y por riesgo de PII no saneada en el backfill). BL-070 se cierra con la enmienda
  acotada de XI, justificada por el bucle de 006.
- **Solo el técnico dueño ve el motivo** (por **mínimo privilegio**, no por "el supervisor ya lo conoció"):
  supervisor y dispatcher **no** lo reciben; el motivo del rechazo previo para el revisor de un reenvío
  (contexto cruzado entre supervisores en org única) es **BL-080** (residual **nuevo**; su alta en
  `docs/06-roadmap.md` se hace por **rama de fundación**, no en esta rama de feature — regla de enmiendas aisladas).
- **Aislamiento (residual `BL-074`)**: supervisor/dispatcher ven datos de cliente (notas/metadatos) de **cualquier**
  orden de su alcance de estado en la organización, porque el modelo es de **organización única** — declarado
  **explícitamente en la Constitution** (multi-tenant fuera de alcance, Governance/Alcance §v1.1.0). No es una
  asunción implícita de #010 ni un defecto; la segmentación por equipo/tenant es backlog.
- **`closed` fuera de alcance**: el detalle de órdenes cerradas no se expone en #010 (necesidad futura, no del brief).
  **Efecto post-aprobación (limitación MVP aceptada):** tras `reviewOrder` (approve) de 006 la orden pasa a `closed`
  y su detalle devuelve `404` **incluso al supervisor que la aprobó**; la Front **no** recarga el detalle de una
  orden recién cerrada (usa la confirmación de la propia mutación de 006). El detalle de cerradas es futuro.
- **Read-only puro**: #010 no muta nada (ni añade campos); el binario de evidencia (descarga) es #007-subida,
  fuera de alcance.
- **Alcance del técnico** = sus órdenes en `assigned`/`in_progress`/`pending_review` (reutiliza `orderScopeFor`
  de 002a), de modo que ve su orden **tras reenviar** (pending_review) y **tras rechazo** (in_progress).
- **`draft` fuera de alcance**: ningún rol lee el detalle de una orden `draft` (pre-asignación, fuera del flujo
  del brief) → `404`. Igual que `closed`. Documentado (no es fuga; es alcance intencional).
- **Saneo del motivo al leer**: reúso del `pii-redactor` compartido de 007 (`domain/ai/pii-redactor`) sobre el
  motivo antes de servirlo → independiente de si 006 saneó históricamente; define "PII cruda" verificable (SC-004).
