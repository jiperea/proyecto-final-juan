import type { PrismaClient } from '@prisma/client';
import type { OrderStatus } from '../../domain/order/model';
import type {
  EvidenceOrderLookup,
  EvidenceReaderPort,
  EvidenceRowLookup,
} from '../../domain/order/read-side/evidence-read-ports';

// Lecturas read-only para `getOrderEvidence` (024, US2). NUNCA muta nada; solo SELECTs.
export class PrismaEvidenceReadRepository implements EvidenceReaderPort {
  constructor(private readonly prisma: PrismaClient) {}

  async findOrderForEvidence(orderId: string): Promise<EvidenceOrderLookup | null> {
    const o = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { status: true, assignedTo: true },
    });
    return o === null ? null : { status: o.status as OrderStatus, assignedTo: o.assignedTo };
  }

  async findEvidenceRow(orderId: string, evidenceId: string): Promise<EvidenceRowLookup | null> {
    // where compuesto (id + orderId): un evidenceId con formato válido pero de OTRA orden → null (FR-015),
    // no se filtra su existencia bajo un orderId ajeno.
    const row = await this.prisma.orderEvidence.findFirst({
      where: { id: evidenceId, orderId },
      select: { objectRef: true },
    });
    return row === null ? null : { objectRef: row.objectRef };
  }
}
