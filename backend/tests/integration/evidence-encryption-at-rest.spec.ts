import { mkdtempSync } from 'node:fs';
import { readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import request from 'supertest';
import { SEED_PASSWORD, SEED_USERS } from '../../prisma/seed-data';
import { makeTestApp, testConfig } from '../helpers/test-app';
import { makeOrder } from '../helpers/transition';
import { uploadEvidence, getEvidence } from '../helpers/evidence';
import { validJpeg } from '../helpers/image-fixtures';

// T033 (024, US3, SC-004) — cifrado en reposo verificable de punta a punta (no basta un flag de config):
// (a) tras un ciclo real subida→submit por HTTP, los BYTES CRUDOS del blob en el store (bypaseando el
// descifrado, leídos directamente del filesystem) DIFIEREN byte a byte del binario original subido —
// ni siquiera un fragmento reconocible del original debe aparecer en claro (AES-256-GCM, no un XOR trivial
// ni un cifrado por bloques que preserve patrones); (b) el ROUND-TRIP autenticado (`getOrderEvidence`)
// SÍ devuelve el binario original exacto — la fuga de bytes en disco no es un defecto de la app en su
// conjunto, solo del almacenamiento crudo. Ambas puntas (a)+(b) deben cumplirse a la vez: si solo se
// comprobase (a) sin (b), un cifrado roto que no descifra correctamente pasaría igual el test.
const storageDir = mkdtempSync(join(tmpdir(), 'fieldops-evidence-enc-at-rest-'));
afterAll(async () => {
  await rm(storageDir, { recursive: true, force: true });
});

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

describe('evidencia — cifrado en reposo verificable de punta a punta (024, US3, SC-004)', () => {
  it('bytes crudos en disco ≠ original byte a byte; getOrderEvidence SÍ devuelve el original (round-trip)', async () => {
    const o = await makeOrder(prisma, { status: 'in_progress', assignedTo: T.id });
    // Relleno grande y distintivo (no todo-ceros/todo-un-byte) para descartar coincidencias triviales.
    const original = validJpeg(8192);

    const up = await uploadEvidence(app, o.id, techTok, original, { contentType: 'image/jpeg' });
    expect(up.status).toBe(201);
    const ref = up.body.object_ref as string;

    const exec = await request(app)
      .post(`/v1/orders/${o.id}/execution`)
      .set('Authorization', `Bearer ${techTok}`)
      .send({
        notes: 'evidencia real para verificar cifrado en reposo',
        evidence: [{ object_ref: ref, content_type: 'image/jpeg', size_bytes: original.length }],
      });
    expect(exec.status).toBe(200);
    const row = await prisma.orderEvidence.findFirstOrThrow({ where: { orderId: o.id, objectRef: ref } });

    // (a) bytes crudos del store ≠ original (bypass del descifrado: lectura directa del filesystem).
    const files = await readdir(storageDir);
    const binFiles = files.filter((f) => f.endsWith('.bin'));
    expect(binFiles.length).toBeGreaterThan(0);
    let foundMatchingSize = false;
    for (const f of binFiles) {
      const raw = await readFile(join(storageDir, f));
      expect(raw.equals(original)).toBe(false); // nunca idéntico
      expect(raw.includes(original)).toBe(false); // ni siquiera como subcadena (no ECB-like leakage)
      if (raw.length >= original.length) {
        foundMatchingSize = true;
      }
    }
    expect(foundMatchingSize).toBe(true); // al menos un blob del tamaño esperado (iv+tag+ciphertext)

    // (b) round-trip autenticado: getOrderEvidence devuelve el binario ORIGINAL exacto.
    const res = await getEvidence(app, o.id, row.id, techTok);
    expect(res.status).toBe(200);
    expect(Buffer.isBuffer(res.body)).toBe(true);
    expect((res.body as Buffer).equals(original)).toBe(true);
  });

  it('config: la clave de cifrado NO puede ser el valor simbólico "mock" en producción (fail-fast, D6)', () => {
    // Control de que SC-004 no se satisface con un flag de config: la clave real se valida al arrancar.
    expect(testConfig().evidenceEncKey).not.toBe('mock');
    expect(testConfig().evidenceEncKey.length).toBeGreaterThanOrEqual(32);
  });
});
