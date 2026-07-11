import { describe, it, expect, afterAll } from 'vitest';
import { v7 as uuidv7 } from 'uuid';
import { SEED_USERS } from '../../prisma/seed-data';
import { PrismaRefreshTokenRepository } from '../../src/infra/repositories/refresh-token-repository';
import { makeTestApp } from '../helpers/test-app';

const { prisma } = makeTestApp();
afterAll(async () => {
  await prisma.$disconnect();
});

const repo = new PrismaRefreshTokenRepository(prisma);
const future = new Date(Date.now() + 7 * 86_400_000);

async function tokenIn(sessionRevoked: boolean): Promise<string> {
  const session = await prisma.session.create({
    data: {
      id: uuidv7(),
      userId: SEED_USERS.dispatcher.id,
      revokedAt: sessionRevoked ? new Date() : null,
    },
  });
  const rt = await repo.create({
    sessionId: session.id,
    tokenHash: `${uuidv7()}${uuidv7()}`,
    expiresAt: future,
  });
  return rt.id;
}

describe('rotateAtomic — atomicidad D6/FR-004 (B2/B6, cierra TOCTOU)', () => {
  it('sesión viva → rota (true)', async () => {
    const id = await tokenIn(false);
    expect(await repo.rotateAtomic(id, uuidv7())).toBe(true);
  });

  it('sesión revocada → NO rota (false): el WHERE atómico exige sesión no revocada', async () => {
    const id = await tokenIn(true);
    expect(await repo.rotateAtomic(id, uuidv7())).toBe(false);
  });

  it('token ya rotado → NO rota de nuevo (single-use)', async () => {
    const id = await tokenIn(false);
    expect(await repo.rotateAtomic(id, uuidv7())).toBe(true);
    expect(await repo.rotateAtomic(id, uuidv7())).toBe(false);
  });
});
