import type { Order as PrismaOrder } from '@prisma/client';
import type { OrderRecord, OrderStatus } from '../../domain/order/model';

// Mapeo compartido Prisma→dominio (camelCase interno) usado por los repos write-side (002b/004/005/024).
// Extraído para no duplicarlo entre `order-write-side-repository.ts` y `order-execution-repository.ts`.
export function toOrderRecord(o: PrismaOrder): OrderRecord {
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
