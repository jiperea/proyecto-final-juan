import { Prisma, type Order as PrismaOrder, type PrismaClient } from '@prisma/client';
import { v7 as uuidv7 } from 'uuid';
import { domainError, err, ok, type Result } from '../../domain/result';
import type { OrderRecord, OrderStatus } from '../../domain/order/model';
import { isLegalTransition } from '../../domain/order/transition-table';
import type {
  ApplyTransitionInput,
  OrderTransitionPort,
} from '../../domain/order/write-side/transition-ports';
import type {
  AssignableTechnician,
  OrderReassignmentPort,
  OrderVisibilityPort,
  ReassignCommand,
  ReassignmentSnapshot,
  UserLookupPort,
} from '../../domain/order/write-side/write-side-ports';

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

// ---------------------------------------------------------------------------------------------------
// Feature 004 — reasignación (write-side). Comparte fichero con la transición (mismo módulo de escritura);
// applyTransition NO se toca. `assigned_to` sólo se muta aquí (arch test, FR-007).

const REASSIGNABLE = ['assigned', 'in_progress'] as const;

// Consulta de visibilidad de FR-004: una orden reasignable (status ∈ {assigned,in_progress}) o null.
export class PrismaOrderVisibilityRepository implements OrderVisibilityPort {
  constructor(private readonly prisma: PrismaClient) {}

  async findReassignable(orderId: string): Promise<ReassignmentSnapshot | null> {
    const o = await this.prisma.order.findFirst({
      where: { id: orderId, status: { in: REASSIGNABLE as unknown as OrderStatus[] } },
      select: { id: true, status: true, assignedTo: true, version: true },
    });
    return o === null ? null : { id: o.id, status: o.status as OrderStatus, assignedTo: o.assignedTo, version: o.version };
  }
}

// Técnico destino elegible (FR-005): existe ∧ role='technician' ∧ disabledAt IS NULL.
export class PrismaUserLookupRepository implements UserLookupPort {
  constructor(private readonly prisma: PrismaClient) {}

  async findAssignableTechnician(userId: string): Promise<AssignableTechnician | null> {
    const u = await this.prisma.user.findFirst({
      where: { id: userId, role: 'technician', disabledAt: null },
      select: { id: true },
    });
    return u === null ? null : { id: u.id };
  }
}

// Reasignación atómica (FR-007): SELECT FOR UPDATE (captura assigned_to previo) + UPDATE condicional
// (id ∧ status reasignable ∧ assigned_to IS DISTINCT FROM destino) + auditoría reassignment, en una tx.
export class PrismaOrderReassignmentRepository implements OrderReassignmentPort {
  constructor(private readonly prisma: PrismaClient) {}

  async reassign(cmd: ReassignCommand): Promise<Result<OrderRecord>> {
    const { orderId, assigneeId, reason, actorId } = cmd;
    return this.prisma.$transaction(async (tx) => {
      // 1. Bloqueo de la fila (captura estado + asignatario PREVIO; null si no existe).
      const locked = await tx.$queryRaw<
        Array<{ status: OrderStatus; assigned_to: string | null }>
      >`SELECT status, assigned_to FROM orders WHERE id = ${orderId}::uuid FOR UPDATE`;
      const before = locked[0] ?? null;

      // 2. UPDATE condicional (null-safe con IS DISTINCT FROM → orden huérfana reasignable). Raw: Prisma no
      //    expresa IS DISTINCT FROM.
      const affected = await tx.$executeRaw`
        UPDATE orders SET assigned_to = ${assigneeId}::uuid, version = version + 1, updated_at = now()
        WHERE id = ${orderId}::uuid
          AND status IN ('assigned','in_progress')
          AND assigned_to IS DISTINCT FROM ${assigneeId}::uuid`;

      if (affected === 1) {
        // 3. Auditoría reassignment en la misma tx (from_status/to_status NULL; from_assignee = previo).
        await tx.orderAudit.create({
          data: {
            id: uuidv7(),
            orderId,
            actorId,
            eventType: 'reassignment',
            fromStatus: null,
            toStatus: null,
            fromAssignee: before?.assigned_to ?? null,
            toAssignee: assigneeId,
            reason,
          },
        });
        const updated = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
        return ok(toRecord(updated));
      }

      // 4. 0 filas: reclasificar sobre la fila bloqueada, PRECEDENCIA status→404 antes que mismo destino→422.
      if (before === null || !(REASSIGNABLE as readonly string[]).includes(before.status)) {
        return err(domainError('ORDER_NOT_FOUND', 'La orden no existe.'));
      }
      return err(
        domainError('INVALID_ASSIGNEE', 'El técnico destino no es válido.', {
          agentAction: 'Elige un técnico distinto, activo y con rol technician.',
        }),
      );
    });
  }
}
