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

No cambia lógica de negocio, contratos ni RBAC: es exclusivamente **datos semilla** para demostrabilidad
(y paridad con la postcondición de 005: `pending_review ⇒ evidenceCount≥1`).

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
2. **Given** esa orden, **When** el supervisor la aprueba, **Then** 200 y pasa a `closed`.
3. **Given** la suite de backend (unit/integration/contract), **When** se ejecuta con el seed nuevo,
   **Then** sigue en **verde** (los asserts de conteo por rol se ajustan al nuevo total documentado).

### Edge Cases

- **Append-only**: `order_evidence`/`order_audit`/`order_execution_notes` prohíben DELETE por trigger de BD;
  el seed asume tablas vacías (así corre `db-test`, efímera). **Re-sembrar** una BD dev con datos previos
  requiere `prisma migrate reset --force` (no `deleteMany`).
- **Conteo**: el supervisor pasa a ver **+1** `pending_review`; technician1 **+1** activa. Los tests de
  conteo por rol se actualizan a los totales nuevos (único cambio permitido en esos tests).

## Requirements *(mandatory)*

- **FR-001**: WHEN se ejecuta el seed sobre una BD limpia THE seed SHALL crear una orden `pending_review`
  de technician1 (ancla `SEED_ORDERS.approvableReview`) con **≥1 `OrderEvidence`** enlazada a un
  **`OrderAudit`** de transición `in_progress→pending_review` y sus `OrderExecutionNotes`.
- **FR-002**: WHEN el supervisor aprueba esa orden THE sistema SHALL responder **200** y transicionar a
  `closed` (sin `EVIDENCE_MISSING`), demostrando la postcondición `pending_review ⇒ evidenceCount≥1`.
- **FR-003**: El seed SHALL **no** intentar `DELETE` sobre tablas append-only (evidencia/audit/notas);
  documenta que el re-seed de una BD con datos usa `migrate reset`.
- **FR-004**: La suite de backend (unit/integration/contract) SHALL quedar en **verde** con el seed nuevo;
  los asserts de conteo por rol afectados se ajustan a los totales nuevos (sin cambiar aserciones de RBAC).
- **FR-005**: Sin cambios de contrato, dominio, RBAC ni proveedor IA.

## Success Criteria *(mandatory)*

- **SC-001**: En BD fresca sembrada, aprobar la orden ancla devuelve 200 `closed` (test de integración).
- **SC-002**: `npx vitest run` del backend termina en verde (0 regresiones tras ajustar conteos).
- **SC-003**: `tsc`/`eslint` del backend en verde.

## Assumptions

- Es un cambio de **fixtures de demostración**; el incremento de conteo es intencional y se refleja en los
  tests de conteo por rol. No se toca ninguna aserción de RBAC/comportamiento.
