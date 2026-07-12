import type { Request, RequestHandler, Response } from 'express';
import { reassignOrder, type ReassignOrderDeps } from '../../domain/order/write-side/reassign-order';
import type { OrderVisibilityPort } from '../../domain/order/write-side/write-side-ports';
import type { OrderRecord } from '../../domain/order/model';
import type { AuthContext } from '../http-types';
import { domainError } from '../../domain/result';
import { reassignRequestSchema } from '../contract/schemas';
import type { OrderDto } from '../contract/order-types';
import { sendError } from '../error-mapper';
import '../http-types';

export interface ReassignHandlerDeps extends ReassignOrderDeps {
  readonly visibility: OrderVisibilityPort;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 404 genérico e IDÉNTICO byte a byte: inexistente, no reasignable, orderId malformado (no-enumeración, FR-004).
function notFound(): ReturnType<typeof domainError> {
  return domainError('ORDER_NOT_FOUND', 'La orden no existe.');
}

function toDto(o: OrderRecord): OrderDto {
  return {
    id: o.id,
    title: o.title,
    description: o.description,
    status: o.status,
    assigned_to: o.assignedTo,
    version: o.version,
    created_at: o.createdAt.toISOString(),
    updated_at: o.updatedAt.toISOString(),
  };
}

// Flujo con la orden ya autenticada+autorizada: 404 visibilidad (incl. uuid) → 422 body → 422 destino → 200.
async function runReassign(
  deps: ReassignHandlerDeps,
  req: Request,
  res: Response,
  auth: AuthContext,
): Promise<void> {
  const orderId = req.params.orderId ?? '';
  if (!UUID_RE.test(orderId)) {
    sendError(res, notFound()); // id malformado = "no existe", ANTES de la BD (evita P2023→500)
    return;
  }
  const snapshot = await deps.visibility.findReassignable(orderId);
  if (snapshot === null) {
    sendError(res, notFound());
    return;
  }
  const parsed = reassignRequestSchema.safeParse(req.body); // sólo con la orden VISIBLE
  if (!parsed.success) {
    sendError(
      res,
      domainError('VALIDATION_ERROR', 'Cuerpo de la petición inválido.', {
        details: { fields: parsed.error.issues.map((i) => i.path.join('.') || 'body') },
      }),
    );
    return;
  }
  const result = await reassignOrder(deps, {
    snapshot,
    assigneeId: parsed.data.assignee_id,
    reason: parsed.data.reason,
    actorId: auth.userId, // actor SÓLO del token (FR-008)
  });
  if (!result.ok) {
    sendError(res, result.error);
    return;
  }
  res.status(200).json(toDto(result.value));
}

// POST /v1/orders/:orderId/reassignments — dispatcher-only. Orden (FR-004/D-06):
// 401 (middleware authenticate) → 403 rol → 404 visibilidad → 422 body → 422 destino → 200.
export function reassignOrderHandler(deps: ReassignHandlerDeps): RequestHandler {
  return async (req, res): Promise<void> => {
    const auth = req.auth;
    if (!auth) {
      sendError(res, domainError('UNAUTHENTICATED', 'No autenticado.'));
      return;
    }
    if (auth.role !== 'dispatcher') {
      sendError(res, domainError('FORBIDDEN_ROLE', 'No autorizado para esta acción.'));
      return;
    }
    try {
      await runReassign(deps, req, res, auth);
    } catch {
      // Catch-all: cualquier error de BD/inesperado → 500 genérico, sin filtrar detalle de Postgres (FR-009).
      sendError(
        res,
        domainError('INTERNAL', 'Error interno.', {
          agentAction: 'Reintenta más tarde; si persiste, contacta soporte.',
        }),
      );
    }
  };
}
