import { mkdtempSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import request from 'supertest';
import { SEED_PASSWORD, SEED_USERS } from '../../prisma/seed-data';
import { makeTestApp, testConfig } from '../helpers/test-app';
import { makeOrder } from '../helpers/transition';
import { stageBlob } from '../helpers/evidence-storage';
import { commitRealEvidence } from '../helpers/evidence';
import { FsStorageAdapter } from '../../src/infra/storage/fs-storage-adapter';
import { validJpeg, validPng } from '../helpers/image-fixtures';
// RED (T038): este módulo AÚN NO EXISTE — lo crea T042 (024, US3, FR-024) como
// `backend/src/infra/storage/gc-job.ts`, exportando una función pura invocable directamente en tests:
//   export function runStagingGc(deps: RunStagingGcDeps): Promise<{ purgedRefs: string[] }>
// con `RunStagingGcDeps = { storage: StoragePort; prisma: PrismaClient; now: Date; stagingTtlMs: number }`.
// Hasta entonces, este import falla y TODO el fichero es rojo por la razón correcta (el job no existe).
import { runStagingGc } from '../../src/infra/storage/gc-job';

// T038 (024, US3, FR-024) — el GC de blobs purga TODO blob sin fila `OrderEvidence` VIGENTE: (a) staged
// abandonado con edad > TTL (24 h) sin fila; (b) fila SUPERADA por un reenvío (FR-017); nunca toca (c) un
// blob staged reciente (en-vuelo, < TTL) ni (d) el blob de la fila VIGENTE. Idempotente (una segunda pasada
// no falla ni cambia el resultado).
const storageDir = mkdtempSync(join(tmpdir(), 'fieldops-evidence-staging-gc-'));
afterAll(async () => {
  await rm(storageDir, { recursive: true, force: true });
});

const ENC_KEY = testConfig().evidenceEncKey;
const { app, prisma } = makeTestApp({ evidenceStorageDir: storageDir });
afterAll(async () => {
  await prisma.$disconnect();
});
const clockNow = { now: (): Date => new Date() };
const storage = new FsStorageAdapter({ baseDir: storageDir, encKey: ENC_KEY, clock: clockNow });

const T = SEED_USERS.technician;
const S = SEED_USERS.supervisor;
let techTok = '';
let supTok = '';
beforeAll(async () => {
  const r1 = await request(app).post('/v1/auth/login').send({ identifier: T.email, password: SEED_PASSWORD });
  techTok = r1.body.access_token;
  const r2 = await request(app).post('/v1/auth/login').send({ identifier: S.email, password: SEED_PASSWORD });
  supTok = r2.body.access_token;
});

const TTL_MS = testConfig().evidenceStagingTtlHours * 3_600_000;

describe('GC de staging/superados (024, US3, FR-024) — runStagingGc', () => {
  it('purga staged abandonado con edad > TTL (24h) sin fila; conserva el staged en-vuelo (< TTL)', async () => {
    const o = await makeOrder(prisma, { status: 'in_progress', assignedTo: T.id });
    const now = Date.now();
    const oldRef = await stageBlob({
      baseDir: storageDir,
      encKey: ENC_KEY,
      ownerId: T.id,
      orderId: o.id,
      bytes: validJpeg(),
      contentType: 'image/jpeg',
      atMs: now - TTL_MS - 60_000, // 1 min más viejo que el TTL
    });
    const freshRef = await stageBlob({
      baseDir: storageDir,
      encKey: ENC_KEY,
      ownerId: T.id,
      orderId: o.id,
      bytes: validPng(),
      contentType: 'image/png',
      atMs: now - 60_000, // 1 min de antigüedad: en-vuelo, muy por debajo del TTL
    });

    const result = await runStagingGc({ storage, prisma, now: new Date(now), stagingTtlMs: TTL_MS });

    expect(result.purgedRefs).toContain(oldRef);
    expect(result.purgedRefs).not.toContain(freshRef);
    const listed = await storage.list();
    expect(listed.some((s) => s.objectRef === oldRef)).toBe(false);
    expect(listed.some((s) => s.objectRef === freshRef)).toBe(true);
  });

  it('purga el blob de una fila SUPERADA (reenvío tras rechazo); conserva el blob de la fila VIGENTE', async () => {
    const o = await makeOrder(prisma, { status: 'in_progress', assignedTo: T.id });

    // Ciclo 1 → superado.
    const commit1 = await commitRealEvidence({
      app,
      prisma,
      baseDir: storageDir,
      encKey: ENC_KEY,
      ownerId: T.id,
      orderId: o.id,
      token: techTok,
      bytes: validJpeg(),
      contentType: 'image/jpeg',
    });
    const reject = await request(app)
      .post(`/v1/orders/${o.id}/review`)
      .set('Authorization', `Bearer ${supTok}`)
      .send({ decision: 'reject', reason: 'faltan fotos del cuadro eléctrico principal' });
    expect(reject.status).toBe(200);

    // Ciclo 2 → vigente.
    const commit2 = await commitRealEvidence({
      app,
      prisma,
      baseDir: storageDir,
      encKey: ENC_KEY,
      ownerId: T.id,
      orderId: o.id,
      token: techTok,
      bytes: validPng(),
      contentType: 'image/png',
    });

    const result = await runStagingGc({ storage, prisma, now: new Date(), stagingTtlMs: TTL_MS });

    expect(result.purgedRefs).toContain(commit1.objectRef); // ciclo superado → purgado
    expect(result.purgedRefs).not.toContain(commit2.objectRef); // ciclo vigente → intacto

    const listed = await storage.list();
    expect(listed.some((s) => s.objectRef === commit1.objectRef)).toBe(false);
    expect(listed.some((s) => s.objectRef === commit2.objectRef)).toBe(true);
  });

  it('idempotente: una segunda pasada no purga nada nuevo ni falla', async () => {
    const o = await makeOrder(prisma, { status: 'in_progress', assignedTo: T.id });
    const now = Date.now();
    const oldRef = await stageBlob({
      baseDir: storageDir,
      encKey: ENC_KEY,
      ownerId: T.id,
      orderId: o.id,
      bytes: validJpeg(),
      contentType: 'image/jpeg',
      atMs: now - TTL_MS - 60_000,
    });
    const first = await runStagingGc({ storage, prisma, now: new Date(now), stagingTtlMs: TTL_MS });
    expect(first.purgedRefs).toContain(oldRef);

    const second = await runStagingGc({ storage, prisma, now: new Date(now), stagingTtlMs: TTL_MS });
    expect(second.purgedRefs).not.toContain(oldRef); // ya no existe: nada que purgar de nuevo
    expect(second.purgedRefs.length).toBe(0);
  });
});
