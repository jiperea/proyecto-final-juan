// Clasificador PROPIO de 006 (revisión del supervisor). Puro (sin BD, sin SELECT propio → sin TOCTOU): recibe
// el snapshot `{status, evidenceCount}` re-leído DENTRO de la tx tras un UPDATE condicional de 0 filas y
// resuelve el código con precedencia estricta VISIBILIDAD(404) → EVIDENCIA(409). NO reutiliza ni altera
// classifyZeroRows/classifyExecutionGuard de 002b/005.
//
// La visibilidad del supervisor es STATE-SCOPED a `pending_review` (listOrders): una orden en otro estado NO es
// visible → 404 (regla (a) de 003 FR-009, no 403). El guard de evidencia (409) es un SUELO DE INTEGRIDAD y sólo
// aplica a `approve`; va DESPUÉS del 404 (una orden no visible nunca devuelve 409, G2/K1). Rama por-defecto
// fail-safe → 404 (G2/H-003): cualquier snapshot que "debería haber tenido éxito" (p. ej. pending_review con
// evidencia, por carrera entre el UPDATE-0-filas y la re-lectura) se trata como no-visible, nunca 500 ni fuga.
import { domainError, type DomainError } from '../../result';
import type { OrderStatus } from '../model';

export type ReviewDecision = 'approve' | 'reject';

/** Snapshot mínimo re-leído tras el 0-filas: estado + conteo de evidencia (no el `object_ref`, PII). */
export interface ReviewGuardSnapshot {
  readonly status: OrderStatus;
  readonly evidenceCount: number;
}

/** Contexto de la decisión. */
export interface ReviewGuardContext {
  readonly decision: ReviewDecision;
}

const REVIEWABLE: OrderStatus = 'pending_review';

export function classifyReviewGuard(
  current: ReviewGuardSnapshot | null,
  ctx: ReviewGuardContext,
): DomainError {
  // 1. Inexistente o NO visible (estado ≠ pending_review) → 404 genérico (no-enumeración). Precede a todo.
  if (current === null || current.status !== REVIEWABLE) {
    return domainError('GUARD_UNMET', 'La orden no existe.');
  }
  // 2. Visible en pending_review pero SIN evidencia, y es una aprobación → 409 (suelo de integridad, FR-013).
  if (ctx.decision === 'approve' && current.evidenceCount === 0) {
    return domainError('EVIDENCE_MISSING', 'La orden no conserva evidencia para aprobarse.', {
      agentAction: 'La orden no tiene evidencia registrada; no puede aprobarse.',
    });
  }
  // 3. Por-defecto fail-safe (p. ej. pending_review con evidencia por carrera): trátalo como no-visible → 404.
  //    Nunca 500, nunca filtra el estado real (G2/H-003).
  return domainError('GUARD_UNMET', 'La orden no existe.');
}
