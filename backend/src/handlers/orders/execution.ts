import type { RequestHandler } from 'express';
import {
  submitExecution,
  validateExecutionPayload,
  type ExecutionPayload,
  type SubmitExecutionDeps,
} from '../../domain/order/write-side/submit-execution';
import type { EvidenceRefInput } from '../../domain/order/evidence';
import { domainError, err, type Result } from '../../domain/result';
import { executionRequestSchema } from '../contract/schemas';
import { sendError } from '../error-mapper';
import { UUID_RE, orderNotFound, toOrderDto } from './order-http';
import '../http-types';

// (1) Estructura del cuerpo (.strict() rechaza campos extra como uploaded_by/actor_id → actor del token,
//     FR-007) → VALIDATION_ERROR; (2) validación de dominio del PAYLOAD (evidencia→notas, FR-003/005). Nunca
//     ecoa notes/object_ref en el error. Ambos fallos son 422 (payload primero, antes del formato de orderId).
function parseExecutionPayload(body: unknown): Result<ExecutionPayload> {
  const parsed = executionRequestSchema.safeParse(body);
  if (!parsed.success) {
    return err(
      domainError('VALIDATION_ERROR', 'Cuerpo de la petición inválido.', {
        details: { fields: parsed.error.issues.map((i) => i.path.join('.') || 'body') },
      }),
    );
  }
  const evidence: EvidenceRefInput[] = parsed.data.evidence.map((e) => ({
    objectRef: e.object_ref,
    contentType: e.content_type,
    sizeBytes: e.size_bytes,
  }));
  return validateExecutionPayload({ notes: parsed.data.notes, evidence });
}

// POST /v1/orders/:orderId/execution — technician-only. 401/403 los aplican los middlewares. Handler DELGADO,
// precedencia PAYLOAD PRIMERO (H-003, FR-003): parse Zod (.strict()) → validación de dominio del payload
// (evidencia→notas, 422) → chequeo de formato de `orderId` (→404) → mutación atómica (puerto). Así
// "orderId malformado + payload inválido" → 422 (payload). Nunca serializa notes/object_ref en errores.
export function submitOrderExecutionHandler(deps: SubmitExecutionDeps): RequestHandler {
  return async (req, res): Promise<void> => {
    const auth = req.auth;
    if (!auth) {
      sendError(res, domainError('UNAUTHENTICATED', 'No autenticado.'));
      return;
    }
    // (1+2) Payload primero (estructura + evidencia→notas). 422 antes del formato de orderId.
    const payload = parseExecutionPayload(req.body);
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
      // (4) Mutación atómica; el puerto clasifica el 0-filas (404 pertenencia / 422 estado).
      const result = await submitExecution(deps, {
        orderId,
        actorId: auth.userId, // actor SÓLO del token (FR-007)
        notes: payload.value.notes,
        evidence: payload.value.evidence,
      });
      if (!result.ok) {
        sendError(res, result.error);
        return;
      }
      res.status(200).json(toOrderDto(result.value));
    } catch {
      // Catch-all: cualquier error de BD/inesperado → 500 genérico, sin filtrar detalle de Postgres (FR-008).
      sendError(
        res,
        domainError('INTERNAL', 'Error interno.', {
          agentAction: 'Reintenta más tarde; si persiste, contacta soporte.',
        }),
      );
    }
  };
}
