import { describe, it, expect, afterAll } from 'vitest';
import { v7 as uuidv7 } from 'uuid';
import { SEED_USERS } from '../../prisma/seed-data';
import { PrismaOrderTransitionRepository } from '../../src/infra/repositories/order-transition-repository';
import { makeTestApp } from '../helpers/test-app';
import { makeOrder } from '../helpers/transition';

const { prisma } = makeTestApp();
afterAll(async () => {
  await prisma.$disconnect();
});

const repo = new PrismaOrderTransitionRepository(prisma);
const actor = SEED_USERS.technician.id;

describe('applyTransition — efectos negativos SIN efecto, orden determinista (FR-002/003, SC-001)', () => {
  it('orderId inexistente → ORDER_NOT_FOUND (404)', async () => {
    const res = await repo.applyTransition({
      orderId: uuidv7(),
      toStatus: 'in_progress',
      actorId: actor,
      expectedVersion: 0,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('ORDER_NOT_FOUND');
  });

  it('expectedVersion obsoleta → VERSION_CONFLICT (409), sin efecto', async () => {
    const o = await makeOrder(prisma, { status: 'assigned', assignedTo: actor, version: 5 });
    const res = await repo.applyTransition({
      orderId: o.id,
      toStatus: 'in_progress',
      actorId: actor,
      expectedVersion: 0,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('VERSION_CONFLICT');

    const after = await prisma.order.findUniqueOrThrow({ where: { id: o.id } });
    expect(after.status).toBe('assigned');
    expect(after.version).toBe(5);
    expect(await prisma.orderAudit.count({ where: { orderId: o.id } })).toBe(0);
  });

  it('transición ilegal → INVALID_TRANSITION (422), sin efecto', async () => {
    const o = await makeOrder(prisma, { status: 'assigned', assignedTo: actor, version: 0 });
    const res = await repo.applyTransition({
      orderId: o.id,
      toStatus: 'pending_review', // assigned→pending_review no es legal
      actorId: actor,
      expectedVersion: 0,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('INVALID_TRANSITION');

    const after = await prisma.order.findUniqueOrThrow({ where: { id: o.id } });
    expect(after.status).toBe('assigned');
    expect(after.version).toBe(0);
    expect(await prisma.orderAudit.count({ where: { orderId: o.id } })).toBe(0);
  });
});
