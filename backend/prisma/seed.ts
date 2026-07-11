import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import { v7 as uuidv7 } from 'uuid';
import { normalizeIdentifier } from '../src/domain/model';
import { NONEXISTENT_PROBE_ID, SEED_PASSWORD, SEED_PROBES, SEED_USERS } from './seed-data';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  // Orden inverso de FK para re-seed idempotente.
  await prisma.refreshToken.deleteMany();
  await prisma.session.deleteMany();
  await prisma.identifier.deleteMany();
  await prisma.user.deleteMany();
  await prisma.probeResource.deleteMany();

  const passwordHash = await argon2.hash(SEED_PASSWORD, { type: argon2.argon2id });
  const now = Date.now();

  for (const u of Object.values(SEED_USERS)) {
    const lockedUntil =
      'lockedMinutes' in u && u.lockedMinutes ? new Date(now + u.lockedMinutes * 60_000) : null;
    const disabledAt = 'disabled' in u && u.disabled ? new Date(now) : null;
    await prisma.user.create({
      data: {
        id: u.id,
        email: u.email,
        username: u.username,
        passwordHash,
        role: u.role,
        lockedUntil,
        disabledAt,
        identifiers: {
          create: [
            { id: uuidv7(), norm: normalizeIdentifier(u.email), kind: 'email' },
            { id: uuidv7(), norm: normalizeIdentifier(u.username), kind: 'username' },
          ],
        },
      },
    });
  }

  for (const p of Object.values(SEED_PROBES)) {
    await prisma.probeResource.create({
      data: { id: p.id, inScopeRoles: [...p.inScopeRoles] },
    });
  }

  // NONEXISTENT_PROBE_ID se deja SIN crear a propósito (404-por-inexistencia).
  void NONEXISTENT_PROBE_ID;
  // eslint-disable-next-line no-console
  console.log('Seed OK: usuarios + probes creados.');
}

main()
  .catch((e: unknown) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
