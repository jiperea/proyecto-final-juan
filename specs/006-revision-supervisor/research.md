# Research — 006 Revisión por el supervisor (Phase 0)

Technical Context sin `NEEDS CLARIFICATION` (stack heredado de 001–005, inamovible). Se documentan las
decisiones de diseño con impacto, todas derivadas de la spec (G1 PASS) y del código existente.

## D1 — Un endpoint (`reviewOrder`) vs dos (`approveOrder`/`rejectOrder`)

- **Decisión**: **un** endpoint `POST /v1/orders/{orderId}/review` con `{ decision: approve|reject, reason? }`.
- **Rationale**: aprobar y rechazar comparten RBAC, precedencia de errores, atomicidad y auditoría; un solo
  endpoint evita duplicar el pipeline y mantiene una única superficie de contrato/tests. La variación (estado
  destino, obligatoriedad del motivo, guard de evidencia) se decide por `decision` en el dominio puro.
- **Alternativas**: dos operaciones (más "REST-y" pero duplican handler/validación/contract-tests sin beneficio;
  el reto valora simplicidad y specs pequeñas, XV).

## D2 — Reutilizar `applyTransition` de 002b vs módulo write-side propio de 006

- **Decisión**: **módulo propio** (`review-order.ts` + `classify-review-guard.ts`), como hizo 005; NO se invoca
  `applyTransition`/`classifyZeroRows` de 002b (quedan intactos).
- **Rationale**: la clasificación post-0-filas de 006 es **state-scoped** (visibilidad = `pending_review`) y
  añade un guard de evidencia (409) que 002b no contempla. Forzar `applyTransition` mezclaría semánticas. La FSM
  (`transition-table.ts`) sí se reutiliza como fuente de verdad de legalidad (`pending_review→closed` y
  `→in_progress` ya legales, verificado en 003).
- **Alternativas**: extender `applyTransition` con parámetros de clasificación/guard → acopla y arriesga
  regresión en 002b/003/004 (ya en verde).

## D3 — Clasificación de errores post-0-filas y precedencia

- **Decisión**: UPDATE condicional. En `reject` keyea `id + status='pending_review'`. En `approve` keyea además
  la existencia de evidencia como **filtro de relación** (`evidence:{ some:{} }`) — el guard va **dentro** del
  UPDATE, no como `COUNT` previo. Si **0 filas**, **re-lectura** del snapshot `{status, evidenceCount}` (sin
  SELECT previo → sin TOCTOU) y `classifyReviewGuard` clasifica con **404 antes que 409**: no existe/`status ≠
  pending_review` → **404** (GUARD_UNMET, no-enumeración); `pending_review` con `evidenceCount=0` (sólo approve)
  → **409 EVIDENCE_MISSING**. Precedencia global: `401→403→422(VALIDATION_ERROR)→422(INVALID_REASON)→404→409`.
  **Clave (G2/K1)**: el guard **no** puede ser un `COUNT` previo al UPDATE, porque `COUNT=0` no distingue "orden
  no visible" de "visible sin evidencia" → devolvería 409 antes que 404 (fuga de enumeración). Plegarlo en el
  WHERE + clasificar por estado lo evita.
- **(G2/H-003) Rama por-defecto del clasificador**: `classifyReviewGuard` sólo emite 404 (no visible) o 409
  (approve + evidenceCount=0). Cualquier snapshot re-leído que **no** encaje (p. ej. `{pending_review,
  evidenceCount≥1}` porque una tx concurrente dejó la orden "aprobable" entre el UPDATE-0-filas y la re-lectura)
  cae en una **rama por-defecto fail-safe → 404 `GUARD_UNMET`** (nunca 500, nunca filtra estado). Determinista y
  fail-safe, coherente con el edge case "doble decisión/carrera" de la spec.
- **Rationale**: coherente con 005 (payload antes que recurso; el 422 de payload no correlaciona con el recurso).
  El supervisor no tiene pertenencia; su visibilidad es puramente de estado (`listOrders` supervisor =
  `pending_review`), así que "estado ≠ pending_review" = "no visible" = 404 (regla (a) de 003 FR-009), no 403.
  El 409 va al final porque sólo aplica a una orden ya resuelta como visible.
- **Alternativas**: 403 para estado no legal (rechazada: filtra existencia/estado, rompe no-enumeración); 422
  para "no pending_review" (rechazada por la misma razón; ese 422 sería correlacionable con el recurso).

## D4 — Código HTTP del guard de evidencia (FR-013)

