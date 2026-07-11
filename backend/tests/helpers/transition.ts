import type { PrismaClient } from '@prisma/client';
import { v7 as uuidv7 } from 'uuid';
import type { OrderStatus } from '../../src/domain/order/model';

// Crea una orden aislada para tests de transición (ids únicos → sin colisión entre archivos/paralelo).
export async function makeOrder(
  prisma: PrismaClient,
  opts: { status: OrderStatus; assignedTo?: string | null; version?: number },
): Promise<{ id: string; version: number; status: OrderStatus; assignedTo: string | null }> {
  const o = await prisma.order.create({
    data: {
      id: uuidv7(),
      title: 'orden de prueba',
      description: 'descripción de prueba',
      status: opts.status,
      assignedTo: opts.assignedTo ?? null,
      version: opts.version ?? 0,
    },
  });
  return {
    id: o.id,
    version: o.version,
    status: o.status as OrderStatus,
    assignedTo: o.assignedTo,
  };
}
