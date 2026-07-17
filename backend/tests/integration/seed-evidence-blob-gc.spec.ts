// 026 (T008 · US1 · FR-014) — Fase RED. El `OrderAudit` que el seed crea para la evidencia ancla debe usar
// `reason: 'execution_registered'` (NO `null`) para que el GC de staging real (`runStagingGc`,
// `gc-job.ts::latestSubmitAuditId`) la reconozca como CICLO VIGENTE y no purgue su blob al arrancar el
// backend. Caso de CONTROL: con `reason: null` (comportamiento legacy/erróneo), el mismo blob SÍ sería
// purgado — demuestra por qué la corrección es necesaria.
//
// `seedEvidenceBlobForOrder` AÚN NO EXISTE (mismo contrato que en seed-evidence-blob-write.spec.ts) — hasta
// que `dev-backend` lo implemente (T007/T008), el import falla y TODO el fichero es rojo por la razón
// correcta. Una vez exista, si su `OrderAudit` sigue con `reason: null` (sin el fix de T008), el primer test
// («sobrevive al GC») fallará igualmente por la razón correcta (el blob se purga).
import { mkdtempSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { SEED_USERS } from '../../prisma/seed-data';
import { seedEvidenceBlobForOrder } from '../../prisma/seed';
import { FsStorageAdapter } from '../../src/infra/storage/fs-storage-adapter';
import { runStagingGc } from '../../src/infra/storage/gc-job';
import { makeOrder } from '../helpers/transition';
import { testConfig } from '../helpers/test-app';
import { buildContainer } from '../../src/infra/container';

const storageDir = mkdtempSync(join(tmpdir(), 'fieldops-seed-evidence-gc-'));
const ENC_KEY = testConfig().evidenceEncKey;
const clock = { now: (): Date => new Date() };
const storage = new FsStorageAdapter({ baseDir: storageDir, encKey: ENC_KEY, clock });
const TTL_MS = testConfig().evidenceStagingTtlHours * 3_600_000;

let prisma: PrismaClient;
beforeAll(() => {
  ({ prisma } = buildContainer(testConfig({ evidenceStorageDir: storageDir })));
});
afterAll(async () => {
  await prisma.$disconnect();
  await rm(storageDir, { recursive: true, force: true });
});

describe('026 · el GC de staging NO purga la evidencia sembrada (FR-014)', () => {
  it('el audit ancla usa reason:"execution_registered" (no null)', async () => {
    const o = await makeOrder(prisma, { status: 'in_progress', assignedTo: SEED_USERS.technician.id });
    const { auditId } = await seedEvidenceBlobForOrder({
      prisma,
      storage,
      orderId: o.id,
      actorId: SEED_USERS.technician.id,
    });
    const audit = await prisma.orderAudit.findUnique({ where: { id: auditId } });
    expect(audit?.reason).toBe('execution_registered');
  });

  it('la evidencia sembrada SOBREVIVE al runStagingGc real (ciclo vigente)', async () => {
    const o = await makeOrder(prisma, { status: 'in_progress', assignedTo: SEED_USERS.technician.id });
    const { objectRef } = await seedEvidenceBlobForOrder({
      prisma,
      storage,
      orderId: o.id,
      actorId: SEED_USERS.technician.id,
    });

    const result = await runStagingGc({ storage, prisma, now: new Date(), stagingTtlMs: TTL_MS });

    expect(result.purgedRefs).not.toContain(objectRef);
    const listed = await storage.list();
    expect(listed.some((s) => s.objectRef === objectRef)).toBe(true);
  });

  it('CONTROL: con reason:null (bug legacy) el mismo blob SÍ sería purgado por el GC', async () => {
    const o = await makeOrder(prisma, { status: 'in_progress', assignedTo: SEED_USERS.technician.id });
    const { objectRef, auditId } = await seedEvidenceBlobForOrder({
      prisma,
      storage,
      orderId: o.id,
      actorId: SEED_USERS.technician.id,
    });
    // Simula el bug legacy corrigiendo el dato DESPUÉS de sembrar (el fix real está en no crearlo así).
    await prisma.orderAudit.update({ where: { id: auditId }, data: { reason: null } });

    const result = await runStagingGc({ storage, prisma, now: new Date(), stagingTtlMs: TTL_MS });

    expect(result.purgedRefs).toContain(objectRef);
    const listed = await storage.list();
    expect(listed.some((s) => s.objectRef === objectRef)).toBe(false);
  });
});
