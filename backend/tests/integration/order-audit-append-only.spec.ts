import { describe, it, expect, afterAll } from 'vitest';
import { v7 as uuidv7 } from 'uuid';
import { SEED_USERS } from '../../prisma/seed-data';
import { makeTestApp } from '../helpers/test-app';
import { makeOrder } from '../helpers/transition';

const { prisma } = makeTestApp();
afterAll(async () => {
  await prisma.$disconnect();
});

const actor = SEED_USERS.technician.id;

// El cliente Prisma se conecta con el ROL DE RUNTIME de la app (`fieldops`, propietario de la tabla).
// El TRIGGER bloquea UPDATE/DELETE incluso al propietario (a diferencia de un REVOKE) — SC-003, G2:S-002.
describe('OrderAudit append-only (FR-005, SC-003)', () => {
  it('UPDATE/DELETE directo sobre order_audit (rol runtime) → error de BD por el TRIGGER', async () => {
    const o = await makeOrder(prisma, { status: 'assigned', assignedTo: actor, version: 0 });
    const auditId = uuidv7();
    await prisma.orderAudit.create({
      data: {
        id: auditId,
        orderId: o.id,
        actorId: actor,
        fromStatus: 'assigned',
        toStatus: 'in_progress',
        reason: null,
      },
    });

    await expect(
      prisma.orderAudit.update({ where: { id: auditId }, data: { reason: 'tampered' } }),
    ).rejects.toThrow();

    await expect(prisma.orderAudit.delete({ where: { id: auditId } })).rejects.toThrow();

    // La fila permanece intacta.
    const row = await prisma.orderAudit.findUnique({ where: { id: auditId } });
    expect(row).not.toBeNull();
    expect(row?.reason).toBeNull();
  });
});
