import { mkdtempSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import request from 'supertest';
import type { DeniedAccessEvent } from '../../src/domain/order/read-side/ports';
import { domainError, err } from '../../src/domain/result';
import { SEED_PASSWORD, SEED_USERS } from '../../prisma/seed-data';
import { makeTestApp, makeTestAppWithEvidence, makeTestAppWithUpload, testConfig } from '../helpers/test-app';
import { makeOrder } from '../helpers/transition';
import { commitRealEvidence, getEvidence, uploadEvidence } from '../helpers/evidence';
import { FsStorageAdapter } from '../../src/infra/storage/fs-storage-adapter';
import { validJpeg } from '../helpers/image-fixtures';

// Remediación G3 — I-001 (ALTA, 503 fail-closed) / I-002 (MEDIA, fallo de readAudit → 503) / S-003 (MEDIA,
// señal best-effort de acceso denegado en uploadOrderEvidence). Sigue el patrón de fault-injection de
// review-db-errors.spec.ts (mock del puerto que lanza/devuelve el error de conexión, sin tocar Postgres real).
const storageDir = mkdtempSync(join(tmpdir(), 'fieldops-evidence-fail-closed-'));
afterAll(async () => {
  await rm(storageDir, { recursive: true, force: true });
});

const ENC_KEY = testConfig().evidenceEncKey;
const { app: baseApp, prisma } = makeTestApp({ evidenceStorageDir: storageDir });
afterAll(async () => {
  await prisma.$disconnect();
});

const T = SEED_USERS.technician;

async function token(email: string): Promise<string> {
  const r = await request(baseApp).post('/v1/auth/login').send({ identifier: email, password: SEED_PASSWORD });
  return r.body.access_token as string;
}
let techTok = '';
beforeAll(async () => {
  techTok = await token(T.email);
});

describe('getOrderEvidence — 503 fail-closed vs 410 blob ausente (I-001/I-002)', () => {
  it('el reader (BD) cae → 503, nunca 500/404', async () => {
    const { app } = makeTestAppWithEvidence(
      {
        reader: {
          findOrderForEvidence: async () => {
            throw domainError('SERVICE_UNAVAILABLE', 'El servicio no está disponible.');
          },
          findEvidenceRow: async () => null,
        },
      },
      { evidenceStorageDir: storageDir },
    );
    const NONEXISTENT = '00000000-0000-7000-8000-000000000000';
    const res = await getEvidence(app, NONEXISTENT, NONEXISTENT, techTok);
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('SERVICE_UNAVAILABLE');
  });

  it('el reader (BD) cae al buscar la fila de evidencia → 503, nunca 500/404', async () => {
    const o = await makeOrder(prisma, { status: 'in_progress', assignedTo: T.id });
    const { app } = makeTestAppWithEvidence(
      {
        reader: {
          findOrderForEvidence: async () => ({ status: 'in_progress', assignedTo: T.id }),
          findEvidenceRow: async () => {
            throw domainError('SERVICE_UNAVAILABLE', 'El servicio no está disponible.');
          },
        },
      },
      { evidenceStorageDir: storageDir },
    );
    const SOME_ID = '00000000-0000-7000-8000-000000000001';
    const res = await getEvidence(app, o.id, SOME_ID, techTok);
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('SERVICE_UNAVAILABLE');
  });

  it('el StoragePort cae (almacenamiento caído) al leer el blob → 503, DISTINTO de blob ausente (410)', async () => {
    const o = await makeOrder(prisma, { status: 'in_progress', assignedTo: T.id });
    const commit = await commitRealEvidence({
      app: baseApp,
      prisma,
      baseDir: storageDir,
      encKey: ENC_KEY,
      ownerId: T.id,
      orderId: o.id,
      token: techTok,
      bytes: validJpeg(),
      contentType: 'image/jpeg',
    });
    const { app } = makeTestAppWithEvidence(
      {
        storage: {
          putStaged: async () => 'unused',
          parseRef: () => err('malformed' as const),
          signRead: async () => 'fake-handle',
          read: async () => {
            // Fallo REAL del store (p. ej. conexión/disco caído) — DISTINTO de "blob ausente" (ENOENT).
            throw new Error('storage backend unreachable');
          },
          list: async () => [],
          delete: async () => undefined,
        },
      },
      { evidenceStorageDir: storageDir },
    );
    const res = await getEvidence(app, o.id, commit.evidenceId, techTok);
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('SERVICE_UNAVAILABLE');
  });

  it('CONTRASTE: blob genuinamente ausente (purgado) sigue → 410, nunca 503 (el storage real SÍ responde)', async () => {
    const o = await makeOrder(prisma, { status: 'in_progress', assignedTo: T.id });
    const commit = await commitRealEvidence({
      app: baseApp,
      prisma,
      baseDir: storageDir,
      encKey: ENC_KEY,
      ownerId: T.id,
      orderId: o.id,
      token: techTok,
      bytes: validJpeg(),
      contentType: 'image/jpeg',
    });
    const storage = new FsStorageAdapter({ baseDir: storageDir, encKey: ENC_KEY, clock: { now: () => new Date() } });
    await storage.delete(commit.objectRef); // simula purga/legacy: readFile lanza ENOENT, no un fallo de store.

    const res = await getEvidence(baseApp, o.id, commit.evidenceId, techTok);
    expect(res.status).toBe(410);
    expect(res.body.code).toBe('EVIDENCE_GONE');
  });

  it('un fallo de readAudit.record (p. ej. BD caída) → 503, y el binario NUNCA se sirve (I-002)', async () => {
    const o = await makeOrder(prisma, { status: 'in_progress', assignedTo: T.id });
    const commit = await commitRealEvidence({
      app: baseApp,
      prisma,
      baseDir: storageDir,
      encKey: ENC_KEY,
      ownerId: T.id,
      orderId: o.id,
      token: techTok,
      bytes: validJpeg(),
      contentType: 'image/jpeg',
    });
    const { app } = makeTestAppWithEvidence(
      {
        readAudit: {
          record: async () => {
            throw new Error('EvidenceReadAudit insert falló (BD caída)');
          },
        },
      },
      { evidenceStorageDir: storageDir },
    );
    const res = await getEvidence(app, o.id, commit.evidenceId, techTok);
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('SERVICE_UNAVAILABLE');
    // Nunca sirve el binario: ni Content-Type de imagen ni cuerpo binario.
    expect(res.headers['content-type']).toMatch(/json/);
    expect(Buffer.isBuffer(res.body) ? res.body.length : 0).toBe(0);
  });
});

describe('uploadOrderEvidence — 503 fail-closed (I-001)', () => {
  it('el lookup (BD) cae al comprobar autz-primero → 503, nunca 500/404', async () => {
    const { app } = makeTestAppWithUpload(
      {
        lookup: {
          findOrderForUpload: async () => {
            throw domainError('SERVICE_UNAVAILABLE', 'El servicio no está disponible.');
          },
          filterCommittedRefs: async () => new Set(),
        },
      },
      { evidenceStorageDir: storageDir },
    );
    const o = await makeOrder(prisma, { status: 'in_progress', assignedTo: T.id });
    const res = await uploadEvidence(app, o.id, techTok, validJpeg());
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('SERVICE_UNAVAILABLE');
  });

  it('el StoragePort cae (almacenamiento caído) al guardar el blob en staging → 503, nunca 500', async () => {
    const { app } = makeTestAppWithUpload(
      {
        storage: {
          putStaged: async () => {
            throw new Error('storage backend unreachable');
          },
          parseRef: () => err('malformed' as const),
          signRead: async () => 'fake-handle',
          read: async () => ({ expired: true }) as const,
          list: async () => [],
          delete: async () => undefined,
        },
      },
      { evidenceStorageDir: storageDir },
    );
    const o = await makeOrder(prisma, { status: 'in_progress', assignedTo: T.id });
    const res = await uploadEvidence(app, o.id, techTok, validJpeg());
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('SERVICE_UNAVAILABLE');
  });
});

describe('uploadOrderEvidence — señal best-effort de acceso denegado (S-003, FR-009)', () => {
  it('un intento NO autorizado (no-dueño) → 404 y emite la MISMA señal best-effort que getOrderDetail/getOrderEvidence', async () => {
    const events: DeniedAccessEvent[] = [];
    const { app } = makeTestAppWithUpload(
      { deniedLogger: { record: (e) => events.push(e) } },
      { evidenceStorageDir: storageDir },
    );
    const T2 = SEED_USERS.technician2;
    const o = await makeOrder(prisma, { status: 'in_progress', assignedTo: T.id });
    const tok2 = await token(T2.email);
    const res = await uploadEvidence(app, o.id, tok2, validJpeg());
    expect(res.status).toBe(404);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      endpoint: 'uploadOrderEvidence',
      outcome: '404_not_visible',
      actor: T2.id,
      recurso: o.id,
    });
  });

  it('orderId malformado → 404 con recurso saneado <malformed> (nunca el valor crudo)', async () => {
    const events: DeniedAccessEvent[] = [];
    const { app } = makeTestAppWithUpload(
      { deniedLogger: { record: (e) => events.push(e) } },
      { evidenceStorageDir: storageDir },
    );
    const res = await uploadEvidence(app, 'no-es-uuid', techTok, validJpeg());
    expect(res.status).toBe(404);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ outcome: '404_not_visible', recurso: '<malformed>' });
  });

  it('un fallo del logger NO bloquea la respuesta 404 (best-effort)', async () => {
    const { app } = makeTestAppWithUpload(
      {
        deniedLogger: {
          record: () => {
            throw new Error('logger KO');
          },
        },
      },
      { evidenceStorageDir: storageDir },
    );
    const T2 = SEED_USERS.technician2;
    const o = await makeOrder(prisma, { status: 'in_progress', assignedTo: T.id });
    const tok2 = await token(T2.email);
    const res = await uploadEvidence(app, o.id, tok2, validJpeg());
    expect(res.status).toBe(404);
  });
});
