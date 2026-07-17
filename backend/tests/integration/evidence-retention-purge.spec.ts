import { mkdtempSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import request from 'supertest';
import { v7 as uuidv7 } from 'uuid';
import { SEED_PASSWORD, SEED_USERS } from '../../prisma/seed-data';
import { makeTestApp, testConfig } from '../helpers/test-app';
import { makeOrder } from '../helpers/transition';
import { commitRealEvidence, getEvidence } from '../helpers/evidence';
import { FsStorageAdapter } from '../../src/infra/storage/fs-storage-adapter';
import { validJpeg } from '../helpers/image-fixtures';
// RED (T039): este módulo AÚN NO EXISTE — lo crea T043 (024, US3, FR-018) como
// `backend/src/infra/storage/retention-job.ts`, exportando una función pura invocable directamente en
// tests: export function runRetentionPurge(deps: RunRetentionPurgeDeps): Promise<{ purgedRefs: string[] }>
// con `RunRetentionPurgeDeps = { storage: StoragePort; prisma: PrismaClient; now: Date; retentionDays: number }`.
// Hasta entonces, este import falla y TODO el fichero es rojo por la razón correcta (el job no existe).
import { runRetentionPurge } from '../../src/infra/storage/retention-job';

const RETENTION_DAYS = 90;
const DAY_MS = 86_400_000;

// T039 (024, US3, FR-018/SC-006) — orden `closed` con antigüedad > 90 días (medida desde el evento de
// cierre en `OrderAudit`, único registro append-only con timestamp fiable — `Order.updatedAt` se pisa en
// cada escritura) → el binario se PURGA FÍSICAMENTE (ciclo de almacenamiento puro, sin semántica de
// acceso); la FILA permanece (metadatos/auditoría inmutables, XI); el acceso a evidencia de una orden
// `closed` sigue devolviendo 404 (NUNCA 410 — `closed` está fuera de alcance de todo rol, FR-003/FR-007,
// independientemente de si el blob existe). Orden `closed` reciente (< 90 días) → blob intacto.
const storageDir = mkdtempSync(join(tmpdir(), 'fieldops-evidence-retention-'));
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
let techTok = '';
beforeAll(async () => {
  const r = await request(app).post('/v1/auth/login').send({ identifier: T.email, password: SEED_PASSWORD });
  techTok = r.body.access_token;
});

// Cierra una orden en la fecha indicada (evento de cierre auditable, independiente de `updatedAt`).
async function closeOrderAt(orderId: string, closedAtMs: number): Promise<void> {
  await prisma.order.update({ where: { id: orderId }, data: { status: 'closed' } });
  await prisma.orderAudit.create({
    data: {
      id: uuidv7(),
      orderId,
      actorId: T.id,
      eventType: 'transition',
      fromStatus: 'pending_review',
      toStatus: 'closed',
      reason: null,
      at: new Date(closedAtMs),
    },
  });
}

describe('purga por retención (024, US3, FR-018/SC-006) — runRetentionPurge', () => {
  it('closed > 90 días: purga física del blob; la fila permanece; acceso → 404 (nunca 410)', async () => {
    const o = await makeOrder(prisma, { status: 'in_progress', assignedTo: T.id });
    const commit = await commitRealEvidence({
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
    const now = Date.now();
    await closeOrderAt(o.id, now - (RETENTION_DAYS + 1) * DAY_MS);

    const result = await runRetentionPurge({ storage, prisma, now: new Date(now), retentionDays: RETENTION_DAYS });
    expect(result.purgedRefs).toContain(commit.objectRef);

    const listed = await storage.list();
    expect(listed.some((s) => s.objectRef === commit.objectRef)).toBe(false); // purgado físicamente

    const row = await prisma.orderEvidence.findUnique({ where: { id: commit.evidenceId } });
    expect(row).not.toBeNull(); // la fila de metadatos permanece (append-only, XI)

    const res = await getEvidence(app, o.id, commit.evidenceId, techTok);
    expect(res.status).toBe(404); // closed fuera de alcance de todo rol: nunca 410
    expect(res.status).not.toBe(410);
  });

  it('closed reciente (< 90 días): el blob permanece intacto', async () => {
    const o = await makeOrder(prisma, { status: 'in_progress', assignedTo: T.id });
    const commit = await commitRealEvidence({
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
    const now = Date.now();
    await closeOrderAt(o.id, now - 10 * DAY_MS); // cerrada hace solo 10 días

    const result = await runRetentionPurge({ storage, prisma, now: new Date(now), retentionDays: RETENTION_DAYS });
    expect(result.purgedRefs).not.toContain(commit.objectRef);

    const listed = await storage.list();
    expect(listed.some((s) => s.objectRef === commit.objectRef)).toBe(true); // blob intacto
  });

  it('orden abierta (no closed) nunca se purga, aunque su evidencia sea "antigua"', async () => {
    const o = await makeOrder(prisma, { status: 'in_progress', assignedTo: T.id });
    const commit = await commitRealEvidence({
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
    const now = Date.now();
    const result = await runRetentionPurge({ storage, prisma, now: new Date(now), retentionDays: RETENTION_DAYS });
    expect(result.purgedRefs).not.toContain(commit.objectRef);
    const listed = await storage.list();
    expect(listed.some((s) => s.objectRef === commit.objectRef)).toBe(true);
  });
});
