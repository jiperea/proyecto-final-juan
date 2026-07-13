# Feature Specification: Registro de ejecución por el técnico

**Feature Branch**: `005-registro-ejecucion`

**Created**: 2026-07-13

**Status**: Draft

**Input**: Brief Func #2 — "Registro de ejecución por parte del técnico, con al menos una foto de evidencia".
Roadmap #004. Un **technician** inicia el trabajo de **su** orden (`assigned→in_progress`) y **registra la
ejecución** (`in_progress→pending_review`) adjuntando **≥1 evidencia fotográfica válida** y notas. Reutiliza el
auth/RBAC de **001** y el patrón atómico + `OrderAudit` de **002b** (inamovibles).

> **Alcance MVP (Constitution XV — specs pequeñas)**: sólo las dos acciones del técnico y la **validación de
> evidencia por referencia**. El **transporte binario** de la foto (subida/almacenamiento/URLs firmadas) es una
> feature aparte del roadmap (**#007 / BL-068**), no se embebe aquí. Equivale a la entrada **"004 (ejecución)"**
> del roadmap; rama física `005-registro-ejecucion`.

## Clarifications

### Session 2026-07-13

- Q: ¿Quién puede iniciar/registrar y sobre qué órdenes? → A: **technician** sobre **su propia** orden
  (`assigned_to == actor`). Otro rol → 403; orden ajena o inexistente/estado no operable → **404** genérico
  (no-enumeración; hereda `GUARD_UNMET→404` fail-safe de 002b, FR-009). Reutiliza `applyTransition` (las
  transiciones `assigned→in_progress` e `in_progress→pending_review` ya son legales en la FSM de 002b).
- Q: ¿Cómo se modela la evidencia en el MVP? → A: **por referencia validada** (no transporte binario). El
  técnico envía ≥1 evidencia como **referencia/metadato** `{object_ref, content_type, size_bytes}`; el sistema
  valida **≥1 presente**, `content_type` en allowlist de imágenes y `size_bytes ≤` máximo. La evidencia se
  registra **append-only** asociada a la orden, en la **misma transacción** que la transición y la auditoría.
  Sin ≥1 evidencia válida **no** se puede pasar a `pending_review` (bloqueante, Brief "al menos una foto"). La
  subida binaria real se difiere a la feature #007 (BL-068).
- Q: ¿Notas del técnico? → A: **obligatorias** al registrar ejecución (rastro operativo + insumo del resumen
  IA de #006); texto pre-saneado, longitud acotada, **nunca** en logs ni en cuerpos de error.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Iniciar el trabajo (Priority: P1) 🎯 MVP

Un **technician** con una orden **asignada** a él empieza a trabajarla. La marca como "en progreso".

**Independent Test**: un technician autenticado inicia una orden `assigned` **suya** → **200**, la orden queda
`in_progress`, `version`+1 y hay **1** auditoría de la transición. Sobre orden ajena / no `assigned` / otro rol
→ rechazado sin efecto.

**Acceptance Scenarios**:

1. **Given** una orden `assigned` al technician T, **When** T la inicia, **Then** **200**, `status=in_progress`,
   `version`+1, 1 auditoría `transition` (`from_status=assigned`, `to_status=in_progress`, `actor=T`).
2. **Given** una orden `assigned` a **otro** técnico, **When** T intenta iniciarla, **Then** **404** genérico
   (no-enumeración), sin efecto.
3. **Given** una orden ya `in_progress`/`pending_review`/`closed`, **When** T intenta iniciarla, **Then** no se
   aplica (transición no legal): **404**/**422** según visibilidad, sin efecto.
4. **Given** un usuario **no technician** (dispatcher/supervisor), **When** intenta iniciar, **Then** **403**
   (`FORBIDDEN_ROLE`) sin efecto. Sin credenciales → **401**.

### User Story 2 - Registrar la ejecución con evidencia (Priority: P1) 🎯 MVP

Un **technician** termina el trabajo de su orden `in_progress` y **registra la ejecución**: adjunta **≥1 foto
de evidencia** (por referencia) y notas; la orden pasa a **revisión** (`pending_review`).

**Independent Test**: un technician registra la ejecución de su orden `in_progress` con 1 evidencia válida y
notas → **200**, `status=pending_review`, `version`+1, **1** auditoría de la transición y la(s) evidencia(s)
registradas. Sin evidencia válida, con evidencia inválida, o sobre orden ajena/estado incorrecto → rechazado
**sin efecto** (ni transición, ni evidencia huérfana).

**Acceptance Scenarios**:

1. **Given** una orden `in_progress` del technician T, **When** T registra la ejecución con ≥1 evidencia válida
   y notas, **Then** **200**, `status=pending_review`, `version`+1, 1 auditoría `transition`
   (`in_progress→pending_review`, con las notas como motivo) y **≥1** fila de evidencia asociada.
2. **Given** una orden `in_progress` de T, **When** registra **sin** evidencia (0 elementos), **Then** **422**
   (`EVIDENCE_REQUIRED`) sin efecto (no transiciona).
3. **Given** una orden `in_progress` de T, **When** una evidencia tiene `content_type` no permitido o
   `size_bytes` > máximo, **Then** **422** (`INVALID_EVIDENCE`) sin efecto.
4. **Given** una orden `in_progress` de T, **When** faltan/las notas son inválidas (vacías/whitespace/>máx),
   **Then** **422** (`VALIDATION_ERROR`) sin efecto.
5. **Given** una orden `in_progress` de **otro** técnico, **When** T registra ejecución, **Then** **404**
   genérico sin efecto.
6. **Given** una orden `assigned` (aún no iniciada) o `pending_review`/`closed`, **When** T registra ejecución,
   **Then** transición no legal → **404**/**422** sin efecto.

### Edge Cases

- **Fallo a mitad** (p.ej. la inserción de evidencia o auditoría falla): la transición **revierte** por
  completo — la orden **no** queda en `pending_review` sin su evidencia/auditoría (atomicidad todo-o-nada).
- **Notas con PII**: nunca se serializan en logs ni en cuerpos de error (residual heredado; ver Assumptions).
- **Error de base de datos**: → **500 genérico** sin filtrar detalle de Postgres.

## Requirements *(mandatory)*

### Functional Requirements (EARS)

- **FR-001** *(iniciar trabajo)*: WHEN un technician autenticado inicia **su** orden en estado `assigned`, THE
  sistema SHALL transicionar a `in_progress`, incrementar `version` en 1 e insertar auditoría de la transición,
  respondiendo **200** con la orden actualizada. Reutiliza `applyTransition` (patrón atómico de 002b).
- **FR-002** *(registrar ejecución)*: WHEN un technician autenticado registra la ejecución de **su** orden en
  estado `in_progress` con **≥1 evidencia válida** y **notas válidas**, THE sistema SHALL, en **una sola
  transacción**: transicionar a `pending_review`, incrementar `version`, registrar la(s) evidencia(s)
  (append-only) e insertar auditoría (con las notas como motivo), respondiendo **200**.
- **FR-003** *(RBAC technician + pertenencia)*: WHEN quien solicita **no** está autenticado → **401**; WHEN su
  rol **no es technician** → **403** (`FORBIDDEN_ROLE`); WHEN la orden **no existe**, **no es suya**
  (`assigned_to ≠ actor`) o no es visible → **404** genérico indistinguible (no-enumeración, `GUARD_UNMET→404`
  fail-safe de 002b/FR-009). La pertenencia se resuelve en backend, nunca desde el cliente.
- **FR-004** *(evidencia validada, bloqueante)*: WHEN al registrar ejecución **no** hay al menos una evidencia
  → **422** (`EVIDENCE_REQUIRED`); WHEN alguna evidencia tiene `content_type` fuera de la allowlist de imágenes
  o `size_bytes` mayor que el máximo → **422** (`INVALID_EVIDENCE`). Sin ≥1 evidencia válida la transición a
  `pending_review` **no** ocurre. La evidencia se valida **por referencia/metadato** (el transporte binario es
  la feature #007).
- **FR-005** *(notas válidas y saneadas)*: WHEN las notas faltan, están vacías/whitespace o superan la longitud
  máxima → **422** (`VALIDATION_ERROR`). Las notas son **operativas**, pre-saneadas y **nunca** aparecen en
  logs ni en cuerpos de error.
- **FR-006** *(atomicidad + append-only)*: THE transición, el registro de evidencia y la auditoría SHALL
  aplicarse en **una sola transacción** (todo o nada); si algún paso falla, **revierte** por completo (sin
  evidencia ni auditoría huérfanas). La auditoría y la evidencia son **append-only inmutables** (trigger de BD).
  `status`/`version` sólo se mutan desde el **módulo write-side del dominio** (verificable por test de
  arquitectura).
- **FR-007** *(actor infalsificable)*: THE `actor_id` (auditoría) y el `uploaded_by` (evidencia) SHALL
  derivarse **exclusivamente** del token verificado server-side, **nunca** de un parámetro de la request.
- **FR-008** *(saneo de errores)*: WHEN se produce un error de base de datos, THE sistema SHALL responder
  **500** con cuerpo **genérico** `{code, message, agent_action}` **sin** filtrar detalle de Postgres.

*Contrato de errores uniforme: `{code, message, details?, agent_action}` con el HTTP correcto; notas y detalle
de BD nunca aparecen en el cuerpo de error.*

### Key Entities *(include if feature involves data)*

- **Order** (existente): se muta `status` (`assigned→in_progress`, `in_progress→pending_review`) y `version`.
- **OrderAudit** (existente, 002b — append-only): 1 fila `transition` por cada transición; en la ejecución, las
  **notas** van en `reason`.
- **OrderEvidence** (nueva, append-only inmutable): referencia de evidencia asociada a la orden/ejecución.
  Campos: `{id, order_id (FK), object_ref, content_type, size_bytes, uploaded_by (FK→User), at}`. Trigger
  append-only (como `OrderAudit`). El **binario** no se almacena aquí (feature #007); sólo la referencia+metadato.
- **User** (existente, 001): el actor debe ser **technician** y **dueño** de la orden.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001** *(iniciar trabajo)*: el 100% de los inicios válidos responden **200**, dejan la orden
  `in_progress`, `version`+1 y crean **1** auditoría de la transición.
- **SC-002** *(registrar ejecución)*: el 100% de los registros válidos responden **200**, dejan la orden
  `pending_review`, `version`+1, crean **1** auditoría (con notas) y **≥1** fila de evidencia asociada.
- **SC-003** *(RBAC + pertenencia)*: el 100% de los casos responden el código correcto: sin auth → **401**; rol
  ≠ technician → **403**; orden ajena/inexistente/no operable → **404** genérico indistinguible; sin efecto.
- **SC-004** *(evidencia bloqueante)*: el 100% de los registros **sin** ≥1 evidencia válida responden **422**
  (`EVIDENCE_REQUIRED`/`INVALID_EVIDENCE`) y la orden **no** transiciona.
- **SC-005** *(notas inválidas)*: el 100% de los registros con notas ausentes/vacías/>máx responden **422**
  (`VALIDATION_ERROR`), sin efecto.
- **SC-006** *(atomicidad)*: WHEN se fuerza el fallo del registro de evidencia o de la auditoría, THE orden **no**
  transiciona (status/version intactos; 0 evidencias y 0 auditorías nuevas de ese intento).
- **SC-007** *(no-fuga de notas)*: WHEN se registra con notas centinela, THE valor **no aparece** en ningún log
  ni en el cuerpo de la respuesta de error (grep negativo).
- **SC-008** *(saneo de errores de BD)*: WHEN se fuerza un error de BD, THE respuesta es **500** genérica sin
  SQLSTATE/constraint/columna/query.
- **SC-009** *(latencia)*: el p95 (happy path, BD de test local caliente, 50 peticiones secuenciales,
  nearest-rank) responde en **< 300 ms**; correlation-ID presente en respuesta y logs.

> Cada SC es **medible** (Vitest + Supertest contra Postgres real). Sin componente IA → sin eval de promptfoo.

## Contrato (OpenAPI) *(obligatorio — Constitution II)*

Contract-first: se **extiende** `contracts/orders.openapi.yaml`. Endpoints (operationId → método ruta → rol):

- `startOrderWork` — `POST /v1/orders/{orderId}/start` — rol `technician` — respuestas 200/401/403/404/422/500.
- `submitOrderExecution` — `POST /v1/orders/{orderId}/execution` — rol `technician` —
  cuerpo `{ notes (string 1..N), evidence: [{ object_ref (string), content_type (string), size_bytes (int) }] (≥1) }`
  — respuestas 200/401/403/404/422/500.
- Errores `{ code, message, details?, agent_action }`; notas/detalle de BD nunca en el cuerpo de error.
- *(Método/ruta definitivos confirmables en plan. Sin `409`/`If-Match` en el MVP.)*

## Trazabilidad (RF → endpoint → tarea → test) *(obligatorio — Constitution VI)*

Se sincroniza en `docs/traceability.md` (Polish). FR-001 → `startOrderWork`; FR-002/004/005/006 →
`submitOrderExecution`; FR-003/007/008 → ambos. SC-001..009 → tests de contrato/integración/unidad.

## Assumptions

- **Reutiliza**: RBAC/401-403/contrato de errores de **001**; `applyTransition`/`OrderAudit`/trigger
  append-only/patrón atómico y no-enumeración (`GUARD_UNMET→404`) de **002b**; `Order`/`version` de 002a.
  001/002 **inamovibles**; `OrderEvidence` es **aditiva**.
- **Módulo write-side**: las nuevas transiciones se aplican vía el módulo write-side (`applyTransition`); el
  registro de evidencia es append-only en la misma transacción. Test de arquitectura: `status`/`version` sólo
  se mutan ahí.
- **Evidencia = referencia validada** en el MVP (`object_ref` + `content_type` + `size_bytes`); allowlist de
  imágenes y tamaño máximo (valores concretos en plan/clarify). El **transporte binario** es la feature **#007**
  (BL-068), no este MVP.
- **Notas**: pre-saneadas por esta feature; PII cruda es residual heredado (cifrado/purga = BL-051/055, fuera).
- **Sin API de pago**: verificación 100% determinista (Vitest + Supertest + Postgres docker-compose de test);
  sin IA → sin promptfoo.

## Scope

**Dentro (MVP)**: dos endpoints (`startOrderWork`, `submitOrderExecution`) bajo `/v1`; RBAC technician +
pertenencia (401/403/404/422/500); transiciones `assigned→in_progress` e `in_progress→pending_review` atómicas
con auditoría; **validación de evidencia por referencia** (≥1, allowlist de tipo, tamaño máx; bloqueante); notas
obligatorias y saneadas; entidad `OrderEvidence` append-only; actor server-side; correlation-ID; latencia
cuantificada.

**Fuera / Stretch (aislado por XV — planificado en el roadmap, no embebido)**:

- **Subida binaria de la evidencia** (multipart, almacenamiento de objetos, URLs firmadas ≤300 s, minimización
  de PII del binario) → **feature #007 del roadmap / BL-068**.
- **Endurecimiento write-side** (If-Match/409, paridad de latencia/cabeceras, mapeo fino de errores de BD) →
  **feature #008 / BL-001/061-066**.
- **Auditoría forense de accesos denegados** (XI) → **feature #009 / BL-002/067**. Evidencia versionada por
  intento → stretch.
- Aprobar/rechazar en revisión (roadmap #005), resumen IA (roadmap #006), reapertura, creación de órdenes,
  notificaciones, multi-tenant.
