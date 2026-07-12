import { describe, it, expect, afterAll } from 'vitest';
import { SEED_USERS } from '../../prisma/seed-data';
import { makeTestApp } from '../helpers/test-app';
import { makeOrder } from '../helpers/transition';
import { PrismaOrderReassignmentRepository } from '../../src/infra/repositories/order-write-side-repository';

const { prisma } = makeTestApp();
const repo = new PrismaOrderReassignmentRepository(prisma);
afterAll(async () => {
  await prisma.$disconnect();
});

const NONEXISTENT_ACTOR = '018f9999-0000-7000-8000-0000000000aa';

describe('reassignOrder — atomicidad todo-o-nada (SC-007, FR-007)', () => {
  it('si el insert de auditoría falla (actor_id FK inválida), la orden NO queda reasignada ni se audita', async () => {
    const o = await makeOrder(prisma, {
      status: 'assigned',
      assignedTo: SEED_USERS.technician.id,
      version: 0,
    });
    // actorId inexistente → la FK del INSERT de auditoría revienta DENTRO de la tx → rollback del UPDATE.
    await expect(
      repo.reassign({
        orderId: o.id,
        assigneeId: SEED_USERS.technician2.id,
        reason: 'motivo',
        actorId: NONEXISTENT_ACTOR,
      }),
    ).rejects.toThrow(); // el error de BD se propaga (el handler lo mapea a 500 genérico)

    const fresh = await prisma.order.findUnique({ where: { id: o.id } });
    expect(fresh?.assignedTo).toBe(SEED_USERS.technician.id); // intacto
    expect(fresh?.version).toBe(0); // intacto
    const audits = await prisma.orderAudit.findMany({ where: { orderId: o.id } });
    expect(audits).toHaveLength(0); // sin auditoría
  });
});
