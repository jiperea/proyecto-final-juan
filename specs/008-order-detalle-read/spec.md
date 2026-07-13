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

> **Alcance MVP (Constitution XV)**: sólo **LECTURA** del detalle de una orden visible según el rol. **No**
> incluye: mutaciones (son 004/005/006); subida/descarga del binario de evidencia (es #007-subida); listado
> (es 002a); histórico completo de auditoría (restringido, Constitution XI). Read-side puro sobre lo ya
> persistido por 002a/005/006.

## Clarifications

### Session 2026-07-13

- Q: ¿Cómo se sirve el motivo del último rechazo sin abrir el registro de auditoría (XI intacta)? → A:
  **columna denormalizada `last_rejection_reason` en `Order`**, escrita por **006 en el reject** (write-through,
  misma transacción, texto saneado); #010 la **lee** como dato operativo. **XI queda intacta** (no se lee
  `OrderAudit`). Consecuencia: 006 añade la escritura de ese campo + **migración reversible** (columna nueva).
- Q: ¿Qué roles ven el motivo en el detalle? → A: **technician (solo SU propia orden)** + **supervisor**
  (cualquier orden visible). El **dispatcher NO** ve el motivo (no participa en la revisión), aunque vea el resto
  del detalle.

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
3. **Given** una orden propia que **nunca** fue rechazada, **When** pide el detalle, **Then** `200` con el
   detalle y **sin** campo de motivo (o motivo nulo/omitido).

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
  y evidencia vacías/omitidas (no es error).
- **Orden con varios ciclos** (rechazada y reenviada varias veces, bucle de 006): se muestran las notas/evidencia
  del **ciclo vigente** (el `auditId` del último `submitOrderExecution`) y el **motivo del último rechazo**; no se
  mezclan ciclos anteriores (coherente con la decisión H-001 de 007).
- **Motivo con datos sensibles**: el motivo ya se guarda **saneado / sin PII cruda** (Constitution XI); se sirve
  tal cual (saneado). Nunca se expone `object_ref` ni PII cruda.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001** (detalle por visibilidad): WHEN un usuario autenticado pide el detalle de una orden **visible para
  su rol** (mismo criterio de alcance que 002a: technician = sus órdenes activas; supervisor = `pending_review`;
  dispatcher = `assigned`/`in_progress`) THE sistema SHALL devolver `200` con el detalle: `id`, `title`,
  `description`, `status`, `assigned_to`, `version`, fechas.
- **FR-002** (notas + metadatos de evidencia del ciclo vigente): THE detalle SHALL incluir las **notas de
  ejecución** y los **metadatos de evidencia** (conteo + `content_type`) del **ciclo vigente** (el `auditId` del
  último `submitOrderExecution`); **nunca** el `object_ref` crudo ni el binario.
- **FR-003** (motivo del rechazo como DATO OPERATIVO): WHEN la orden fue rechazada en su ciclo vigente THE
  detalle SHALL incluir el **motivo del último rechazo**, servido desde una **columna denormalizada
  `last_rejection_reason` en `Order`** que **006 escribe en el reject** (write-through, misma transacción, texto
  saneado). Es **retroalimentación operativa del ciclo**, **no** lectura del registro de auditoría: Constitution
  **XI queda intacta** (no se accede a `OrderAudit`). El motivo ya está **saneado / sin PII cruda** (XI). *(Añade
  la escritura del campo en 006 + migración reversible; lo detalla `/plan`.)*
- **FR-004** (RBAC + no-enumeración): WHEN el usuario no está autenticado THE sistema SHALL responder `401`;
  WHEN pide una orden **no visible** para su rol (inexistente, ajena, `orderId` malformado, o fuera de su alcance
  de estado) THE sistema SHALL responder `404` genérico e indistinguible, **sin** revelar existencia (coherente
  con 002a/006). El rol sin alcance de lectura del detalle recibe `403`/`404` según la política reutilizada.
- **FR-005** (quién ve el motivo — mínimo privilegio): el **technician** SHALL ver el motivo **solo de SU propia
  orden** (la asignada a él), **nunca** el de otra orden ni ningún otro registro de auditoría; el **supervisor**
  lo ve en cualquier orden visible (lo escribe/revisa); el **dispatcher NO** recibe el motivo en el detalle
  (aunque vea el resto), pues no participa en la revisión. El campo se **omite** cuando el rol no debe verlo.
- **FR-006** (no-fuga de PII): THE respuesta y los logs SHALL **no** contener `object_ref` crudo, uuids internos
  innecesarios ni PII cruda; solo `id`/metadatos (conteo, `content_type`) + el motivo saneado.
