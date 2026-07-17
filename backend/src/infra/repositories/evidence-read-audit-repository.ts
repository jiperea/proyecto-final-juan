import type { PrismaClient } from '@prisma/client';
import { v7 as uuidv7 } from 'uuid';
import type {
  EvidenceReadAuditPort,
  EvidenceReadEvent,
} from '../../domain/order/read-side/evidence-read-ports';

// Feature 024 (US3, FR-021) — auditoría de LECTURA de evidencia, append-only (trigger de BD, ver
// migración `add_evidence_read_audit`). Tabla PROPIA (`EvidenceReadAudit`), separada de `OrderAudit` para
// no contaminar su semántica FSM (derivación de `last_rejection_reason`/ciclo vigente por transición más
// reciente — order-detail-reader.ts). Solo `INSERT`; nunca UPDATE/DELETE (enforced por trigger).
export class PrismaEvidenceReadAuditRepository implements EvidenceReadAuditPort {
  constructor(private readonly prisma: PrismaClient) {}

  async record(event: EvidenceReadEvent): Promise<void> {
    await this.prisma.evidenceReadAudit.create({
      data: {
        id: uuidv7(),
        orderId: event.orderId,
        evidenceId: event.evidenceId,
        actorId: event.actorId,
      },
    });
  }
}
