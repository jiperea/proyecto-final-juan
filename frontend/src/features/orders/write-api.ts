import { apiFetch } from '../../api/client';
import { executionRequestSchema, orderSchema } from '../../api/schemas';
import type { ExecutionRequest, Order } from '../../api/types';

// FE-2 · acciones write del técnico. apiFetch ya mapea los códigos del contrato (422 INVALID_TRANSITION/
// EVIDENCE_REQUIRED/INVALID_EVIDENCE/VALIDATION_ERROR, 404 uniforme, 403 FORBIDDEN_ROLE, 401→refresh,
// offline/fallback) a ApiError con userMessage (FR-006). El actor se deriva del token server-side.

// startOrderWork: assigned→in_progress. POST /v1/orders/{id}/start → Order (version+1).
export async function startOrderWork(orderId: string): Promise<Order> {
  return orderSchema.parse(await apiFetch<unknown>(`/v1/orders/${orderId}/start`, { method: 'POST' }));
}

// submitOrderExecution: in_progress→pending_review. Valida el body contra el contrato ANTES de enviar
// (SC-005: el object_ref UUID y el resto de metadato cumplen el formato antes de la llamada).
export async function submitOrderExecution(orderId: string, body: ExecutionRequest): Promise<Order> {
  const validated = executionRequestSchema.parse(body);
  return orderSchema.parse(
    await apiFetch<unknown>(`/v1/orders/${orderId}/execution`, { method: 'POST', body: validated }),
  );
}
