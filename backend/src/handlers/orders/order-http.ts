// Utilidades HTTP compartidas por los handlers write-side de 005 (start/execution).
import type { OrderRecord } from '../../domain/order/model';
import type { OrderDto } from '../contract/order-types';
import { domainError } from '../../domain/result';

// Formato UUID canónico. orderId malformado se trata como "no existe" ANTES de tocar la BD (evita P2023→500).
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 404 genérico e IDÉNTICO byte a byte: inexistente, ajena, orderId malformado (no-enumeración, FR-003).
export function orderNotFound(): ReturnType<typeof domainError> {
  return domainError('ORDER_NOT_FOUND', 'La orden no existe.');
}

export function toOrderDto(o: OrderRecord): OrderDto {
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
