// POST /v1/orders/:orderId/evidence — uploadOrderEvidence (024, US1). Multipart streaming (busboy), sólo
// `auth` montado en la ruta (sin requireRole, igual que getOrderDetail — FR-020). Precedencia AUTZ-PRIMERO
// (FR-020): (1) sin sesión → 401 (aplicado por el middleware `auth`); (2) actor no es el technician dueño
// ACTUAL o la orden no está `in_progress` → 404 uniforme (nunca 403), evaluado ANTES de tocar el body
// multipart; (3) sólo si autorizado se valida forma/tipo/tamaño/contenido real (413/415/422). El blob se
// almacena CIFRADO en staging (StoragePort.putStaged) — sin fila `OrderEvidence` (FR-011). NUNCA se logea
// el `object_ref`/binario (FR-008).
import type { Request, RequestHandler, Response } from 'express';
import Busboy from 'busboy';
import { EVIDENCE_MAX, SIZE_BYTES_MAX, validateUploadedImage } from '../../domain/order/evidence';
import type { EvidenceUploadLookupPort } from '../../domain/order/write-side/evidence-upload-ports';
import type { DeniedAccessLoggerPort } from '../../domain/order/read-side/ports';
import type { StoragePort } from '../../domain/ports/storage';
import { domainError, isDomainError } from '../../domain/result';
import { sanitizeResource } from '../../infra/audit/denied-access-logger';
import { sendError } from '../error-mapper';
import { UUID_RE, orderNotFound } from './order-http';
import '../http-types';

export interface UploadEvidenceDeps {
  readonly storage: StoragePort;
  readonly lookup: EvidenceUploadLookupPort;
  // S-003: MISMA señal best-effort de acceso denegado (401/404) que getOrderDetail/getOrderEvidence
  // (FR-009, recurso saneado, sin PII). 401 lo emite el wrapper de ruta; el handler emite el 404 (con actor).
  readonly deniedLogger: DeniedAccessLoggerPort;
}

function payloadTooLarge(): ReturnType<typeof domainError> {
  return domainError('PAYLOAD_TOO_LARGE', 'La evidencia debe pesar entre 1 y 26214400 bytes.', {
    agentAction: 'Sube una imagen de más de 0 bytes y como máximo 25 MiB.',
  });
}

function stagingLimitExceeded(): ReturnType<typeof domainError> {
  return domainError('STAGING_LIMIT_EXCEEDED', 'Se alcanzó el tope de evidencias pendientes de envío.', {
    agentAction: 'Envía la ejecución con las evidencias ya subidas antes de añadir más (tope 10).',
  });
}

function serviceUnavailable(): ReturnType<typeof domainError> {
  return domainError('SERVICE_UNAVAILABLE', 'El servicio no está disponible.');
}

// Autz-primero (FR-020): technician dueño ACTUAL + orden `in_progress`. Cualquier otra combinación → 404
// uniforme (no revela existencia/estado/rol). Consulta ÚNICA, sin efectos.
async function isAuthorizedForUpload(
  deps: UploadEvidenceDeps,
  orderId: string,
  role: string,
  userId: string,
): Promise<boolean> {
  if (role !== 'technician') {
    return false;
  }
  const order = await deps.lookup.findOrderForUpload(orderId);
  return order !== null && order.assignedTo === userId && order.status === 'in_progress';
}

// Cuenta los blobs staged VIVOS (sin fila OrderEvidence aún) de (ownerId, orderId) — FR-022. Los ya
// committeados no cuentan (nuevo ciclo tras reject-resubmit empieza limpio).
async function countLiveStaged(deps: UploadEvidenceDeps, ownerId: string, orderId: string): Promise<number> {
  let listed: Awaited<ReturnType<StoragePort['list']>>;
  try {
    listed = await deps.storage.list();
  } catch {
    // Almacenamiento caído (I-001) → 503 fail-closed, nunca un 500 genérico.
    throw serviceUnavailable();
  }
  const mine = listed.filter((s) => s.ownerId === ownerId && s.orderId === orderId);
  if (mine.length === 0) {
    return 0;
  }
  const committed = await deps.lookup.filterCommittedRefs(mine.map((s) => s.objectRef));
  return mine.filter((s) => !committed.has(s.objectRef)).length;
}

interface ParsedUpload {
  readonly bytes: Buffer;
  readonly declaredContentType: string;
}