- **Decisión**: **409 CONFLICT** `EVIDENCE_MISSING`.
- **Rationale**: la orden es visible y está en `pending_review` (pasó el 404), pero su estado de datos
  (0 evidencias) **entra en conflicto** con la precondición de aprobación (invariante de 005 rota). 409 comunica
  "conflicto con el estado del recurso, re-lee", accionable y testeable. No es 404 (la orden sí es visible), no
  es 422 (no es un problema del payload), no es 500 (no es un fallo interno opaco: es una condición de negocio
  detectable). Decidido en la ronda 2 de remediación G1 (cerró el bloqueante T-001).
- **Alternativas**: 500 (oculta una condición diagnosticable como bug interno); 422 (implica payload inválido,
  que no lo es).

## D5 — Almacenamiento del motivo y saneo

- **Decisión**: `OrderAudit.reason` (pre-saneado por 006 vía `sanitizeReason`), **sin** entidad nueva. Rechazo:
  obligatorio; aprobación: opcional pero, si presente, validado idéntico (1–1000 code points tras saneo).
- **Rationale**: el motivo **es** el motivo de la transición — uso canónico de `OrderAudit.reason` (diseñado en
  002b/003 como texto pre-saneado por el llamador). Distinto de las *notas* de ejecución de 005 (artefacto rico,
  entidad aparte). `sanitizeReason` = trim + colapso de whitespace interno + strip de control chars Cc
  (`U+0000`–`U+001F`, `U+007F`) salvo `\n` + NFC; "vacío tras saneo" = longitud 0.
- **Alternativas**: entidad `OrderReviewNotes` separada (rechazada: sobredimensiona; el motivo no es PII rica sino
  motivo de transición). Cifrado at-rest → diferido a BL-051 (transversal a toda la columna).

## D6 — Atomicidad y conservación de evidencia/notas

- **Decisión**: una `$transaction` interactiva: (approve) UPDATE condicional con `evidence:{some:{}}` en el WHERE
  → si 1 fila, insert `OrderAudit`; si 0, clasificar (404 antes que 409). (reject) UPDATE `status=pending_review`
  → insert `OrderAudit`. Nunca se tocan `order_evidence`/`order_execution_notes`.
- **Rationale**: FR-004 (todo-o-nada) + FR-005 (conservación). La existencia de evidencia va **en el WHERE del
  UPDATE** (no como SELECT/COUNT previo) para que sea atómica con la transición y para no anteponer el 409 al 404.
- **Alternativas**: `COUNT` previo al UPDATE (rechazado, G2/K1: antepone 409 a 404, fuga de enumeración); SELECT
  de evidencia fuera de la transacción (rechazado: TOCTOU con una purga concurrente).

## D7 — Concurrencia / doble decisión

- **Decisión**: sin `If-Match`/409-optimista (MVP). El UPDATE condicional (`status='pending_review'` en WHERE)
  hace que la 2ª decisión concurrente encuentre 0 filas → 404. `version` se incrementa (no se compara).
- **Rationale**: fail-safe suficiente para el MVP; la semántica optimista de cara al cliente es #008 (BL-001).
- **Alternativas**: If-Match/ETag ahora → fuera de alcance (XV/#008).

## D8 — Atomicidad del guard de evidencia en `updateMany` (G2/H-002)

- **Decisión**: la existencia de ≥1 evidencia en `approve` se expresa como filtro de relación
  `updateMany({ where:{ id, status:'pending_review', evidence:{ some:{} } }, … })`, que **debe** compilar a
  **una sola sentencia SQL atómica** `UPDATE orders SET … WHERE id=$1 AND status='pending_review' AND EXISTS
  (SELECT 1 FROM order_evidence WHERE order_id = orders.id) …` — **sin** un `SELECT`/`COUNT` previo separado.
- **Rationale**: sólo así el guard es atómico con la transición y no reintroduce TOCTOU (la garantía central del
  fix de K1). Prisma traduce los filtros de relación (`some`) a subconsultas correlacionadas `EXISTS` en el
  `WHERE` del `UPDATE`.
- **Verificación (obligatoria en test)**: activar el query log de Prisma en el test de integración y comprobar
  que se emite **una** sentencia `UPDATE … EXISTS(…)`, no dos.
- **Fallback**: si la versión de Prisma/driver no compilara atómicamente el filtro de relación en `updateMany`,
  usar `$executeRaw` con el `UPDATE … WHERE status='pending_review' AND EXISTS(…)` escrito a mano.
- **Aislamiento**: la `$transaction` corre en el nivel por defecto de Prisma (**READ COMMITTED**); la re-lectura
  del snapshot (sólo en el camino 0-filas) ocurre **dentro** de la misma transacción. Bajo carrera el resultado
  es determinista y **fail-safe** (rama por-defecto del clasificador → 404, ver D3).
