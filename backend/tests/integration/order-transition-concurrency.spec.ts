import { describe, it, expect, afterAll } from 'vitest';
import { SEED_USERS } from '../../prisma/seed-data';
import { PrismaOrderTransitionRepository } from '../../src/infra/repositories/order-transition-repository';
import type { OrderRecord } from '../../src/domain/order/model';
import type { Result } from '../../src/domain/result';
import { makeTestApp } from '../helpers/test-app';
import { makeOrder } from '../helpers/transition';

const { prisma } = makeTestApp();
afterAll(async () => {
  await prisma.$disconnect();
});

const repo = new PrismaOrderTransitionRepository(prisma);
const actor = SEED_USERS.technician.id;

describe('applyTransition — concurrencia optimista = correctness (FR-003, SC-002)', () => {
  it('dos transiciones con la misma expectedVersion → exactamente una gana (1 auditoría), la otra VERSION_CONFLICT', async () => {
    const o = await makeOrder(prisma, { status: 'assigned', assignedTo: actor, version: 0 });

    const results = await Promise.all([
      repo.applyTransition({ orderId: o.id, toStatus: 'in_progress', actorId: actor, expectedVersion: 0 }),
      repo.applyTransition({ orderId: o.id, toStatus: 'in_progress', actorId: actor, expectedVersion: 0 }),
    ]);

    const winners = results.filter((r: Result<OrderRecord>) => r.ok);
    const losers = results.filter((r: Result<OrderRecord>) => !r.ok);
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    for (const l of losers) {
      if (!l.ok) expect(l.error.code).toBe('VERSION_CONFLICT');
    }

    const after = await prisma.order.findUniqueOrThrow({ where: { id: o.id } });
    expect(after.status).toBe('in_progress');
    expect(after.version).toBe(1);
    expect(await prisma.orderAudit.count({ where: { orderId: o.id } })).toBe(1);
  });

  it('caso secuencial determinista: reutilizar una expectedVersion ya consumida → VERSION_CONFLICT', async () => {
    const o = await makeOrder(prisma, { status: 'assigned', assignedTo: actor, version: 0 });

    const first = await repo.applyTransition({
      orderId: o.id,
      toStatus: 'in_progress',
      actorId: actor,
      expectedVersion: 0,
    });
    expect(first.ok).toBe(true);

    const stale = await repo.applyTransition({
      orderId: o.id,
      toStatus: 'pending_review',
      actorId: actor,
      expectedVersion: 0, // obsoleta: la versión ya es 1
    });
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.error.code).toBe('VERSION_CONFLICT');

    expect(await prisma.orderAudit.count({ where: { orderId: o.id } })).toBe(1);
  });
});
