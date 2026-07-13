// Feature 006 — revisión del supervisor (write-side propio de 006). Vive en la CAPA write-side (junto al
// order-write-side-repository), separado por límite de tamaño de fichero; `status`/`version` sólo se mutan aquí
// y en el otro repo write-side (arch test). 1 $transaction: UPDATE condicional (approve: status='pending_review'
// AND EXISTS evidencia → guard atómico; reject: status='pending_review') → auditoría transition (reason
// pre-saneado o NULL). NO reutiliza applyTransition/classifyZeroRows de 002b. 0 filas → classifyReviewGuard
// (404 no-visible antes que 409). BD no disponible → SERVICE_UNAVAILABLE (503); FK actor → ACTOR_INVALID (500).
import { Prisma, type Order as PrismaOrder, type PrismaClient } from '@prisma/client';
import { v7 as uuidv7 } from 'uuid';
import { domainError, err, ok, type Result } from '../../domain/result';
import type { OrderRecord, OrderStatus } from '../../domain/order/model';
import type {
  ReviewOrderCommand,
  ReviewOrderPort,
} from '../../domain/order/write-side/write-side-ports';
import { classifyReviewGuard } from '../../domain/order/write-side/classify-review-guard';

const PG_FOREIGN_KEY_VIOLATION = 'P2003';
// Códigos de conexión/indisponibilidad de Prisma → 503 (fail-closed), distintos de un error no transitorio → 500.
const PG_CONNECTION_ERRORS = new Set(['P1000', 'P1001', 'P1002', 'P1008', 'P1017']);

const REVIEW_FROM: OrderStatus = 'pending_review';
const APPROVE_TO: OrderStatus = 'closed';
const REJECT_TO: OrderStatus = 'in_progress';

function toRecord(o: PrismaOrder): OrderRecord {
  return {
    id: o.id,
    title: o.title,
    description: o.description,
    status: o.status as OrderStatus,
    assignedTo: o.assignedTo,
    version: o.version,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

export class PrismaReviewOrderRepository implements ReviewOrderPort {
  constructor(private readonly prisma: PrismaClient) {}

  async review(cmd: ReviewOrderCommand): Promise<Result<OrderRecord>> {
    try {
      return await this.prisma.$transaction((tx) => this.attempt(tx, cmd));
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === PG_FOREIGN_KEY_VIOLATION) {
          return err(domainError('ACTOR_INVALID', 'El actor de la revisión no es válido.'));
        }
        if (PG_CONNECTION_ERRORS.has(e.code)) {
          return err(domainError('SERVICE_UNAVAILABLE', 'Servicio no disponible.'));
        }
      }
      if (
        e instanceof Prisma.PrismaClientInitializationError ||
        e instanceof Prisma.PrismaClientRustPanicError
      ) {
        return err(domainError('SERVICE_UNAVAILABLE', 'Servicio no disponible.'));
      }
      throw e; // otro error no transitorio → catch-all del handler → 500
    }
  }

  private async attempt(
    tx: Prisma.TransactionClient,
    cmd: ReviewOrderCommand,
  ): Promise<Result<OrderRecord>> {
    const { orderId, actorId, decision, reason } = cmd;
    // UPDATE condicional atómico. approve: existencia de ≥1 evidencia en el WHERE vía EXISTS (guard atómico,
    // sin COUNT/SELECT previo → sin TOCTOU, G2/K1/H-002). reject: sólo status='pending_review'.
    const affected =
      decision === 'approve'
        ? await tx.$executeRaw`
            UPDATE orders SET status = 'closed', version = version + 1, updated_at = now()
            WHERE id = ${orderId}::uuid AND status = 'pending_review'
              AND EXISTS (SELECT 1 FROM order_evidence WHERE order_id = ${orderId}::uuid)`
        : await tx.$executeRaw`
            UPDATE orders SET status = 'in_progress', version = version + 1, updated_at = now()
            WHERE id = ${orderId}::uuid AND status = 'pending_review'`;

    if (affected === 1) {
      await tx.orderAudit.create({
        data: {
          id: uuidv7(),
          orderId,
          actorId,
          eventType: 'transition',
          fromStatus: REVIEW_FROM,
          toStatus: decision === 'approve' ? APPROVE_TO : REJECT_TO,
          reason: reason ?? null,
        },
      });
      return ok(toRecord(await tx.order.findUniqueOrThrow({ where: { id: orderId } })));
    }

    // 0 filas: re-lectura DENTRO de la tx (sin SELECT previo → sin TOCTOU). Snapshot {status, evidenceCount}.
    const current = await tx.order.findUnique({ where: { id: orderId }, select: { status: true } });
    if (current === null) {
      return err(classifyReviewGuard(null, { decision }));
    }
    const evidenceCount = await tx.orderEvidence.count({ where: { orderId } });
    return err(
      classifyReviewGuard({ status: current.status as OrderStatus, evidenceCount }, { decision }),
    );
  }
}
