import { Prisma, type PrismaClient } from '@prisma/client';
import type { IncidentSource, IncidentSourcePort } from '../../domain/ai/summary-ports';
import { domainError } from '../../domain/result';

// Códigos de conexión/indisponibilidad de Prisma → 503 (convención transversal 001/006), distintos de un
// error no transitorio → 500.
const PG_CONNECTION_ERRORS = new Set(['P1000', 'P1001', 'P1002', 'P1008', 'P1017']);

function isDbUnavailable(e: unknown): boolean {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    return PG_CONNECTION_ERRORS.has(e.code);
  }
  return (
    e instanceof Prisma.PrismaClientInitializationError ||
    e instanceof Prisma.PrismaClientRustPanicError
  );
}

// Lectura de la fuente del resumen (007). Devuelve `null` SÓLO si la orden no es visible (no existe o
// status != pending_review) → el handler lo mapea a 404 (no-enumeración, FR-007). Una orden visible pero
// sin contenido (invariante de 005 rota) devuelve una fuente vacía → el umbral FR-015 la cae a fallback.
//
// Ciclo VIGENTE (H-001): notas + evidencia del último `submitOrderExecution` (OrderAudit con
// toStatus=pending_review, reason=execution_registered), localizado por `auditId` — NO por max(attempt)
// por-tabla. NUNCA se lee `object_ref` (sólo conteo + content_type; allowlist estructural FR-003a).
export class PrismaIncidentSourceRepository implements IncidentSourcePort {
  constructor(private readonly prisma: PrismaClient) {}

  async findSummarizable(orderId: string): Promise<IncidentSource | null> {
    try {
      const order = await this.prisma.order.findFirst({
        where: { id: orderId, status: 'pending_review' },
        select: { id: true },
      });
      if (!order) {
        return null; // no visible → 404
      }

      const audit = await this.prisma.orderAudit.findFirst({
        where: { orderId, toStatus: 'pending_review', reason: 'execution_registered' },
        orderBy: { at: 'desc' },
        select: { id: true },
      });
      if (!audit) {
        // Visible pero sin ciclo de ejecución registrado (invariante 005 rota): fuente vacía → fallback FR-015.
        return { notes: '', evidence: { count: 0, contentTypes: [] } };
      }

      // Defensa en profundidad: la lectura de contenido incluye `orderId` ADEMÁS del `auditId` (aunque el
      // auditId ya se derivó de esta orden) → un auditId reutilizado/desalineado nunca sirve contenido de
      // otra orden a un supervisor que superó el guard de visibilidad sobre ESTA orden.
      const notesRow = await this.prisma.orderExecutionNotes.findFirst({
        where: { auditId: audit.id, orderId },
        orderBy: { at: 'desc' },
        select: { notes: true },
      });
      const evidence = await this.prisma.orderEvidence.findMany({
        where: { auditId: audit.id, orderId },
        select: { contentType: true },
      });

      return {
        notes: notesRow?.notes ?? '',
        evidence: { count: evidence.length, contentTypes: evidence.map((e) => e.contentType) },
      };
    } catch (e) {
      // BD no disponible → SERVICE_UNAVAILABLE (503, convención 001/006), no 500. Otro error → re-throw → 500.
      if (isDbUnavailable(e)) {
        throw domainError('SERVICE_UNAVAILABLE', 'El servicio no está disponible.');
      }
      throw e;
    }
  }
}
