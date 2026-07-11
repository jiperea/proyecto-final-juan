import { Prisma, type Order as PrismaOrder, type PrismaClient } from '@prisma/client';
import { v7 as uuidv7 } from 'uuid';
import { domainError, err, ok, type Result } from '../../domain/result';
import type { OrderRecord, OrderStatus } from '../../domain/order/model';
import { isLegalTransition } from '../../domain/order/transition-table';
import type {
  ApplyTransitionInput,
  OrderTransitionPort,
} from '../../domain/order/transition-ports';

const PG_FOREIGN_KEY_VIOLATION = 'P2003';

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

function guardSatisfied(order: PrismaOrder, input: ApplyTransitionInput): boolean {
  return input.guard?.assignedTo === undefined || order.assignedTo === input.guard.assignedTo;
}

// Clasificación determinista cuando el UPDATE condicional afecta 0 filas (re-lectura best-effort, FR-003/D2):
// NOT_FOUND → VERSION_CONFLICT → INVALID_TRANSITION → GUARD_UNMET.
function classifyZeroRows(
  current: PrismaOrder | null,
  input: ApplyTransitionInput,
): Result<OrderRecord> {
  if (current === null) {
    return err(domainError('ORDER_NOT_FOUND', 'La orden no existe.'));
  }
  if (current.version !== input.expectedVersion) {
    return err(domainError('VERSION_CONFLICT', 'La versión de la orden es obsoleta.'));
  }
  if (!isLegalTransition(current.status as OrderStatus, input.toStatus)) {
    return err(domainError('INVALID_TRANSITION', 'Transición de estado no permitida.'));
  }
  return err(domainError('GUARD_UNMET', 'La guarda de pertenencia no se cumple.'));
}

// Repo de transición: ÚNICO punto de escritura de `status`/`version` (D6/FR-006). Aplica el cambio de
// estado con concurrencia optimista (UPDATE condicional por `version`) + guarda de pertenencia + auditoría
// append-only en la MISMA `$transaction` (atomicidad todo-o-nada, FR-004).
export class PrismaOrderTransitionRepository implements OrderTransitionPort {
  constructor(private readonly prisma: PrismaClient) {}

  async applyTransition(input: ApplyTransitionInput): Promise<Result<OrderRecord>> {
    try {
      return await this.prisma.$transaction((tx) => this.attempt(tx, input));
    } catch (e) {
      // FK de `actor_id` inválida (u otra violación de FK): NO propagar el mensaje crudo de Postgres
      // (G1:H-009). Resultado de dominio accionable, sin filtrar esquema/SQL.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === PG_FOREIGN_KEY_VIOLATION) {
        return err(domainError('ACTOR_INVALID', 'El actor de la transición no es válido.'));
      }
      throw e;
    }
  }

  private async attempt(
    tx: Prisma.TransactionClient,
    input: ApplyTransitionInput,
  ): Promise<Result<OrderRecord>> {
    const { orderId, toStatus, expectedVersion, guard } = input;
    const before = await tx.order.findUnique({ where: { id: orderId } });
    const from = before?.status as OrderStatus | undefined;
    const canWrite =
      before !== null &&
      from !== undefined &&
      before.version === expectedVersion &&
      isLegalTransition(from, toStatus) &&
      guardSatisfied(before, input);

    if (canWrite) {
      // UPDATE condicional atómico: legalidad (status=<origen>), concurrencia (version) y guarda de
      // pertenencia viven en el WHERE parametrizado → cierra TOCTOU (G2:H-007/S-004).
      const res = await tx.order.updateMany({
        where: {
          id: orderId,
          version: expectedVersion,
          status: from,
          ...(guard?.assignedTo !== undefined ? { assignedTo: guard.assignedTo } : {}),
        },
        data: { status: toStatus, version: { increment: 1 } },
      });
      if (res.count === 1) {
        const updated = await this.writeAudit(tx, input, from as OrderStatus);
        return ok(toRecord(updated));
      }
    }

    return classifyZeroRows(await tx.order.findUnique({ where: { id: orderId } }), input);
  }

  private async writeAudit(
    tx: Prisma.TransactionClient,
    input: ApplyTransitionInput,
    from: OrderStatus,
  ): Promise<PrismaOrder> {
    // Insert de auditoría en la misma transacción. FK `actor_id` inválida → excepción → rollback.
    await tx.orderAudit.create({
      data: {
        id: uuidv7(),
        orderId: input.orderId,
        actorId: input.actorId,
        fromStatus: from,
        toStatus: input.toStatus,
        ...(input.reason !== undefined ? { reason: input.reason } : {}),
      },
    });
    return tx.order.findUniqueOrThrow({ where: { id: input.orderId } });
  }
}
