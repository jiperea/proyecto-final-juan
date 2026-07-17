import { mkdtempSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import request from 'supertest';
import { createLogger } from '../../src/infra/logger';
import { SEED_PASSWORD, SEED_USERS } from '../../prisma/seed-data';
import { makeTestApp, makeTestAppWithEvidence, testConfig } from '../helpers/test-app';
import { makeOrder } from '../helpers/transition';
import { uploadEvidence, commitRealEvidence, getEvidence } from '../helpers/evidence';
import { validJpeg } from '../helpers/image-fixtures';

// T035 (024, US3, SC-005/FR-008) — 0 apariciones de `object_ref`, de la firma/handle interno de lectura ni
// del binario en logs. Dos frentes:
// (1) Extremo a extremo (patrón ya usado en execution-pii-redaction.spec.ts, T024/005): se sustituye el
//     `deniedLogger` de `getEvidenceDeps` (único punto de logging propio de estos dos endpoints hoy, ver
//     get-evidence.ts/upload-evidence.ts) por un CAPTOR y se ejercitan upload+getOrderEvidence reales (200 y
//     404) con un `object_ref`/binario CENTINELA; se afirma que ninguno aparece en lo capturado.
// (2) Redacción del logger compartido (createLogger, mismo patrón que T024/005 y correlation-id.spec.ts):
//     el campo por el que viajará la firma/handle interno de lectura ES NUEVO en esta feature (024, D6) —
//     hoy `REDACT_PATHS` (backend/src/infra/logger.ts) NO lo contempla (solo redacta `object_ref`, no la
//     firma de lectura). Si cualquier adaptador llegara a loguear esa firma bajo el nombre `signed_handle`
//     (el más natural dado `SignedReadHandle`, domain/ports/storage.ts), HOY saldría en claro.
//     RED esperado: esta aserción falla hasta que T040 añada `signed_handle`/`*.signed_handle` a
//     `REDACT_PATHS` (backend/src/infra/logger.ts) — la implementación que lo pone en verde.
const storageDir = mkdtempSync(join(tmpdir(), 'fieldops-evidence-nolog-'));
afterAll(async () => {
  await rm(storageDir, { recursive: true, force: true });
});

const ENC_KEY = testConfig().evidenceEncKey;
const { app: baseApp, prisma } = makeTestApp({ evidenceStorageDir: storageDir });
afterAll(async () => {
  await prisma.$disconnect();
});

const T = SEED_USERS.technician;
const T2 = SEED_USERS.technician2;
let techTok = '';
let tech2Tok = '';
beforeAll(async () => {
  const r1 = await request(baseApp).post('/v1/auth/login').send({ identifier: T.email, password: SEED_PASSWORD });
  techTok = r1.body.access_token;
  const r2 = await request(baseApp).post('/v1/auth/login').send({ identifier: T2.email, password: SEED_PASSWORD });
  tech2Tok = r2.body.access_token;
});

describe('evidencia — no-fuga en logs (024, US3, SC-005/FR-008)', () => {
  it('upload (201) + getOrderEvidence (200 y 404) reales: 0 apariciones de object_ref/binario en lo capturado por el deniedLogger', async () => {
    const captured: unknown[] = [];
    const { app } = makeTestAppWithEvidence(
      { deniedLogger: { record: (e) => captured.push(e) } },
      { evidenceStorageDir: storageDir },
    );
    const o = await makeOrder(prisma, { status: 'in_progress', assignedTo: T.id });
    const original = validJpeg(2048);

    const up = await uploadEvidence(app, o.id, techTok, original, { contentType: 'image/jpeg' });
    expect(up.status).toBe(201);
    const ref = up.body.object_ref as string;

    const exec = await request(app)
      .post(`/v1/orders/${o.id}/execution`)
      .set('Authorization', `Bearer ${techTok}`)
      .send({ notes: 'evidencia real (T035)', evidence: [{ object_ref: ref, content_type: 'image/jpeg', size_bytes: original.length }] });
    expect(exec.status).toBe(200);
    const row = await prisma.orderEvidence.findFirstOrThrow({ where: { orderId: o.id, objectRef: ref } });

    const ok = await getEvidence(app, o.id, row.id, techTok);
    expect(ok.status).toBe(200);

    // Provoca el 404 uniforme (no-dueño) — el único punto que hoy escribe en un logger real.
    const denied = await getEvidence(app, o.id, row.id, tech2Tok);
    expect(denied.status).toBe(404);
    expect(captured.length).toBeGreaterThan(0); // control: SÍ se emitió la señal best-effort (FR-007)

    const dump = JSON.stringify(captured);
    expect(dump).not.toContain(ref); // object_ref centinela
    expect(dump.toLowerCase()).not.toContain(original.toString('latin1').slice(0, 64).toLowerCase());
  });

  it('el logger compartido redacta la firma/handle interno de lectura (campo `signed_handle`) — pendiente de T040', () => {
    const lines: string[] = [];
    const logger = createLogger({ stream: { write: (s: string) => lines.push(s) } });
    const SENTINEL_HANDLE = 'SENTINEL_INTERNAL_SIGNED_HANDLE_zzz';
    logger.info({ signed_handle: SENTINEL_HANDLE }, 'lectura de evidencia (nunca debería loguear la firma)');
    logger.info({ req: { evidence: { signed_handle: SENTINEL_HANDLE } } }, 'anidado');
    const out = lines.join('');
    // RED hoy: `signed_handle` no está en REDACT_PATHS (backend/src/infra/logger.ts) → el centinela SALE en
    // claro. Lo pone en verde T040 (024, US3, FR-008): añadir 'signed_handle'/'*.signed_handle' a la lista.
    expect(out).not.toContain(SENTINEL_HANDLE);
  });

  it('reutiliza commitRealEvidence (blob real cifrado) para descartar que el binario aparezca en el 404 capturado', async () => {
    const captured: unknown[] = [];
    const { app } = makeTestAppWithEvidence(
      { deniedLogger: { record: (e) => captured.push(e) } },
      { evidenceStorageDir: storageDir },
    );
    const o = await makeOrder(prisma, { status: 'in_progress', assignedTo: T.id });
    const original = validJpeg(2048);
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
    const denied = await getEvidence(app, o.id, commit.evidenceId, tech2Tok);
    expect(denied.status).toBe(404);
    const dump = JSON.stringify(captured);
    expect(dump).not.toContain(commit.objectRef);
  });
});
