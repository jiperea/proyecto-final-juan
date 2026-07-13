// Caso de uso de dominio: revisión del supervisor (006). Módulo write-side PROPIO de 006 (no reutiliza
// applyTransition de 002b). Puro: decide el estado destino por `decision` (switch EXHAUSTIVO, TS `never`, G2/K5),
// valida el motivo (obligatorio en reject; opcional en approve — mismas reglas si se aporta, FR-008) y delega la
// mutación atómica + clasificación del 0-filas en el puerto propio de 006. El actor viene server-side (token,
// FR-012); nunca del body.
import { domainError, err, type Result } from '../../result';
import type { OrderRecord } from '../model';
import { validateReason } from './sanitize-reason';
import type { ReviewDecision, ReviewOrderPort } from './write-side-ports';

export interface ReviewOrderDeps {
  readonly review: ReviewOrderPort;
}

export interface ReviewOrderInput {
  readonly orderId: string;
  /** Actor server-side (del token). */
  readonly actorId: string;
  readonly decision: ReviewDecision;
  /** Motivo crudo del body (puede faltar); se sanea/valida aquí. */
  readonly reason?: string | null;
}

function assertNever(x: never): never {
  throw new Error(`decision no soportada: ${String(x)}`);
}

/**
 * Valida el motivo del PAYLOAD según la decisión, SIN tocar el recurso (payload primero, FR-009). El handler la
 * invoca ANTES del chequeo de formato de `orderId` para garantizar "payload antes que recurso" (orderId
 * malformado + reason inválido → 422 INVALID_REASON, no 404). Devuelve el motivo saneado o `null`.
 */
export function validateReviewReason(
  decision: ReviewDecision,
  reason: string | null | undefined,
): Result<string | null> {
  switch (decision) {
    case 'approve': {
      // Opcional: ausente/null → sin motivo; presente → mismas reglas que reject.
      if (reason === undefined || reason === null) {
        return { ok: true, value: null };
      }
      const v = validateReason(reason);
      return v.ok ? { ok: true, value: v.value } : err(v.error);
    }
    case 'reject': {
      // Obligatorio.
      if (reason === undefined || reason === null) {
        return err(domainError('INVALID_REASON', 'Motivo inválido.', { details: { fields: ['reason'] } }));
      }
      const v = validateReason(reason);
      return v.ok ? { ok: true, value: v.value } : err(v.error);
    }
    default:
      return assertNever(decision);
  }
}

export async function reviewOrder(
  deps: ReviewOrderDeps,
  input: ReviewOrderInput,
): Promise<Result<OrderRecord>> {
  const reason = validateReviewReason(input.decision, input.reason);
  if (!reason.ok) {
    return err(reason.error);
  }
  return deps.review.review({
    orderId: input.orderId,
    actorId: input.actorId,
    decision: input.decision,
    reason: reason.value,
  });
}
