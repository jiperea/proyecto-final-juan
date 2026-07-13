import { describe, it, expect, afterAll } from 'vitest';
import { SEED_USERS } from '../../prisma/seed-data';
import { PrismaOrderTransitionRepository } from '../../src/infra/repositories/order-write-side-repository';
import type { OrderStatus } from '../../src/domain/order/model';
import { makeTestApp } from '../helpers/test-app';
import { makeOrder } from '../helpers/transition';

const { prisma } = makeTestApp();
afterAll(async () => {
  await prisma.$disconnect();
});

const repo = new PrismaOrderTransitionRepository(prisma);
const actor = SEED_USERS.technician.id;

const LEGAL: [OrderStatus, OrderStatus][] = [
  ['assigned', 'in_progress'],
  ['in_progress', 'pending_review'],
  ['pending_review', 'closed'],
  ['pending_review', 'in_progress'],
];

describe('applyTransition — transición legal atómica (FR-001/004, SC-001)', () => {
  for (const [from, to] of LEGAL) {
    it(`${from}→${to}: status cambia, version+1, 1 fila de auditoría (misma transacción)`, async () => {
      const o = await makeOrder(prisma, { status: from, assignedTo: actor, version: 3 });

      const res = await repo.applyTransition({
        orderId: o.id,
        toStatus: to,
        actorId: actor,
        reason: 'motivo saneado',
        expectedVersion: 3,
      });

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.value.status).toBe(to);
        expect(res.value.version).toBe(4);
      }

      const after = await prisma.order.findUniqueOrThrow({ where: { id: o.id } });
      expect(after.status).toBe(to);
      expect(after.version).toBe(4);

      const audits = await prisma.orderAudit.findMany({ where: { orderId: o.id } });
      expect(audits).toHaveLength(1);
      expect(audits[0]).toMatchObject({
        fromStatus: from,
        toStatus: to,
        actorId: actor,
        reason: 'motivo saneado',
      });
      expect(audits[0]?.at).toBeInstanceOf(Date);
    });
  }
});
