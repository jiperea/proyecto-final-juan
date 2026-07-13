// Clasificador PROPIO de 005 (Foundational, compartido por start y execution). Puro (sin BD, sin SELECT
// propio → sin TOCTOU): recibe el snapshot re-leído DENTRO de la tx tras un UPDATE condicional de 0 filas y
// resuelve el 404-vs-422 con precedencia PERTENENCIA(404) → ESTADO(422).
//
// Divergencia deliberada respecto a classifyZeroRows de 002b (NOT_FOUND→VERSION→TRANSITION→GUARD), que NO se
// toca ni se reutiliza (H-001): aquí la pertenencia se evalúa ANTES que el estado, para no filtrar el estado de
// un recurso ajeno (no-enumeración, Constitution IV). El UPDATE de 005 keyea status+assigned_to (SIN version) →
// no hay rama de versión y VERSION_CONFLICT nunca surge (409 reservado a #008).
import { domainError, type DomainError } from '../../result';
import type { OrderStatus } from '../model';

/** Snapshot mínimo de la orden re-leída tras el 0-filas (pertenencia + estado). */
export interface OrderGuardSnapshot {
  readonly status: OrderStatus;
  readonly assignedTo: string | null;
}

/** Contexto de la transición intentada. `actorId` server-side (del token, FR-007). */
export interface ExecutionGuardContext {
  readonly actorId: string;
  readonly fromStatus: OrderStatus;
  readonly toStatus: OrderStatus;
}

/**
 * Clasifica un UPDATE de 0 filas. Precedencia estricta:
 *  1. inexistente (null)      → ORDER_NOT_FOUND (404).
 *  2. ajena (assigned_to≠actor) → GUARD_UNMET (404, no-enumeración; ANTES que el estado).
 *  3. propia pero 0 filas     → INVALID_TRANSITION (422): estado de origen no legal.
 * Sólo actúa sobre los códigos de RECURSO; el payload ya fue validado antes en el handler/dominio (FR-003).
 */
export function classifyExecutionGuard(
  current: OrderGuardSnapshot | null,
  ctx: ExecutionGuardContext,
): DomainError {
  if (current === null) {
    return domainError('ORDER_NOT_FOUND', 'La orden no existe.');
  }
  if (current.assignedTo !== ctx.actorId) {
    // Pertenencia antes que estado: orden ajena en CUALQUIER estado → 404 genérico (nunca 422).
    return domainError('GUARD_UNMET', 'La orden no existe.');
  }
  // Propia, pero el UPDATE (status=fromStatus AND assigned_to=actor) no afectó filas → estado no legal.
  return domainError('INVALID_TRANSITION', 'Transición de estado no permitida.');
}