// Parsea el multipart en streaming: corte duro a SIZE_BYTES_MAX (sin bufferizar más allá del tope) y sin
// aceptar más de 1 archivo. Devuelve `null` si el tamaño es 0 o excede el máximo (→ 413 en el llamador).
function parseMultipart(req: Request): Promise<ParsedUpload | null> {
  return new Promise((resolve, reject) => {
    let bb: ReturnType<typeof Busboy>;
    try {
      bb = Busboy({ headers: req.headers, limits: { fileSize: SIZE_BYTES_MAX, files: 1 } });
    } catch (e) {
      reject(e);
      return;
    }
    let declaredContentType = '';
    let sawFile = false;
    let tooLarge = false;
    let total = 0;
    const chunks: Buffer[] = [];

    bb.on('file', (_name, file, info) => {
      sawFile = true;
      declaredContentType = info.mimeType;
      file.on('data', (d: Buffer) => {
        if (tooLarge) {
          return; // ya excedido: no acumular más (streaming, sin bufferizar entero)
        }
        total += d.length;
        chunks.push(d);
      });
      file.on('limit', () => {
        tooLarge = true;
      });
    });
    bb.on('error', reject);
    bb.on('close', () => {
      if (!sawFile || tooLarge || total === 0) {
        resolve(null);
        return;
      }
      resolve({ bytes: Buffer.concat(chunks), declaredContentType });
    });
    req.pipe(bb);
  });
}

// Drena el body COMPLETO sin procesarlo (autz-primero: nunca se mira el contenido) antes de responder.
// Necesario para no cerrar la conexión mientras el cliente aún escribe un cuerpo grande (evita EPIPE/
// ECONNRESET en el cliente cuando el rechazo es más rápido que la subida, p. ej. ficheros oversized).
function drainRequest(req: Request): Promise<void> {
  return new Promise((resolve) => {
    req.on('end', () => resolve());
    req.on('aborted', () => resolve());
    req.on('error', () => resolve());
    req.resume();
  });
}

async function respondUnauthorized(
  deps: UploadEvidenceDeps,
  req: Request,
  res: Response,
  actorId: string,
  orderId: string,
): Promise<void> {
  await drainRequest(req);
  // best-effort (FR-009): un fallo del logger NUNCA degrada la respuesta 404 (S-003, misma señal que
  // getOrderDetail/getOrderEvidence).
  try {
    deps.deniedLogger.record({
      actor: actorId,
      endpoint: 'uploadOrderEvidence',
      recurso: sanitizeResource(orderId),
      outcome: '404_not_visible',
    });
  } catch {
    /* no bloqueante */
  }
  sendError(res, orderNotFound());
}

// Sólo se llega aquí tras confirmar autz (dueño actual + in_progress, FR-020): parsea → valida contenido
// real (413/415/422) → tope de staging (422) → almacena cifrado (201).
async function processAuthorizedUpload(
  deps: UploadEvidenceDeps,
  req: Request,
  res: Response,
  orderId: string,
  ownerId: string,
): Promise<void> {
  const parsed = await parseMultipart(req);
  if (parsed === null) {
    sendError(res, payloadTooLarge());
    return;
  }
  const validated = validateUploadedImage(parsed.declaredContentType, parsed.bytes);
  if (!validated.ok) {
    sendError(res, validated.error);
    return;
  }
  const liveCount = await countLiveStaged(deps, ownerId, orderId);
  if (liveCount >= EVIDENCE_MAX) {
    sendError(res, stagingLimitExceeded());
    return;
  }
  let objectRef: string;
  try {
    objectRef = await deps.storage.putStaged({
      bytes: parsed.bytes,
      contentType: parsed.declaredContentType,
      ownerId,
      orderId,
    });
  } catch {
    // Almacenamiento caído al guardar (I-001) → 503 fail-closed, nunca un 500 genérico.
    throw serviceUnavailable();
  }
  res.status(201).json({ object_ref: objectRef });
}

export function uploadEvidenceHandler(deps: UploadEvidenceDeps): RequestHandler {
  return (req, res): void => {
    const auth = req.auth;
    if (!auth) {
      void drainRequest(req).then(() => sendError(res, domainError('UNAUTHENTICATED', 'No autenticado.')));
      return;
    }
    const orderId = req.params.orderId ?? '';
    if (!UUID_RE.test(orderId)) {
      // malformado = "no existe" (no-enumeración), antes de la BD.
      void respondUnauthorized(deps, req, res, auth.userId, orderId);
      return;
    }

    isAuthorizedForUpload(deps, orderId, auth.role, auth.userId)
      .then(async (authorized) => {
        if (!authorized) {
          await respondUnauthorized(deps, req, res, auth.userId, orderId);
          return;
        }
        await processAuthorizedUpload(deps, req, res, orderId, auth.userId);
      })
      .catch((e: unknown) => {
        if (isDomainError(e)) {
          sendError(res, e); // SERVICE_UNAVAILABLE (503) propagado por el lookup/storage (I-001)
          return;
        }
        sendError(
          res,
          domainError('INTERNAL', 'Error interno.', {
            agentAction: 'Reintenta más tarde; si persiste, contacta soporte.',
          }),
        );
      });
  };
}
