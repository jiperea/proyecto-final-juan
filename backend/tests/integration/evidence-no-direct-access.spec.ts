import { mkdtempSync } from 'node:fs';
import { readdir, readFile, rm } from 'node:fs/promises';
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
import { detectMagicContentType } from '../../src/domain/order/evidence';
import { validJpeg } from '../helpers/image-fixtures';

// T036 (024, US3, FR-006) — el binario NO es accesible sin pasar por el endpoint autenticado ni por una
// firma interna válida: (a) el fichero crudo en el store, leído/parseado DIRECTAMENTE (bypass total del
// `StoragePort`), no revela un binario válido (ni sus magic-bytes coinciden con el tipo declarado, ni su
// contenido es el original); (b) un handle de lectura FORJADO a mano (sin pasar por `signRead`, o firmado
// con una clave distinta) es rechazado por `read()`; (c) solo el flujo autenticado (`getOrderEvidence`)
// sirve el binario real. Complementa T033 (cifrado) mirando el vector de acceso DIRECTO al store, no la
// propiedad criptográfica en sí.
const storageDir = mkdtempSync(join(tmpdir(), 'fieldops-evidence-no-direct-'));
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

describe('evidencia — sin acceso directo al store (024, US3, FR-006)', () => {
  it('el fichero crudo en disco no es un binario válido leído/parseado directamente (bypass del StoragePort)', async () => {
    const o = await makeOrder(prisma, { status: 'in_progress', assignedTo: T.id });
    const original = validJpeg(1024);
    const commit = await commitRealEvidence({
      app,
      prisma,
      baseDir: storageDir,
      encKey: ENC_KEY,
      ownerId: T.id,
      orderId: o.id,
      token: techTok,
      bytes: original,
      contentType: 'image/jpeg',
    });

    const files = await readdir(storageDir);
    const binFiles = files.filter((f) => f.endsWith('.bin'));
    expect(binFiles.length).toBeGreaterThan(0);
    for (const f of binFiles) {
      const raw = await readFile(join(storageDir, f));
      // Un lector directo (sin pasar por el StoragePort) NO puede reconocer el contenido como una imagen:
      // ni sus magic-bytes coinciden con el tipo real subido, ni contiene el binario en claro.
      expect(detectMagicContentType(raw)).not.toBe('image/jpeg');
      expect(raw.includes(original)).toBe(false);
    }

    // Control positivo: SOLO a través del flujo autenticado se obtiene el binario real.
    const res = await getEvidence(app, o.id, commit.evidenceId, techTok);
    expect(res.status).toBe(200);
    expect((res.body as Buffer).equals(original)).toBe(true);
  });

  it('un handle de lectura forjado con una clave distinta a la de la app es rechazado (no revela el binario)', async () => {
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
    // Adaptador forjado, MISMO baseDir pero clave distinta (simula a un atacante que no conoce el secreto
    // de configuración real de la app): su `signRead` produce un handle que la app real (con SU clave)
    // rechazaría si se le presentara — y, al revés, este adaptador tampoco puede leer objetos escritos
    // con la clave real.
    const attacker = new FsStorageAdapter({ baseDir: storageDir, encKey: 'x'.repeat(40), clock: clockNow });
    const forgedHandle = await attacker.signRead(commit.objectRef, 300);
    const realStore = new FsStorageAdapter({ baseDir: storageDir, encKey: ENC_KEY, clock: clockNow });
    const result = await realStore.read(forgedHandle);
    expect(result).toEqual({ expired: true }); // firma HMAC no verifica con la clave real → rechazado
  });

  it('sin sesión, el endpoint autenticado tampoco sirve el binario (401) — no hay ruta alternativa de acceso', async () => {
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
    expect(res.body?.code).not.toBe(undefined);
  });
});
