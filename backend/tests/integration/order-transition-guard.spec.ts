import { describe, it, expect, afterAll } from 'vitest';
import { SEED_USERS } from '../../prisma/seed-data';
import { PrismaOrderTransitionRepository } from '../../src/infra/repositories/order-transition-repository';
import { makeTestApp } from '../helpers/test-app';
import { makeOrder } from '../helpers/transition';

const { prisma } = makeTestApp();
afterAll(async () => {
  await prisma.$disconnect();
});

const repo = new PrismaOrderTransitionRepository(prisma);
const owner = SEED_USERS.technician.id;
const other = SEED_USERS.technician2.id;

describe('applyTransition — guarda de pertenencia (FR-003/007, SC-005)', () => {
  it('guard.assignedTo que NO coincide → GUARD_UNMET, sin transición ni auditoría', async () => {
    const o = await makeOrder(prisma, { status: 'assigned', assignedTo: owner, version: 0 });

    const res = await repo.applyTransition({
      orderId: o.id,
      toStatus: 'in_progress',
      actorId: owner,
      expectedVersion: 0,
      guard: { assignedTo: other }, // no coincide con owner
    });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('GUARD_UNMET');

    const after = await prisma.order.findUniqueOrThrow({ where: { id: o.id } });
    expect(after.status).toBe('assigned');
    expect(after.version).toBe(0);
    expect(await prisma.orderAudit.count({ where: { orderId: o.id } })).toBe(0);
  });

  it('TOCTOU determinista secuencial: assigned_to cambia (commit) y la guarda queda obsoleta → GUARD_UNMET', async () => {
    const o = await makeOrder(prisma, { status: 'assigned', assignedTo: owner, version: 0 });

    // Mutación de pertenencia confirmada ANTES de aplicar (no toca status/version).
    await prisma.order.update({ where: { id: o.id }, data: { assignedTo: other } });

    const res = await repo.applyTransition({
      orderId: o.id,
      toStatus: 'in_progress',
      actorId: owner,
      expectedVersion: 0,
      guard: { assignedTo: owner }, // guarda obsoleta: ahora pertenece a `other`
    });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('GUARD_UNMET');
    expect(await prisma.orderAudit.count({ where: { orderId: o.id } })).toBe(0);
  });
});
