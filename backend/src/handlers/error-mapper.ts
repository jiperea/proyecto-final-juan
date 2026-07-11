import type { ErrorRequestHandler, Response } from 'express';
import { domainError, type DomainError, type ErrorCode } from '../domain/result';

// Mapea el catálogo de dominio a HTTP (Constitution X). Único punto de traducción error→HTTP.
const STATUS: Record<ErrorCode, number> = {
  INVALID_CREDENTIALS: 401,
  UNAUTHENTICATED: 401,
  CSRF_INVALID: 403,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 422,
  RATE_LIMITED: 429,
  SERVICE_UNAVAILABLE: 503,
  // 002b (referencia, NO autoritativa). En 002b son diagnóstico de dominio (sin endpoint); los
  // consumidores 003/004/005 DEBEN aplicar FR-009 ANTES de responder y nunca filtran BD.
  ORDER_NOT_FOUND: 404,
  VERSION_CONFLICT: 409,
  INVALID_TRANSITION: 422,
  // GUARD_UNMET: default FAIL-SAFE 404 (no revela existencia). FR-009 gobierna el mapeo real en el
  // consumidor: actor autorizado→403; visibilidad dependiente de la pertenencia→404. Si un consumidor
  // olvida FR-009, el fallback cae al lado seguro (404, cuerpo uniforme) — nunca al lado que filtra (403).
  // (Gate G3: convergencia cínico/rbac/consistencia — no bakear un 403 que reabra el oráculo de enumeración.)
  GUARD_UNMET: 404,
  ACTOR_INVALID: 500, // error interno; el consumidor no expone el código, sólo un 500 genérico sin detalle de BD
};

export function statusFor(code: ErrorCode): number {
  return STATUS[code];
}

interface ErrorBody {
  code: string;
  message: string;
  details?: { fields?: readonly string[] };
  agent_action?: string;
}

export function sendError(res: Response, error: DomainError): void {
  if (error.retryAfterSeconds !== undefined) {
    res.setHeader('Retry-After', String(error.retryAfterSeconds));
  }
  const body: ErrorBody = { code: error.code, message: error.message };
  if (error.details) {
    body.details = error.details;
  }
  res.status(STATUS[error.code]).json(body);
}

// Captura el SyntaxError del body-parser (JSON mal formado) → 422 (FR-013), no 400/500.
export const jsonErrorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }
  if (err instanceof SyntaxError && 'body' in (err as unknown as Record<string, unknown>)) {
    sendError(
      res,
      domainError('VALIDATION_ERROR', 'Cuerpo JSON mal formado.', { details: { fields: ['body'] } }),
    );
    return;
  }
  res.status(500).json({ code: 'INTERNAL', message: 'Error interno.' });
};
