import type { Logger } from 'pino';
import type { AccessEvent, AccessLogPort } from '../../domain/ai/summary-ports';

// Evento de acceso del resumen (FR-013/SC-007). Log estructurado categoría `access.ai_summary`, SIN PII:
// sólo ids opacos (actor, orderId), timestamp y outcome/deniedReason (enums). NUNCA prompt/resumen/object_ref.
// Almacenamiento durable/forense = #009 (BL-002); hoy es log rotable (residual honesto M5).
export class PinoAccessLog implements AccessLogPort {
  constructor(private readonly logger: Logger) {}

  record(event: AccessEvent): void {
    this.logger.info(
      {
        category: 'access.ai_summary',
        actor: event.actor,
        orderId: event.orderId,
        outcome: event.outcome,
        ...(event.deniedReason ? { deniedReason: event.deniedReason } : {}),
      },
      'ai_summary access',
    );
  }
}
