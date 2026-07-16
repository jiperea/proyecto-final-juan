// GET /v1/orders/:orderId/evidence/:evidenceId — getOrderEvidence (024, US2). Monta SOLO `auth` (sin
// requireRole, igual que getOrderDetail — FR-003): la autz es la MISMA regla EXACTA de getOrderDetail
// (isOrderVisible), sin caso RBAC nuevo. Precedencia FR-007: (1) sin sesión → 401 (aplicado por
// authWithDeniedAccessLog montado en la ruta); (2) orderId/evidenceId malformado, orden inexistente/ajena/
// fuera de alcance (closed/draft), o evidenceId que no pertenece a esa orden (FR-015) → 404 UNIFORME (nunca
// 403), respuesta constante; (3) SOLO si autorizado sobre una orden en alcance se evalúa el blob: si el
// store no lo devuelve (legacy nunca almacenado, o superado y purgado por el GC de FR-024) → 410
// EVIDENCE_GONE; si existe → 200 con el binario, `Content-Type` derivado del MAGIC-BYTE real (no el
// declarado, FR-004/S-009) + cabeceras defensivas. NUNCA se expone `object_ref`/firma interna/binario en
// logs (FR-008); la firma de lectura (StoragePort.signRead) es interna backend↔store, TTL ≤300s, jamás
// cliente-visible (FR-004/FR-005).
import type { RequestHandler, Response } from 'express';
import { detectMagicContentType } from '../../domain/order/evidence';
import type { EvidenceReaderPort } from '../../domain/order/read-side/evidence-read-ports';
import { isOrderVisible } from '../../domain/order/read-side/order-detail-visibility';
import type { DeniedAccessLoggerPort } from '../../domain/order/read-side/ports';
import type { StoragePort } from '../../domain/ports/storage';
import { domainError } from '../../domain/result';
import { sanitizeResource } from '../../infra/audit/denied-access-logger';
import { sendError } from '../error-mapper';
import { UUID_RE, orderNotFound } from './order-http';
import '../http-types';

export interface GetEvidenceDeps {
  readonly reader: EvidenceReaderPort;
  readonly storage: StoragePort;
  readonly deniedLogger: DeniedAccessLoggerPort;
  readonly signTtlSeconds: number;
}

function evidenceGone(): ReturnType<typeof domainError> {
  return domainError('EVIDENCE_GONE', 'La evidencia ya no está disponible.', {
    agentAction: 'Esta evidencia fue purgada o pertenece a un ciclo superado; no hay nada que recuperar.',
  });
}

// Sirve el binario con las cabeceras defensivas de FR-004/D7: nunca capacidad portadora, sin cachear, sin
// referer, y `Content-Type` estricto derivado del contenido REAL (no del declarado en su día).
function sendBinary(res: Response, bytes: Buffer): void {
  const contentType = detectMagicContentType(bytes) ?? 'application/octet-stream';
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', contentType);
  res.status(200).send(bytes);
}

async function handleAuthorized(
  deps: GetEvidenceDeps,
  res: Response,
  orderId: string,
  evidenceId: string,
): Promise<void> {
  const row = await deps.reader.findEvidenceRow(orderId, evidenceId);
  if (row === null) {
    sendError(res, orderNotFound()); // evidenceId ajeno/inexistente bajo este orderId (FR-015)
    return;
  }
  // Firma interna backend↔store, TTL corto (D6) — nunca expuesta al cliente (FR-004/FR-005).
  const handle = await deps.storage.signRead(row.objectRef, deps.signTtlSeconds);
  try {
    const result = await deps.storage.read(handle);
    if (!Buffer.isBuffer(result)) {
      sendError(res, evidenceGone()); // firma expirada/manipulada (defensivo; no debería ocurrir aquí)
      return;
    }
    sendBinary(res, result);
  } catch {
    // Blob ausente del store (legacy nunca almacenado, o superado y purgado por el GC de FR-024, FR-009).
    sendError(res, evidenceGone());
  }
}

export function getOrderEvidenceHandler(deps: GetEvidenceDeps): RequestHandler {
  return (req, res): void => {
    const auth = req.auth;
    if (!auth) {
      // Defensivo: la ruta monta authWithDeniedAccessLog antes; nunca debería llegar sin actor.
      sendError(res, domainError('UNAUTHENTICATED', 'No autenticado.'));
      return;
    }
    const orderId = req.params.orderId ?? '';
    const evidenceId = req.params.evidenceId ?? '';
    const recurso = sanitizeResource(orderId);

    const deny = (): void => {
      try {
        deps.deniedLogger.record({
          actor: auth.userId,
          endpoint: 'getOrderEvidence',
          recurso,
          outcome: '404_not_visible',
        });
      } catch {
        /* no bloqueante (FR-009 best-effort) */
      }
      sendError(res, orderNotFound());
    };

    // ids malformados → 404 ANTES de la BD (evita P2023→500; no reintroduce un oráculo 400).
    if (!UUID_RE.test(orderId) || !UUID_RE.test(evidenceId)) {
      deny();
      return;
    }

    deps.reader
      .findOrderForEvidence(orderId)
      .then(async (order) => {
        // FR-003: autz EXACTA de getOrderDetail + el dispatcher NUNCA accede a evidencia (mínimo privilegio,
        // igual que el ensamblador del detalle le omite el campo `evidence` — order-detail-assembler.ts:51),
        // aunque `isOrderVisible` sí le deje ver la orden en sí (assigned/in_progress, sin filtro de dueño).
        if (order === null || auth.role === 'dispatcher' || !isOrderVisible(auth.role, auth.userId, order)) {
          deny();
          return;
        }
        await handleAuthorized(deps, res, orderId, evidenceId);
      })
      .catch(() => {
        sendError(res, domainError('INTERNAL', 'Error interno.'));
      });
  };
}
