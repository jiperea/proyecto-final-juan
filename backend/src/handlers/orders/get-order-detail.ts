// GET /v1/orders/:orderId — detalle de una orden visible según el rol (#010, read-side puro).
// Precedencia 401→404: `authenticate` (montado antes vía authWithDeniedAccessLog) cubre el 401; aquí solo
// llega el usuario autenticado. orderId malformado → 404 ANTES de tocar la BD (no-enumeración, evita P2023).
// Un actor que no puede ver la orden (inexistente/ajena/fuera-de-estado/rol raro) → 404 genérico idéntico.
// 401/404 emiten señal best-effort de acceso denegado (FR-009). BD KO → 503; error inesperado → 500.
import type { RequestHandler } from 'express';
import { assembleOrderDetail, type OrderDetailView } from '../../domain/order/read-side/order-detail-assembler';
import { isOrderVisible } from '../../domain/order/read-side/order-detail-visibility';
import type {
  DeniedAccessLoggerPort,
  OrderDetailReaderPort,
  PiiRedactorPort,
} from '../../domain/order/read-side/ports';
import { domainError, isDomainError } from '../../domain/result';
import { sanitizeResource } from '../../infra/audit/denied-access-logger';
import type { OrderDetailResponseDto } from './order-detail-types';
import { sendError } from '../error-mapper';
import { UUID_RE, orderNotFound, toOrderDto } from './order-http';
import '../http-types';

export interface GetOrderDetailDeps {
  readonly reader: OrderDetailReaderPort;
  readonly redactor: PiiRedactorPort;
  readonly deniedLogger: DeniedAccessLoggerPort;
}

function toDto(view: OrderDetailView): OrderDetailResponseDto {
  const body: OrderDetailResponseDto = { order: toOrderDto(view.order) };
  if (view.notes !== undefined) {
    body.notes = view.notes;
  }
  if (view.evidence !== undefined) {
    body.evidence = {
      count: view.evidence.count,
      content_types: [...view.evidence.contentTypes],
      items: view.evidence.items.map((i) => ({ evidence_id: i.id, content_type: i.contentType })),
    };
  }
  if (view.lastRejectionReason !== undefined) {
    body.last_rejection_reason = view.lastRejectionReason;
  }
  return body;
}

export function getOrderDetailHandler(deps: GetOrderDetailDeps): RequestHandler {
  return async (req, res): Promise<void> => {
    const auth = req.auth;
    if (!auth) {
      // Defensivo: la ruta monta authenticate antes; nunca debería llegar sin actor.
      sendError(res, domainError('UNAUTHENTICATED', 'No autenticado.'));
      return;
    }
    const orderId = req.params.orderId ?? '';
    const recurso = sanitizeResource(orderId);

    const denyNotVisible = (): void => {
      // best-effort (FR-009): un fallo del logger NUNCA degrada la respuesta 404.
      try {
        deps.deniedLogger.record({
          actor: auth.userId,
          endpoint: 'getOrderDetail',
          recurso,
          outcome: '404_not_visible',
        });
      } catch {
        /* no bloqueante */
      }
      sendError(res, orderNotFound());
    };

    // orderId malformado → 404 ANTES de la BD (evita P2023→500; no reintroduce un 400 oráculo).
    if (!UUID_RE.test(orderId)) {
      denyNotVisible();
      return;
    }

    try {
      const snapshot = await deps.reader.read(orderId);
      if (snapshot === null || !isOrderVisible(auth.role, auth.userId, snapshot.order)) {
        denyNotVisible();
        return;
      }
      const view = assembleOrderDetail({ role: auth.role, snapshot, redactor: deps.redactor });
      res.status(200).json(toDto(view));
    } catch (e) {
      if (isDomainError(e)) {
        sendError(res, e); // SERVICE_UNAVAILABLE (503) propagado por el reader ante BD caída
        return;
      }
      sendError(res, domainError('INTERNAL', 'Error interno.'));
    }
  };
}
