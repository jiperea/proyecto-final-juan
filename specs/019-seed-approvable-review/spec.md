# Feature Specification: Semilla de una orden pending_review aprobable (demostrable de origen)

**Feature Branch**: `019-seed-approvable-review`

**Created**: 2026-07-15

**Status**: Draft

**Input**: "Añadir al seed una orden pending_review CON evidencia para que el flujo aprobar del supervisor sea demostrable desde un arranque limpio (mini-fix, su propia rama)."

---

## Contexto y motivación *(no normativo)*

Verificado en vivo (2026-07-15): el flujo aprobar/rechazar del supervisor **funciona**, pero con los datos
semilla actuales **ninguna** orden `pending_review` tiene evidencia, y aprobar exige ≥1 evidencia
(guard `EVIDENCE_MISSING`, feature 006). Por eso, desde un arranque limpio, no se puede **demostrar**
"aprobar" sin ejecutar antes el paso del técnico. Esta feature siembra una orden `pending_review` de
technician1 **con evidencia + su audit de ejecución**, de modo que el supervisor pueda aprobarla de origen.

No cambia lógica de negocio, contratos ni RBAC: es exclusivamente **datos semilla** para demostrabilidad.

> **Paridad con 005 — PARCIAL y deliberada (H-003):** esta feature hace que **la orden ancla**
> `approvableReview` cumpla `pending_review ⇒ evidenceCount≥1`, **no** todas las órdenes semilla. Las otras
> `pending_review` (la anónima de technician1 y `tech2PendingReview`) siguen **sin evidencia a propósito**,
> para poder seguir demostrando el **409 `EVIDENCE_MISSING`** y el escenario IDOR. No se debe asumir el
> invariante de forma global sobre el seed.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Aprobar demostrable desde arranque limpio (Priority: P1)

Tras `migrate + seed` en una BD limpia, un supervisor entra, ve una orden en `pending_review` **con
evidencia**, y la **aprueba → `closed`** sin ningún paso previo.

**Independent Test**: seed en BD fresca → `POST /orders/{approvableReview}/review {approve}` por el
supervisor devuelve **200 closed** (no 409 `EVIDENCE_MISSING`).

**Acceptance Scenarios**:

1. **Given** BD recién sembrada, **When** el supervisor lista órdenes, **Then** ve la orden ancla
   `approvableReview` en `pending_review`.
2. **Given** esa orden, **When** el supervisor la aprueba, **Then** 200 y pasa a `closed` (approve real
   cubierto genéricamente por `review-order-approve` + demo en vivo; la **precondición** de la ancla la
   verifica un test dedicado, SC-001).
3. **Given** la suite de backend (unit/integration/contract), **When** se ejecuta con el seed nuevo,
   **Then** sigue en **verde**.

### Edge Cases

- **Append-only + re-seed (H-001)**: `order_evidence`/`order_audit`/`order_execution_notes` prohíben DELETE
  (trigger) y su FK a `Order` es `Restrict`; tras 019, `order.deleteMany()` de un segundo `npm run seed`
  fallaría (P2003). El seed **detecta** BD no vacía (hay `OrderAudit`) y **aborta con un mensaje accionable**
  (`prisma migrate reset --force --skip-seed && tsx prisma/seed.ts`), no un stack trace críptico. `db-test`
  es efímera → siempre fresca.
- **Invariante version↔auditoría (H-002)**: la ancla tiene 1 transición auditada, luego se siembra con
  `version=1` (no 0), coherente con el resto del sistema.
- **Conteo**: el supervisor ve **+1** `pending_review`; technician1 **+1** activa. En la práctica **ningún
  assert de conteo exacto** necesitó cambiarse (los tests de scope usan pertenencia/`>0`, no totales); si
  alguno lo necesitara, **solo** puede cambiar el valor numérico, **nunca** relajar una aserción de
  pertenencia/RBAC/IDOR.

## Requirements *(mandatory)*

- **FR-001**: WHEN se ejecuta el seed sobre una BD limpia THE seed SHALL crear una orden `pending_review`
  de technician1 (ancla `SEED_ORDERS.approvableReview`, `version=1`) con **exactamente 1 `OrderEvidence`**
  y **exactamente 1 `OrderExecutionNotes`**, ambas enlazadas a **1 `OrderAudit`** de transición
  `in_progress→pending_review`.
- **FR-002**: WHEN el supervisor aprueba esa orden THE sistema SHALL responder **200** y transicionar a
  `closed` (sin `EVIDENCE_MISSING`), demostrando la postcondición `pending_review ⇒ evidenceCount≥1`.
- **FR-003**: El seed SHALL **no** intentar `DELETE` sobre tablas append-only; y WHEN la BD no está vacía
  (existe ≥1 `OrderAudit`) THE seed SHALL **abortar con un mensaje accionable** que indique
  `prisma migrate reset --force --skip-seed` (no un P2003 críptico).
- **FR-004**: La suite de backend (unit/integration/contract) SHALL quedar en **verde** con el seed nuevo.
  En la práctica **ningún assert de conteo exacto** requirió cambio (los tests de scope usan
  pertenencia/`>0`); si alguno lo requiriese, **solo** puede cambiar el valor de conteo, **nunca** relajar
  una aserción de pertenencia/RBAC/IDOR. Rutas de producción intocables: `contracts/`, `backend/src/domain/`,
  middlewares de auth (verificable por `git diff --name-only`).
- **FR-005**: Sin cambios de contrato, dominio, RBAC ni proveedor IA (solo `backend/prisma/` + tests + docs).

## Success Criteria *(mandatory)*

- **SC-001**: Un test de integración (`seed-approvable-review.spec.ts`) sobre la BD sembrada verifica que la
  ancla `approvableReview` está en `pending_review`, de technician1, `version=1`, con **exactamente 1**
  evidencia + **1** notas enlazadas a **1** audit de transición `in_progress→pending_review`; que el guard de
  re-seed aborta (FR-003); y que el **supervisor la aprueba → 200 `closed`** (FR-002, approve real).
- **SC-002**: `npx vitest run` del backend termina en verde (0 regresiones).
- **SC-003**: `tsc`/`eslint` del backend en verde.

## Assumptions

- Es un cambio de **fixtures de demostración** (`backend/prisma/`); el incremento de conteo es intencional.
  No se toca ninguna aserción de RBAC/pertenencia. La paridad con 005 es **parcial** (solo la ancla; ver
  Contexto). `db-test` es efímera (siempre fresca); el dev main se re-siembra con `migrate reset`.
