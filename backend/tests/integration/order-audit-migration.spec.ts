import { describe, it, expect, afterAll } from 'vitest';
import { v7 as uuidv7 } from 'uuid';
import { SEED_USERS } from '../../prisma/seed-data';
import { makeTestApp } from '../helpers/test-app';
import { makeOrder } from '../helpers/transition';
import { PrismaOrderTransitionRepository } from '../../src/infra/repositories/order-write-side-repository';

const { prisma } = makeTestApp();
const repo = new PrismaOrderTransitionRepository(prisma);
afterAll(async () => {
  await prisma.$disconnect();
});

describe('migración OrderAudit (004) — aditiva, backfill, invariantes, trigger (T006/H-003)', () => {
  it("una transición (002b) audita event_type='transition' con from/to_assignee NULL", async () => {
    const o = await makeOrder(prisma, { status: 'assigned', assignedTo: SEED_USERS.technician.id, version: 0 });
    const res = await repo.applyTransition({
      orderId: o.id,
      toStatus: 'in_progress',
      actorId: SEED_USERS.technician.id,
      expectedVersion: 0,
      guard: { assignedTo: SEED_USERS.technician.id },
    });
    expect(res.ok).toBe(true);
    const audit = await prisma.orderAudit.findFirst({ where: { orderId: o.id } });
    expect(audit?.eventType).toBe('transition');
    expect(audit?.fromAssignee).toBeNull();
    expect(audit?.toAssignee).toBeNull();
    expect(audit?.fromStatus).toBe('assigned');
    expect(audit?.toStatus).toBe('in_progress');
  });

  it('el trigger append-only sigue rechazando UPDATE y DELETE sobre order_audit', async () => {
    const o = await makeOrder(prisma, { status: 'assigned', assignedTo: SEED_USERS.technician.id });
    const auditId = uuidv7();
    await prisma.orderAudit.create({
      data: {
        id: auditId,
        orderId: o.id,
        actorId: SEED_USERS.dispatcher.id,
        eventType: 'reassignment',
        fromStatus: null,
        toStatus: null,
        fromAssignee: SEED_USERS.technician.id,
        toAssignee: SEED_USERS.technician2.id,
        reason: 'seed',
      },
    });
    await expect(
      prisma.orderAudit.update({ where: { id: auditId }, data: { reason: 'x' } }),
    ).rejects.toThrow();
    await expect(prisma.orderAudit.delete({ where: { id: auditId } })).rejects.toThrow();
  });

  it('el CHECK rechaza una fila reassignment con from_status no nulo (invariante H-003)', async () => {
    const o = await makeOrder(prisma, { status: 'assigned', assignedTo: SEED_USERS.technician.id });
    await expect(
      prisma.orderAudit.create({
        data: {
          id: uuidv7(),
          orderId: o.id,
          actorId: SEED_USERS.dispatcher.id,
          eventType: 'reassignment',
          fromStatus: 'assigned', // viola el CHECK (reassignment ⇒ from_status NULL)
          toStatus: null,
          toAssignee: SEED_USERS.technician2.id,
          reason: 'invalida',
        },
      }),
    ).rejects.toThrow();
  });
});
