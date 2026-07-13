import type { RequestHandler } from 'express';
import {
  reviewOrder,
  validateReviewReason,
  type ReviewOrderDeps,
} from '../../domain/order/write-side/review-order';
import { domainError, err, type Result } from '../../domain/result';
import { reviewRequestSchema } from '../contract/schemas';
import { sendError } from '../error-mapper';
import { UUID_RE, orderNotFound, toOrderDto } from './order-http';
import '../http-types';

interface ReviewPayload {
  readonly decision: 'approve' | 'reject';
  readonly reason?: string;
}

// (1) Estructura del cuerpo (.strict() rechaza `actor_id`/campos extra → actor del token, FR-012;
//     `decision` fuera del enum / body no-JSON → VALIDATION_ERROR); (2) validación de dominio del MOTIVO
//     (sanitizeReason + 1..1000 tras saneo → INVALID_REASON). Ambos son PAYLOAD → 422 y se evalúan ANTES del
//     formato de `orderId` (payload primero, FR-009/G2-H-001). Nunca ecoa el `reason` en el error.
function parseReviewPayload(body: unknown): Result<ReviewPayload> {
  const parsed = reviewRequestSchema.safeParse(body);
  if (!parsed.success) {
    return err(
      domainError('VALIDATION_ERROR', 'Cuerpo de la petición inválido.', {
        details: { fields: parsed.error.issues.map((i) => i.path.join('.') || 'body') },
      }),
    );
  }
  // Validación de dominio del motivo (INVALID_REASON) ANTES del recurso. No usamos el valor saneado aquí;
  // reviewOrder lo re-sanea de forma idempotente (mismo patrón que 005 execution).
  const reasonCheck = validateReviewReason(parsed.data.decision, parsed.data.reason ?? null);
  if (!reasonCheck.ok) {
    return err(reasonCheck.error);
  }
  return {
    ok: true,
    value: {
      decision: parsed.data.decision,
      ...(parsed.data.reason !== undefined ? { reason: parsed.data.reason } : {}),
    },
  };
}

// POST /v1/orders/:orderId/review — supervisor-only. 401/403 los aplican los middlewares. Handler DELGADO,
// precedencia PAYLOAD PRIMERO (G2/H-001, FR-009): parse Zod (VALIDATION_ERROR) → validación de dominio del
// motivo (INVALID_REASON) → formato de `orderId` (→404, evita P2023→500) → mutación atómica (puerto: 404
// visibilidad / 409 evidencia / 503 BD / 500 actor). Nunca serializa `reason` en errores.
export function reviewOrderHandler(deps: ReviewOrderDeps): RequestHandler {
  return async (req, res): Promise<void> => {
    const auth = req.auth;
    if (!auth) {
      sendError(res, domainError('UNAUTHENTICATED', 'No autenticado.'));
      return;
    }
    // (1+2) Payload primero (estructura + motivo). 422 antes del formato de orderId.
    const payload = parseReviewPayload(req.body);
    if (!payload.ok) {
      sendError(res, payload.error);
      return;
    }
    // (3) Formato de orderId: malformado = "no existe" (no-enumeración), antes de la BD (evita P2023→500).
    const orderId = req.params.orderId ?? '';
    if (!UUID_RE.test(orderId)) {
      sendError(res, orderNotFound());
      return;
    }
    try {
      // (4) Mutación atómica; el puerto clasifica 0-filas (404/409) y mapea BD (503) / actor (500).
      const result = await reviewOrder(deps, {
        orderId,
        actorId: auth.userId, // actor SÓLO del token (FR-012)
        decision: payload.value.decision,
        reason: payload.value.reason ?? null,
      });
      if (!result.ok) {
        sendError(res, result.error);
        return;
      }
      res.status(200).json(toOrderDto(result.value));
    } catch {
      // Catch-all: error no transitorio/inesperado → 500 genérico, sin filtrar detalle de Postgres (FR-010).
      sendError(
        res,
        domainError('INTERNAL', 'Error interno.', {
          agentAction: 'Reintenta más tarde; si persiste, contacta soporte.',
        }),
      );
    }
  };
}
