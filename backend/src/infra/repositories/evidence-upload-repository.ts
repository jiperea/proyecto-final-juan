import { Prisma, type PrismaClient } from '@prisma/client';
import type { OrderStatus } from '../../domain/order/model';
import type {
  EvidenceUploadLookupPort,
  UploadOrderLookup,
} from '../../domain/order/write-side/evidence-upload-ports';
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

// Lecturas read-only para `uploadOrderEvidence` (024): NUNCA muta status/version/evidencia (eso lo hace
// el submit, en su propia transacción — FR-011).
export class PrismaEvidenceUploadRepository implements EvidenceUploadLookupPort {
  constructor(private readonly prisma: PrismaClient) {}

  async findOrderForUpload(orderId: string): Promise<UploadOrderLookup | null> {
    return withDbFailover(async () => {
      const o = await this.prisma.order.findUnique({
        where: { id: orderId },
        select: { status: true, assignedTo: true },
      });
      return o === null ? null : { status: o.status as OrderStatus, assignedTo: o.assignedTo };
    });
  }

  async filterCommittedRefs(refs: readonly string[]): Promise<ReadonlySet<string>> {
    return withDbFailover(async () => {
      if (refs.length === 0) {
        return new Set();
      }
      const rows = await this.prisma.orderEvidence.findMany({
        where: { objectRef: { in: [...refs] } },
        select: { objectRef: true },
      });
      return new Set(rows.map((r) => r.objectRef));
    });
  }
}
