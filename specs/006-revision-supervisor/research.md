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

- **Decisión**: UPDATE condicional keyeando `id + status='pending_review'`. Si 0 filas, **re-lectura** (sin
  SELECT previo → sin TOCTOU) para clasificar: no existe/no `pending_review` → **404 genérico** (GUARD_UNMET,
  no-enumeración). En `approve`, tras confirmar visibilidad, guard `COUNT(order_evidence) ≥ 1`; si 0 → **409
  EVIDENCE_REQUIRED**. Precedencia global: `401→403→422(VALIDATION_ERROR: decision/body)→422(INVALID_REASON:
  motivo)→404→409`.
- **Rationale**: coherente con 005 (payload antes que recurso; el 422 de payload no correlaciona con el recurso).
  El supervisor no tiene pertenencia; su visibilidad es puramente de estado (`listOrders` supervisor =
  `pending_review`), así que "estado ≠ pending_review" = "no visible" = 404 (regla (a) de 003 FR-009), no 403.
  El 409 va al final porque sólo aplica a una orden ya resuelta como visible.
- **Alternativas**: 403 para estado no legal (rechazada: filtra existencia/estado, rompe no-enumeración); 422
  para "no pending_review" (rechazada por la misma razón; ese 422 sería correlacionable con el recurso).

## D4 — Código HTTP del guard de evidencia (FR-013)

- **Decisión**: **409 CONFLICT** `EVIDENCE_REQUIRED`.
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

- **Decisión**: una `$transaction` interactiva: (approve) guard evidencia → UPDATE `status`/`version` → insert
  `OrderAudit`; (reject) UPDATE → insert `OrderAudit`. Nunca se tocan `order_evidence`/`order_execution_notes`.
- **Rationale**: FR-004 (todo-o-nada) + FR-005 (conservación). El guard de evidencia va dentro de la misma
  transacción que la aprobación para que la decisión sea consistente con el estado leído.
- **Alternativas**: SELECT de evidencia fuera de la transacción (rechazado: TOCTOU con una purga concurrente).

## D7 — Concurrencia / doble decisión

- **Decisión**: sin `If-Match`/409-optimista (MVP). El UPDATE condicional (`status='pending_review'` en WHERE)
  hace que la 2ª decisión concurrente encuentre 0 filas → 404. `version` se incrementa (no se compara).
- **Rationale**: fail-safe suficiente para el MVP; la semántica optimista de cara al cliente es #008 (BL-001).
- **Alternativas**: If-Match/ETag ahora → fuera de alcance (XV/#008).
