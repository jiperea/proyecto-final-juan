import { apiFetch } from '../../api/client';
import {
  executionRequestSchema,
  incidentSummaryResponseSchema,
  orderSchema,
  reassignmentRequestSchema,
  reviewRequestSchema,
  uploadEvidenceResponseSchema,
} from '../../api/schemas';
import type {
  ExecutionRequest,
  IncidentSummaryResponse,
  Order,
  ReassignmentRequest,
  ReviewRequest,
  UploadEvidenceResponse,
} from '../../api/types';

// FE-2 · acciones write del técnico. apiFetch ya mapea los códigos del contrato (422 INVALID_TRANSITION/
// EVIDENCE_REQUIRED/INVALID_EVIDENCE/VALIDATION_ERROR, 404 uniforme, 403 FORBIDDEN_ROLE, 401→refresh,
// offline/fallback) a ApiError con userMessage (FR-006). El actor se deriva del token server-side.

// startOrderWork: assigned→in_progress. POST /v1/orders/{id}/start → Order (version+1).
export async function startOrderWork(orderId: string): Promise<Order> {
  return orderSchema.parse(await apiFetch<unknown>(`/v1/orders/${orderId}/start`, { method: 'POST' }));
}

// 024 (T032) · uploadOrderEvidence: sube el binario (multipart) al ENDPOINT NUEVO — el blob queda en
// staging cifrado y el backend devuelve el `object_ref` real (ya no un UUID generado en cliente). Ese
// `object_ref` es el que luego consume `submitOrderExecution` (shape del body SIN cambios, FR-012).
export async function uploadOrderEvidence(orderId: string, file: File): Promise<UploadEvidenceResponse> {
  const form = new FormData();
  form.append('file', file);
  return uploadEvidenceResponseSchema.parse(
    await apiFetch<unknown>(`/v1/orders/${orderId}/evidence`, { method: 'POST', body: form }),
  );
}

// submitOrderExecution: in_progress→pending_review. Valida el body contra el contrato ANTES de enviar
// (SC-005: el object_ref UUID y el resto de metadato cumplen el formato antes de la llamada).
export async function submitOrderExecution(orderId: string, body: ExecutionRequest): Promise<Order> {
  const validated = executionRequestSchema.parse(body);
  return orderSchema.parse(
    await apiFetch<unknown>(`/v1/orders/${orderId}/execution`, { method: 'POST', body: validated }),
  );
}

// FE-3 · reassignOrder (dispatcher): reasignable→mismo estado, nuevo assigned_to. POST
// /v1/orders/{id}/reassignments → Order (version+1). Valida el body contra el contrato ANTES de enviar
// (FR-002/FR-014: assignee_id UUID + reason 1..500 imprimible). El actor se deriva del token server-side.
export async function reassignOrder(orderId: string, body: ReassignmentRequest): Promise<Order> {
  const validated = reassignmentRequestSchema.parse(body);
  return orderSchema.parse(
    await apiFetch<unknown>(`/v1/orders/${orderId}/reassignments`, { method: 'POST', body: validated }),
  );
}

// FE-4 · reviewOrder (supervisor): approve→closed / reject→in_progress. POST /v1/orders/{id}/review →
// Order (version+1). Valida el body contra el contrato ANTES de enviar (FR-002).
export async function reviewOrder(orderId: string, body: ReviewRequest): Promise<Order> {
  const validated = reviewRequestSchema.parse(body);
  // FR-009b: decisión irreversible → sin auto-reintento tras 401 (el usuario re-confirma).
  return orderSchema.parse(
    await apiFetch<unknown>(`/v1/orders/${orderId}/review`, {
      method: 'POST',
      body: validated,
      retryOn401: false,
    }),
  );
}

// FE-4 · summarizeIncident (supervisor) = wrapper de `summarizeOrderIncident` (contrato 007). POST
// /v1/orders/{id}/ai-summary → {sufficient, summary|null}. El cliente distingue por `sufficient`; no
// re-evalúa el texto (la faithfulness/no-PII la garantiza el backend 007). No se persiste en cliente.
export async function summarizeIncident(orderId: string): Promise<IncidentSummaryResponse> {
  return incidentSummaryResponseSchema.parse(
    await apiFetch<unknown>(`/v1/orders/${orderId}/ai-summary`, { method: 'POST' }),
  );
}
