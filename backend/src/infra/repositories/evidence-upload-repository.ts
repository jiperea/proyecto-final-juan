import type { PrismaClient } from '@prisma/client';
import type { OrderStatus } from '../../domain/order/model';
import type {
  EvidenceUploadLookupPort,
  UploadOrderLookup,
} from '../../domain/order/write-side/evidence-upload-ports';

// Lecturas read-only para `uploadOrderEvidence` (024): NUNCA muta status/version/evidencia (eso lo hace
// el submit, en su propia transacción — FR-011).
export class PrismaEvidenceUploadRepository implements EvidenceUploadLookupPort {
  constructor(private readonly prisma: PrismaClient) {}

  async findOrderForUpload(orderId: string): Promise<UploadOrderLookup | null> {
    const o = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { status: true, assignedTo: true },
    });
    return o === null ? null : { status: o.status as OrderStatus, assignedTo: o.assignedTo };
  }

  async filterCommittedRefs(refs: readonly string[]): Promise<ReadonlySet<string>> {
    if (refs.length === 0) {
      return new Set();
    }
    const rows = await this.prisma.orderEvidence.findMany({
      where: { objectRef: { in: [...refs] } },
      select: { objectRef: true },
    });
    return new Set(rows.map((r) => r.objectRef));
  }
}
