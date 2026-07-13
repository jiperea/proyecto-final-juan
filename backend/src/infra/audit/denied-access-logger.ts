// Emisor best-effort de accesos denegados (#010, FR-009). Implementa DeniedAccessLoggerPort sobre el logger
// pino compartido. NO es el AccessLogPort de 007 (tipado para ai-summary, sin caso 401; 007 inamovible) y,
// a diferencia de ai-summary, SÍ emite en 401. NO es un registro durable append-only (eso es la feature
// #009, BL-002/067): esto es solo observabilidad. best-effort: un fallo del logger NO rompe la respuesta.
import type { Logger } from 'pino';
import type { DeniedAccessEvent, DeniedAccessLoggerPort } from '../../domain/order/read-side/ports';

// Formato UUID canónico (independiente del handler para no invertir capas infra→handlers).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Saneo del `recurso` (anti-inyección de PII en el log, FR-009): un orderId que matchea UUID se emite tal
// cual (identificador opaco); cualquier otra cosa (malformado / texto libre con posible PII) → marcador
// fijo "<malformed>". NUNCA se emite el valor crudo recibido.
export function sanitizeResource(orderId: string): string {
  return UUID_RE.test(orderId) ? orderId : '<malformed>';
}

export class PinoDeniedAccessLogger implements DeniedAccessLoggerPort {
  constructor(private readonly logger: Logger) {}

  record(event: DeniedAccessEvent): void {
    try {
      this.logger.warn({ event: 'denied_access', ...event }, 'acceso denegado');
    } catch {
      // best-effort no bloqueante (FR-009): un fallo del logger no degrada la respuesta 401/404.
    }
  }
}
