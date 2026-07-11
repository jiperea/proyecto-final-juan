import type { RequestHandler } from 'express';
import { listOrders, type ListOrdersDeps } from '../../domain/order/list-orders';
import type { OrderRecord } from '../../domain/order/model';
import { domainError } from '../../domain/result';
import type { OrderDto, OrderListResponseDto } from '../contract/order-types';
import { sendError } from '../error-mapper';
import '../http-types';

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

// GET /v1/orders — el alcance sale de orderScopeFor vía el caso de uso (sin lógica de rol inline).
// Ignora cualquier query param (no amplía alcance, FR-015). Fail-closed: BD caída → 503.
export function listOrdersHandler(deps: ListOrdersDeps): RequestHandler {
  return async (req, res): Promise<void> => {
    const auth = req.auth;
    if (!auth) {
      sendError(res, domainError('UNAUTHENTICATED', 'No autenticado.'));
      return;
    }
    try {
      const records = await listOrders(deps, { role: auth.role, userId: auth.userId });
      const body: OrderListResponseDto = { orders: records.map(toDto) };
      res.status(200).json(body);
    } catch {
      sendError(res, domainError('SERVICE_UNAVAILABLE', 'Servicio no disponible.'));
    }
  };
}
