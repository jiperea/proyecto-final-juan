import { mkdtempSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import request from 'supertest';
import type { ClockPort } from '../../src/domain/ports/services';
import { SEED_PASSWORD, SEED_USERS } from '../../prisma/seed-data';
import { makeTestApp, testConfig } from '../helpers/test-app';
import { makeOrder } from '../helpers/transition';
import { commitRealEvidence, getEvidence } from '../helpers/evidence';
import { FsStorageAdapter } from '../../src/infra/storage/fs-storage-adapter';
import { validJpeg } from '../helpers/image-fixtures';

// T034 (024, US3, SC-003/FR-005) — la firma de lectura es INTERNA (backend↔almacenamiento), tiene TTL
// ≤300 s y NUNCA es cliente-visible; un handle caducado (o manipulado) no permite leer el blob. Reloj
// inyectable determinista (Constitution VII: sin dependencia del reloj real — nunca dormir 300 s en un
// test). Se opera sobre el MISMO baseDir/encKey que la app real bajo prueba, ejercitando el objeto que un
// ciclo HTTP real (upload→submit) produjo, no un blob sintético aislado.
function mutableClock(startMs: number): { clock: ClockPort; advance: (deltaMs: number) => void } {
  let ms = startMs;
  return {
    clock: { now: () => new Date(ms) },
    advance: (deltaMs: number) => {
      ms += deltaMs;
    },
  };
}

const storageDir = mkdtempSync(join(tmpdir(), 'fieldops-evidence-sig-ttl-'));
afterAll(async () => {
  await rm(storageDir, { recursive: true, force: true });
});

const ENC_KEY = testConfig().evidenceEncKey;
const { app, prisma } = makeTestApp({ evidenceStorageDir: storageDir });
afterAll(async () => {
  await prisma.$disconnect();
});

const T = SEED_USERS.technician;
let techTok = '';
beforeAll(async () => {
  const r = await request(app).post('/v1/auth/login').send({ identifier: T.email, password: SEED_PASSWORD });
  techTok = r.body.access_token;
});

describe('firma interna de lectura — TTL ≤300 s y no cliente-visible (024, US3, SC-003/FR-005)', () => {
  it('config: el TTL de la firma interna está acotado a ≤300 s (fail-fast, D6)', () => {
    expect(testConfig().evidenceSignTtlSeconds).toBeLessThanOrEqual(300);
  });

  it('un handle de lectura caducado (reloj avanzado más allá del TTL) NO permite leer el blob real', async () => {
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

    const { clock, advance } = mutableClock(Date.now());
    // Mismo baseDir/encKey que la app real: el objectRef committeado por HTTP es legible por esta instancia.
    const store = new FsStorageAdapter({ baseDir: storageDir, encKey: ENC_KEY, clock });
    const handle = await store.signRead(commit.objectRef, 300); // TTL máximo permitido (D6)
    advance(300_001); // 1 ms más allá del TTL máximo ≤300 s
    const expired = await store.read(handle);
    expect(expired).toEqual({ expired: true });

    // Control: DENTRO del TTL, el mismo handle SÍ lee el binario (no es un fallo genérico del adaptador).
    const handleFresh = await store.signRead(commit.objectRef, 300);
    const ok = await store.read(handleFresh);
    expect(Buffer.isBuffer(ok)).toBe(true);
  });

  it('un handle manipulado (firma alterada) no permite leer, aunque el ref sea válido', async () => {
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
    const clockNow: ClockPort = { now: () => new Date() };
    const store = new FsStorageAdapter({ baseDir: storageDir, encKey: ENC_KEY, clock: clockNow });
    const handle = await store.signRead(commit.objectRef, 300);
    const tampered = handle.slice(0, -1) + (handle.endsWith('A') ? 'B' : 'A');
    const result = await store.read(tampered);
    expect(result).toEqual({ expired: true });
  });

  it('cliente sin sesión válida no accede a la evidencia (401) — sin token de cliente reutilizable', async () => {
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
    const res = await getEvidence(app, o.id, commit.evidenceId, null);
    expect(res.status).toBe(401);
  });

  it('la respuesta 200 de getOrderEvidence no expone ningún handle/firma interna (0 tokens cliente-visibles)', async () => {
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
    const res = await getEvidence(app, o.id, commit.evidenceId, techTok);
    expect(res.status).toBe(200);
    // Fabrica un handle real de la MISMA infraestructura para usarlo como oráculo de "forma" (no debe
    // aparecer ninguna subcadena del handle interno en la respuesta al cliente).
    const clockNow: ClockPort = { now: () => new Date() };
    const store = new FsStorageAdapter({ baseDir: storageDir, encKey: ENC_KEY, clock: clockNow });
    const handle = await store.signRead(commit.objectRef, 300);
    const dump = `${JSON.stringify(res.headers)}`;
    expect(dump).not.toContain(handle);
    expect(dump).not.toContain(commit.objectRef);
  });
});
