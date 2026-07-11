import type { Order as PrismaOrder, PrismaClient } from '@prisma/client';
import type { OrderRecord, OrderStatus } from '../../domain/order/model';
import type { OrderRepositoryPort } from '../../domain/order/ports';
import type { OrderScope } from '../../domain/order/scope-policy';

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

export class PrismaOrderRepository implements OrderRepositoryPort {
  constructor(private readonly prisma: PrismaClient) {}

  async listForScope(scope: OrderScope): Promise<OrderRecord[]> {
    const rows = await this.prisma.order.findMany({
      where: {
        status: { in: [...scope.statuses] },
        ...(scope.assignedTo !== null ? { assignedTo: scope.assignedTo } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], // FR-012 (tiebreak id desc)
    });
    return rows.map(toRecord);
  }
}
