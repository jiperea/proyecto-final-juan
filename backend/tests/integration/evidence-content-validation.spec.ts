import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import request from 'supertest';
import { SEED_PASSWORD, SEED_USERS } from '../../prisma/seed-data';
import { makeTestApp } from '../helpers/test-app';
import { makeOrder } from '../helpers/transition';
import { uploadEvidence } from '../helpers/evidence';
import { corruptBytes, validHeic, validJpeg, validPng, validWebp } from '../helpers/image-fixtures';

// T015 (024, US1, FR-019) — validación de CONTENIDO REAL (magic-bytes), no solo el content_type declarado.
// Mapeo determinista: declarado FUERA de allowlist → 415 (sin mirar bytes); declarado EN allowlist pero
// contenido real que NO es esa imagen (tipo falseado / corrupto) → 422; contenido real válido para el tipo
// declarado (incl. HEIC por marca `ftyp`) → 201.
// RED: uploadOrderEvidence no existe (404 genérico) → ninguna aserción puede pasar hoy.
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

async function order() {
  return makeOrder(prisma, { status: 'in_progress', assignedTo: T.id });
}

describe('uploadOrderEvidence — validación de contenido real (024, US1, FR-019)', () => {
  it('declarado fuera de allowlist (image/gif) con bytes JPEG válidos → 415 (ni mira el contenido)', async () => {
    const o = await order();
    const res = await uploadEvidence(app, o.id, techTok, validJpeg(), { contentType: 'image/gif' });
    expect(res.status).toBe(415);
    expect(res.body.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('declarado image/jpeg pero el contenido real es un PNG (tipo falseado) → 422 INVALID_EVIDENCE', async () => {
    const o = await order();
    const res = await uploadEvidence(app, o.id, techTok, validPng(), {
      contentType: 'image/jpeg',
      filename: 'foto.jpg',
    });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('INVALID_EVIDENCE');
  });

  it('declarado image/png pero bytes corruptos/ilegibles → 422 INVALID_EVIDENCE', async () => {
    const o = await order();
    const res = await uploadEvidence(app, o.id, techTok, corruptBytes(), { contentType: 'image/png' });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('INVALID_EVIDENCE');
  });

  it('JPEG real declarado image/jpeg → 201', async () => {
    const o = await order();
    const res = await uploadEvidence(app, o.id, techTok, validJpeg(), { contentType: 'image/jpeg' });
    expect(res.status).toBe(201);
  });

  it('PNG real declarado image/png → 201', async () => {
    const o = await order();
    const res = await uploadEvidence(app, o.id, techTok, validPng(), { contentType: 'image/png' });
    expect(res.status).toBe(201);
  });

  it('WEBP real declarado image/webp → 201', async () => {
    const o = await order();
    const res = await uploadEvidence(app, o.id, techTok, validWebp(), { contentType: 'image/webp' });
    expect(res.status).toBe(201);
  });

  it('HEIC real (marca ftyp ISO-BMFF) declarado image/heic → 201', async () => {
    const o = await order();
    const res = await uploadEvidence(app, o.id, techTok, validHeic(), {
      contentType: 'image/heic',
      filename: 'foto.heic',
    });
    expect(res.status).toBe(201);
  });
});