- **FR-007** (read-only): THE endpoint SHALL ser de **lectura pura** (GET), sin mutar estado ni versión, sin
  efectos secundarios, y **sin** servir el binario de evidencia (eso es #007-subida).
- **FR-008** (contrato): THE respuesta `200` SHALL ajustarse a un `OrderDetailResponse` versionado en
  `contracts/*.openapi.yaml` (OpenAPI 3.1, ruta bajo `/v1`); los errores usan `{code, message, details,
  agent_action}` (401/403/404/500/503 según convención transversal 001/006).

### Key Entities *(include if data involved)*

- **Order** (002a): se **lee** (estado + campos + visibilidad). **Nuevo campo denormalizado
  `last_rejection_reason`** (operativo, saneado, nullable) que 006 escribe en el reject; #010 lo lee. No se muta
  desde #010 (read-only).
- **OrderExecutionNotes / OrderEvidence** (005): **fuente** de notas + metadatos del ciclo vigente; se **leen**;
  nunca `object_ref` crudo.
- **Motivo del último rechazo** (operativo): el texto saneado del rechazo del ciclo vigente (de 006), servido
  como **dato operativo** de la orden — no como entrada del registro de auditoría forense.
- **OrderDetailResponse** (efímera): DTO de lectura `{ order, notes?, evidence:{count,content_types}, last_rejection_reason? }`
  (forma exacta en `/plan`). Sin PII cruda.

## Success Criteria *(mandatory)*

- **SC-001** (detalle visible): el 100% de las peticiones de una orden **visible para el rol** devuelven `200`
  con el detalle correcto (estado + notas/metadatos del ciclo vigente).
- **SC-002** (motivo al técnico): el 100% de las órdenes propias rechazadas muestran al technician el **motivo
  del último rechazo**; el 100% de las órdenes **no propias** ocultan el motivo y devuelven `404`.
- **SC-003** (RBAC + no-enumeración): el 100% de las peticiones fuera del alcance del rol son `404`
  genérico/`401`/`403`; **0** fugas de existencia entre roles.
- **SC-004** (no-fuga de PII): **0** apariciones de `object_ref` crudo ni PII cruda en la respuesta o los logs.
- **SC-005** (XI intacta): el technician **no** puede leer el registro de auditoría (transiciones, accesos
  denegados, motivos de otras órdenes); solo el motivo operativo de su propia orden (verificado por test).

## Contrato (OpenAPI) *(obligatorio — Constitution II)*

- **Fichero**: extiende `contracts/orders.openapi.yaml` (OpenAPI 3.1), reutilizando `bearerAuth`/`ErrorResponse`.
- **Endpoint** (propuesta; forma exacta en `/plan`): `getOrderDetail` — `GET /orders/{orderId}` — roles
  technician/supervisor/dispatcher (según visibilidad) — respuestas `200 / 401 / 403 / 404 / 500 / 503`.
- **Esquema** `OrderDetailResponse` (order + notes? + evidence metadata + last_rejection_reason?).

## Trazabilidad (RF → endpoint → tarea → test) *(obligatorio — Constitution VI)*

| FR | Endpoint | Test(s) (nombres previstos) |
| ---- | -------- | --------------------------- |
| FR-001 | `getOrderDetail` | `should return order detail for a visible order per role` |
| FR-002 | `getOrderDetail` | `should include current-cycle notes + evidence metadata (no object_ref)` |
| FR-003 | `getOrderDetail` | `should include last rejection reason as operational data (audit untouched)` |
| FR-004 | `getOrderDetail` | `should 404 generic for out-of-scope/nonexistent/malformed; 401 unauth` |
| FR-005 | `getOrderDetail` | `technician sees reason only for own order, not others; no audit browse` |
| FR-006 | `getOrderDetail` | `should never leak object_ref/PII in body or logs` |
| FR-007 | `getOrderDetail` | `should be read-only (no state/version mutation)` |
| FR-008 | `getOrderDetail` | contract test × 200/401/403/404/500/503 |

> Se mantiene en `docs/traceability.md`. Los `T0xx` los asigna `/speckit-tasks`.

## Assumptions

- **Visibilidad reutilizada** de 002a (mismo `orderScopeFor` por rol) y coherente con el 404 no-enumeración de
  004/005/006. No se redefine la política de alcance.
- **Ciclo vigente** = el `auditId` del último `submitOrderExecution` (misma decisión que 007 H-001), para no
  mezclar ciclos del bucle de 006.
- **Motivo como dato operativo, XI intacta (decidido en clarify)**: **columna denormalizada
  `last_rejection_reason` en `Order`**, escrita por **006** en el reject (write-through, saneado); #010 la lee.
  **No se accede a `OrderAudit`** → XI **intacta** (no hace falta enmienda; BL-070 se cierra por diseño, no por
  cambio de constitution). Consecuencia asumida: 006 añade esa escritura (aditiva, sin cambiar su contrato ni su
  comportamiento observable) + **migración reversible** (columna nueva, Constitution M10).
- **Dispatcher no ve el motivo** (decidido en clarify): el campo se omite para dispatcher aunque vea el detalle.
- **Read-only**: cero mutaciones; el binario de evidencia (descarga) es #007-subida, fuera de alcance.
