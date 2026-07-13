import { describe, it, expect, afterAll } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { SEED_USERS } from '../../prisma/seed-data';
import { makeTestApp } from '../helpers/test-app';
import { makePendingReviewOrder } from '../helpers/transition';
import { PrismaReviewOrderRepository } from '../../src/infra/repositories/order-review-repository';

// T018 (006, US2, FR-004) — atomicidad todo-o-nada: si falla la inserción de auditoría (approve y reject por
// separado), la orden NO transiciona y no queda auditoría nueva de ese intento.
const { prisma } = makeTestApp();
afterAll(async () => {
  await prisma.$disconnect();
});

const S = SEED_USERS.supervisor;
const T = SEED_USERS.technician;

// Hace reventar orderAudit.create DENTRO de la $transaction (fuerza rollback del UPDATE ya aplicado).
function faultyPrisma(): PrismaClient {
  const handler: ProxyHandler<PrismaClient> = {
    get(target, prop, receiver) {
      if (prop === '$transaction') {
        return (fn: (tx: unknown) => unknown) =>
          (target.$transaction as (f: (tx: unknown) => unknown) => unknown)((tx) => {
            const txProxy = new Proxy(tx as Record<string, unknown>, {
              get(t, p) {
                if (p === 'orderAudit') {
                  return {
                    create: async () => {
                      throw new Error('boom');
                    },
                  };
                }
                return Reflect.get(t, p);
              },
            });
            return fn(txProxy);
          });
      }
      return Reflect.get(target, prop, receiver);
    },
  };
  return new Proxy(prisma, handler);
}

describe('reviewOrder — atomicidad (006, FR-004)', () => {
  for (const decision of ['approve', 'reject'] as const) {
    it(`${decision}: fallo al insertar la auditoría → rollback total, sin transición`, async () => {
      const o = await makePendingReviewOrder(prisma, { assignedTo: T.id, withEvidence: true, version: 2 });
      const repo = new PrismaReviewOrderRepository(faultyPrisma());
      await expect(
        repo.review({ orderId: o.id, actorId: S.id, decision, reason: decision === 'reject' ? 'motivo' : null }),
      ).rejects.toThrow();

      const fresh = await prisma.order.findUniqueOrThrow({ where: { id: o.id } });
      expect(fresh.status).toBe('pending_review'); // sin transición
      expect(fresh.version).toBe(2); // version intacta
      // No hay auditoría de transición de revisión (closed/in_progress) para esta orden.
      const reviewAudits = await prisma.orderAudit.count({
        where: { orderId: o.id, toStatus: { in: ['closed', 'in_progress'] } },
      });
      expect(reviewAudits).toBe(0);
    });
  }
});
