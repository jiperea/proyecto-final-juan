import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import request from 'supertest';
import { SEED_PASSWORD, SEED_USERS } from '../../prisma/seed-data';
import { makeTestApp } from '../helpers/test-app';
import { makeOrder } from '../helpers/transition';
import { uploadEvidence } from '../helpers/evidence';
import { validJpeg } from '../helpers/image-fixtures';

// T016 (024, US1, FR-022/FR-023) — ciclo subida↔envío: varias uploadOrderEvidence acumulan blobs staged
// vivos; el 11º se rechaza (422 STAGING_LIMIT_EXCEEDED, tope ≤10). submitOrderExecution con evidence[] > 10
// (contando el array CRUDO, sin deduplicar) también → 422. Un object_ref repetido DENTRO del mismo
// evidence[] → 422 (no se deduplica en silencio); el tope se cuenta sobre el array crudo (con el repetido
// incluido dos veces).
// RED: uploadOrderEvidence no existe (404 en cada llamada) → el setup de estos tests (subir blobs reales)
// falla de entrada; no puede pasar hasta que el endpoint exista y submit re-verifique el object_ref (FR-023).
const { app, prisma } = makeTestApp();
afterAll(async () => {
  await prisma.$disconnect();
});

const T = SEED_USERS.technician;

async function token(email: string): Promise<string> {
  const r = await request(app).post('/v1/auth/login').send({ identifier: email, password: SEED_PASSWORD });
  return r.body.access_token as string;
}
let techTok = '';
beforeAll(async () => {
  techTok = await token(T.email);
});

async function stageOne(orderId: string) {
  const res = await uploadEvidence(app, orderId, techTok, validJpeg());
  expect(res.status).toBe(201); // control de setup: si falla aquí, el resto del test es irrelevante (Red)
  return res.body.object_ref as string;
}

describe('evidencia — ciclo subida↔envío (024, US1, FR-022/FR-023)', () => {
  it('acumula 10 blobs staged vivos; el 11º upload → 422 STAGING_LIMIT_EXCEEDED', async () => {
    const o = await makeOrder(prisma, { status: 'in_progress', assignedTo: T.id });
    for (let i = 0; i < 10; i++) {
      await stageOne(o.id);
    }
    const eleventh = await uploadEvidence(app, o.id, techTok, validJpeg());
    expect(eleventh.status).toBe(422);
    expect(eleventh.body.code).toBe('STAGING_LIMIT_EXCEEDED');
  }, 20_000);

  it('submitOrderExecution con evidence[] de 11 refs staged → 422 (tope ≤10, incluso con refs reales)', async () => {
    const o = await makeOrder(prisma, { status: 'in_progress', assignedTo: T.id });
    const refs = [];
    for (let i = 0; i < 11; i++) {
      refs.push(await stageOne(o.id));
    }
    const res = await request(app)
      .post(`/v1/orders/${o.id}/execution`)
      .set('Authorization', `Bearer ${techTok}`)
      .send({
        notes: 'demasiadas evidencias',
        evidence: refs.map((ref) => ({ object_ref: ref, content_type: 'image/jpeg', size_bytes: 256 })),
      });
    expect(res.status).toBe(422);
  }, 30_000);

  it('object_ref repetido DENTRO del mismo evidence[] → 422; el tope cuenta el array crudo (repetido incluido)', async () => {
    const o = await makeOrder(prisma, { status: 'in_progress', assignedTo: T.id });
    const ref = await stageOne(o.id);
    const res = await request(app)
      .post(`/v1/orders/${o.id}/execution`)
      .set('Authorization', `Bearer ${techTok}`)
      .send({
        notes: 'ref repetido, no se deduplica',
        evidence: [
          { object_ref: ref, content_type: 'image/jpeg', size_bytes: 256 },
          { object_ref: ref, content_type: 'image/jpeg', size_bytes: 256 },
        ],
      });
    expect(res.status).toBe(422);
    // sin efecto: ninguna fila OrderEvidence debe haberse creado a partir de este intento inválido.
    expect(await prisma.orderEvidence.count({ where: { orderId: o.id } })).toBe(0);
  });
});
