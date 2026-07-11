import { describe, it, expect, afterAll } from 'vitest';
import { v7 as uuidv7 } from 'uuid';
import { SEED_USERS } from '../../prisma/seed-data';
import { PrismaOrderTransitionRepository } from '../../src/infra/repositories/order-transition-repository';
import { createLogger } from '../../src/infra/logger';
import { makeTestApp } from '../helpers/test-app';
import { makeOrder } from '../helpers/transition';

const { prisma } = makeTestApp();
afterAll(async () => {
  await prisma.$disconnect();
});

const repo = new PrismaOrderTransitionRepository(prisma);
const actor = SEED_USERS.technician.id;
const SENTINEL = 'SENTINEL_REASON_PII_1234';

describe('no-fuga de reason (FR-008, SC-006, G1:S-002)', () => {
  it('reason NO aparece en el error serializado al forzar un fallo', async () => {
    const o = await makeOrder(prisma, { status: 'assigned', assignedTo: actor, version: 0 });
    const res = await repo.applyTransition({
      orderId: o.id,
      toStatus: 'in_progress',
      actorId: uuidv7(), // fuerza ACTOR_INVALID
      reason: SENTINEL,
      expectedVersion: 0,
    });
    expect(res.ok).toBe(false);
    expect(JSON.stringify(res.ok ? {} : res.error)).not.toContain(SENTINEL);
  });

  it('el logger redacta `reason` (y `*.reason`) en logs estructurados', () => {
    let out = '';
    const logger = createLogger({ stream: { write: (s: string) => { out += s; } } });
    logger.info({ reason: SENTINEL, audit: { reason: SENTINEL } }, 'transición');
    expect(out).not.toContain(SENTINEL);
    expect(out).toContain('[Redacted]');
  });
});
