import type { RequestHandler } from 'express';
import { startOrderWork, type StartOrderWorkDeps } from '../../domain/order/write-side/start-order-work';
import { domainError } from '../../domain/result';
import { sendError } from '../error-mapper';
import { UUID_RE, orderNotFound, toOrderDto } from './order-http';
import '../http-types';

// POST /v1/orders/:orderId/start — technician-only. 401/403 los aplican los middlewares (authenticate +
// requireRole('technician')) montados en app.ts. El handler es DELGADO: valida el formato de orderId
// (→404 si malformado, evita P2023→500) → uso de dominio propio de 005 → map del Result. Sin cuerpo (FR-001).
// Precedencia efectiva: 401 → 403 → 404 (pertenencia; incl. uuid malformado) → 422 (estado).
export function startOrderWorkHandler(deps: StartOrderWorkDeps): RequestHandler {
  return async (req, res): Promise<void> => {
    const auth = req.auth;
    if (!auth) {
      sendError(res, domainError('UNAUTHENTICATED', 'No autenticado.'));
      return;
    }
    const orderId = req.params.orderId ?? '';
    if (!UUID_RE.test(orderId)) {
      sendError(res, orderNotFound()); // id malformado = "no existe" (no-enumeración), antes de la BD
      return;
    }
    try {
      const result = await startOrderWork(deps, { orderId, actorId: auth.userId }); // actor SÓLO del token
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
