import { describe, it, expect, afterAll } from 'vitest';
import { v7 as uuidv7 } from 'uuid';
import { SEED_USERS } from '../../prisma/seed-data';
import { PrismaOrderTransitionRepository } from '../../src/infra/repositories/order-write-side-repository';
import { makeTestApp } from '../helpers/test-app';
import { makeOrder } from '../helpers/transition';

const { prisma } = makeTestApp();
afterAll(async () => {
  await prisma.$disconnect();
});

const repo = new PrismaOrderTransitionRepository(prisma);
const assignee = SEED_USERS.technician.id;

describe('applyTransition — atomicidad (FR-004, SC-004, G1:H-009)', () => {
  it('actor_id inexistente → FK falla dentro de $transaction → rollback + ACTOR_INVALID sin filtrar BD', async () => {
    const o = await makeOrder(prisma, { status: 'assigned', assignedTo: assignee, version: 0 });
    const ghostActor = uuidv7(); // no existe en users → viola la FK del insert de auditoría

    const res = await repo.applyTransition({
      orderId: o.id,
      toStatus: 'in_progress',
      actorId: ghostActor,
      expectedVersion: 0,
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('ACTOR_INVALID');
      // El mensaje crudo de Postgres NO se propaga (sin fugas de esquema/constraint).
      const serialized = JSON.stringify(res.error).toLowerCase();
      expect(serialized).not.toContain('constraint');
      expect(serialized).not.toContain('foreign key');
      expect(serialized).not.toContain('fkey');
      expect(serialized).not.toContain('p2003');
    }

    // Rollback total: la orden NO transiciona y NO hay auditoría.
    const after = await prisma.order.findUniqueOrThrow({ where: { id: o.id } });
    expect(after.status).toBe('assigned');
    expect(after.version).toBe(0);
    expect(await prisma.orderAudit.count({ where: { orderId: o.id } })).toBe(0);
  });
});
