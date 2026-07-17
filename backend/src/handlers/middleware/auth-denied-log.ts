// Composición de auth + observabilidad de 401 (#010, FR-009). El middleware `authenticate` de 001 corta
// ANTES del handler cuando no hay actor (401), así que el handler no puede emitir el evento del 401. Este
// wrapper #010-propio ejecuta `authenticate`; si pasa, sigue al handler; si respondió 401, emite el evento
// de acceso denegado (sin actor, outcome=401_unauth, recurso saneado) SIN modificar 001. best-effort.
import type { RequestHandler } from 'express';
import type { DeniedAccessLoggerPort } from '../../domain/order/read-side/ports';
import { sanitizeResource } from '../../infra/audit/denied-access-logger';
import '../http-types';

export function authWithDeniedAccessLog(
  auth: RequestHandler,
  logger: DeniedAccessLoggerPort,
  // 024/US2 reutiliza este middleware para `getOrderEvidence`; el default preserva el valor histórico de
  // `getOrderDetail` (no rompe tests existentes que aseveran `endpoint: 'getOrderDetail'`).
  endpoint = 'getOrderDetail',
): RequestHandler {
  return async (req, res, next): Promise<void> => {
    let passed = false;
    await auth(req, res, () => {
      passed = true;
    });
    if (passed) {
      next();
      return;
    }
    // authenticate respondió 401 (headersSent). Emite el evento sin actor (no autenticado). best-effort
    // (FR-009): un fallo del logger NUNCA altera la respuesta 401 ya enviada.
    try {
      logger.record({
        endpoint,
        recurso: sanitizeResource(req.params.orderId ?? ''),
        outcome: '401_unauth',
      });
    } catch {
      /* no bloqueante */
    }
  };
}
