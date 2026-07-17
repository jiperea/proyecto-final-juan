import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import request from 'supertest';
import { SEED_PASSWORD, SEED_USERS } from '../../prisma/seed-data';
import { makeTestApp } from '../helpers/test-app';
import { makeOrder } from '../helpers/transition';
import { uploadEvidence } from '../helpers/evidence';
import { corruptBytes, emptyBuffer, oversizedJpeg, validJpeg } from '../helpers/image-fixtures';

// T012 (024, US1, FR-002/FR-019/FR-020) — contrato de uploadOrderEvidence (POST /v1/orders/:id/evidence,
// multipart). RED: el endpoint no existe aún → todo cae en el 404 genérico de Express (ruta no registrada,
// sin cuerpo {code,...}), así que TODAS las aserciones de código/forma fallan hoy por la razón correcta.
// Una vez implementado uploadOrderEvidence, estas aserciones deben pasar sin relajarse.
const { app, prisma } = makeTestApp();
afterAll(async () => {
  await prisma.$disconnect();
});

const T = SEED_USERS.technician;
const T2 = SEED_USERS.technician2;

async function token(email: string): Promise<string> {
  const r = await request(app).post('/v1/auth/login').send({ identifier: email, password: SEED_PASSWORD });
  return r.body.access_token as string;
}
let techTok = '';
let tech2Tok = '';
beforeAll(async () => {
  techTok = await token(T.email);
  tech2Tok = await token(T2.email);
});

describe('uploadOrderEvidence — contrato (024, US1)', () => {
  it('201: técnico dueño + orden in_progress + imagen válida → object_ref opaco', async () => {
    const o = await makeOrder(prisma, { status: 'in_progress', assignedTo: T.id });
    const res = await uploadEvidence(app, o.id, techTok, validJpeg(), { contentType: 'image/jpeg' });
    expect(res.status).toBe(201);
    expect(typeof res.body.object_ref).toBe('string');
    expect(res.body.object_ref.length).toBeGreaterThan(0);
    expect(res.body.object_ref.length).toBeLessThanOrEqual(512);
    // No debe filtrar ningún dato adicional fuera del contrato (additionalProperties:false).
    expect(Object.keys(res.body)).toEqual(['object_ref']);
  });

  it('401: sin sesión', async () => {
    const o = await makeOrder(prisma, { status: 'in_progress', assignedTo: T.id });
    const res = await uploadEvidence(app, o.id, null, validJpeg());
    expect(res.status).toBe(401);
    expect(typeof res.body.code).toBe('string');
  });

  it('404 uniforme: no-dueño (technician2) sobre orden de T', async () => {
    const o = await makeOrder(prisma, { status: 'in_progress', assignedTo: T.id });
    const res = await uploadEvidence(app, o.id, tech2Tok, validJpeg());
    expect(res.status).toBe(404);
    expect(res.body.code).not.toBe('FORBIDDEN_ROLE');
  });

  it('404 uniforme: orden propia pero NO in_progress (assigned)', async () => {
    const o = await makeOrder(prisma, { status: 'assigned', assignedTo: T.id });
    const res = await uploadEvidence(app, o.id, techTok, validJpeg());
    expect(res.status).toBe(404);
  });

  it('413 PAYLOAD_TOO_LARGE: > 25 MiB', async () => {
    const o = await makeOrder(prisma, { status: 'in_progress', assignedTo: T.id });
    const res = await uploadEvidence(app, o.id, techTok, oversizedJpeg());
    expect(res.status).toBe(413);
    expect(res.body.code).toBe('PAYLOAD_TOO_LARGE');
  }, 20_000);

  it('413 PAYLOAD_TOO_LARGE: 0 bytes', async () => {
    const o = await makeOrder(prisma, { status: 'in_progress', assignedTo: T.id });
    const res = await uploadEvidence(app, o.id, techTok, emptyBuffer);
    expect(res.status).toBe(413);
    expect(res.body.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('415 UNSUPPORTED_MEDIA_TYPE: content_type declarado fuera de allowlist', async () => {
    const o = await makeOrder(prisma, { status: 'in_progress', assignedTo: T.id });
    const res = await uploadEvidence(app, o.id, techTok, validJpeg(), { contentType: 'image/gif' });
    expect(res.status).toBe(415);
    expect(res.body.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('422 INVALID_EVIDENCE: content_type declarado en allowlist pero contenido falseado/corrupto', async () => {
    const o = await makeOrder(prisma, { status: 'in_progress', assignedTo: T.id });
    const res = await uploadEvidence(app, o.id, techTok, corruptBytes(), { contentType: 'image/jpeg' });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('INVALID_EVIDENCE');
  });

  it('422 STAGING_LIMIT_EXCEEDED: 11º upload del ciclo', async () => {
    const o = await makeOrder(prisma, { status: 'in_progress', assignedTo: T.id });
    for (let i = 0; i < 10; i++) {
      const r = await uploadEvidence(app, o.id, techTok, validJpeg());
      expect(r.status).toBe(201);
    }
    const res = await uploadEvidence(app, o.id, techTok, validJpeg());
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('STAGING_LIMIT_EXCEEDED');
  }, 20_000);

  it('cuerpo de error siempre {code,message}, sin object_ref filtrado en el error', async () => {
    const o = await makeOrder(prisma, { status: 'in_progress', assignedTo: T.id });
    const res = await uploadEvidence(app, o.id, techTok, corruptBytes(), { contentType: 'image/jpeg' });
    expect(typeof res.body.code).toBe('string');
    expect(typeof res.body.message).toBe('string');
    expect(res.body.object_ref).toBeUndefined();
    expect(res.type).toBe('application/json');
  });
});
