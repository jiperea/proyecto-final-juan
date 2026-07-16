import { Prisma, type PrismaClient } from '@prisma/client';
import type { OrderStatus } from '../../domain/order/model';
import type {
  EvidenceOrderLookup,
  EvidenceReaderPort,
  EvidenceRowLookup,
} from '../../domain/order/read-side/evidence-read-ports';
import { domainError } from '../../domain/result';

// Códigos de conexión/indisponibilidad de Prisma → 503 (misma convención que order-detail-reader.ts),
// distintos de un error no transitorio → 500 (propagado tal cual al catch-all del handler).
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

async function withDbFailover<T>(op: () => Promise<T>): Promise<T> {
  try {
    return await op();
  } catch (e) {
    if (isDbUnavailable(e)) {
      throw domainError('SERVICE_UNAVAILABLE', 'El servicio no está disponible.');
    }
    throw e; // error no transitorio → catch-all del handler → 500
  }
}

// Lecturas read-only para `getOrderEvidence` (024, US2). NUNCA muta nada; solo SELECTs.
export class PrismaEvidenceReadRepository implements EvidenceReaderPort {
  constructor(private readonly prisma: PrismaClient) {}

  async findOrderForEvidence(orderId: string): Promise<EvidenceOrderLookup | null> {
    return withDbFailover(async () => {
      const o = await this.prisma.order.findUnique({
        where: { id: orderId },
        select: { status: true, assignedTo: true },
      });
      return o === null ? null : { status: o.status as OrderStatus, assignedTo: o.assignedTo };
    });
  }

  async findEvidenceRow(orderId: string, evidenceId: string): Promise<EvidenceRowLookup | null> {
    return withDbFailover(async () => {
      // where compuesto (id + orderId): un evidenceId con formato válido pero de OTRA orden → null
      // (FR-015), no se filtra su existencia bajo un orderId ajeno.
      const row = await this.prisma.orderEvidence.findFirst({
        where: { id: evidenceId, orderId },
        select: { objectRef: true },
      });
      return row === null ? null : { objectRef: row.objectRef };
    });
  }
}
