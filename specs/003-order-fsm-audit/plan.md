# Implementation Plan: Order FSM + auditoría append-only (002b)

**Branch**: `003-order-fsm-audit` | **Date**: 2026-07-11 | **Spec**: [spec.md](./spec.md)

## Summary

Maquinaria write-side de la Fundación B: **FSM** (tabla de transiciones legales) + `applyTransition`
(dominio) que aplica el cambio de estado con **concurrencia optimista** (UPDATE condicional atómico por
`version` + guardas de pertenencia inyectables) y **auditoría append-only** en la **misma transacción**.
Sin endpoint HTTP (lo consumen 003/004/005). Hexagonal, TDD contra Postgres real. Reutiliza 001/002a.

## Technical Context

**Language/Version**: TS 5 strict · Node 18+ (Docker) · **Stack**: Prisma (PostgreSQL 16, `$transaction`
interactiva para atomicidad), Vitest. Reutiliza error-mapper/logger/config de 001 y `Order`/`version` de 002a.

**Constraints**: `status`/`version` sólo mutan vía `applyTransition` (único punto de escritura, FR-006);
`OrderAudit` **append-only a nivel de BD** (REVOKE UPDATE/DELETE); `reason` pre-saneado, nunca en logs/errores
(FR-008); atomicidad todo-o-nada (FR-004); concurrencia = correctness (no lost-update), If-Match stretch (003/004).

## Constitution Check

- **Hexagonal (III)**: [x] `domain/order` (FSM `transition-table`, `applyTransition`, puerto de transición) sin
  infra; `infra` (repo Prisma con `$transaction`). Test de arquitectura: `domain/order` no importa infra +
  único punto de escritura de `status`.
- **Contract-First (II)**: [~] **N/A** — 002b no expone interfaz HTTP (dominio puro); los contratos OpenAPI
  llegan con los endpoints de 003/004/005. Justificado por alcance (XV).
- **Auditoría/estados (XI)**: [x] FSM explícita (tabla) + auditoría atómica de transiciones append-only;
  `reason` saneado por el llamador (Const. XI). Accesos denegados = entidad separada (BL-052).
- **TDD/Calidad (VI, VII)**: [x] TDD Red→Green; verificación dominio+repo contra Postgres real (sin mock de ORM);
  trazabilidad RF→tarea→test.
- **Concurrencia optimista**: [~] la **consistencia por `version`** es correctness (mandatory); la **exposición
  If-Match→409** al cliente sigue *stretch* (003/004). Reconciliación textual del constitution → BL-050.
- **XV**: [x] slice pequeño (maquinaria); casos de negocio en 003/004/005.

**Veredicto**: PASA. Desviaciones (contract-first N/A; concurrencia correctness vs stretch) documentadas arriba.

## Project Structure

```text
backend/src/
├── domain/order/         # transition-table (FSM), apply-transition (use case), transition ports/errors
└── infra/repositories/   # order-transition-repository (Prisma $transaction: UPDATE condicional + insert audit)
backend/prisma/           # schema (+ OrderAudit + REVOKE UPDATE/DELETE en migración), sin cambios de Order
```

## Phase 0 → research.md ✅ · Phase 1 → data-model.md · quickstart.md ✅ (contracts N/A)

Siguiente: `/speckit-tasks` → `/speckit-analyze` (**G2**).
