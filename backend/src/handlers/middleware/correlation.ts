import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import type { Logger } from 'pino';
import '../http-types';

export const CORRELATION_HEADER = 'x-correlation-id';

// Propaga un correlation-id (request→logs→respuesta) y adjunta un logger por-request (FR-014).
export function correlation(logger: Logger): RequestHandler {
  return (req, res, next) => {
    const incoming = req.header(CORRELATION_HEADER);
    const correlationId = incoming && incoming.length > 0 ? incoming : randomUUID();
    res.setHeader(CORRELATION_HEADER, correlationId);
    req.correlationId = correlationId;
    req.log = logger.child({ correlationId });
    next();
  };
}
