import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/handlers/app';
import { buildContainer } from '../../src/infra/container';
import { testConfig } from '../helpers/test-app';
import { SEED_PASSWORD, SEED_USERS } from '../../prisma/seed-data';
import { makeOrder } from '../helpers/transition';

// T011 (005) — contrato de startOrderWork × cada código de respuesta (200/401/403/404/422/500) contra el
// schema del contrato (Order en 200; ErrorResponse {code,message} en el resto).
const { deps, prisma } = buildContainer(testConfig());
const app = buildApp(deps);

// App con el puerto de start que LANZA → 500 genérico (catch-all del handler; sin filtrar detalle de BD).
const app500 = buildApp({
  ...deps,
  startDeps: {
    start: {
      startWork: async (): Promise<never> => {
        throw new Error('boom');
      },
    },
  },
});

afterAll(async () => {
  await prisma.$disconnect();
});

const ORDER_KEYS = [
  'id',
  'title',
  'description',
  'status',
  'assigned_to',
  'version',
  'created_at',
  'updated_at',
].sort();

let techTok = '';
let dispTok = '';
async function token(email: string): Promise<string> {
  const r = await request(app).post('/v1/auth/login').send({ identifier: email, password: SEED_PASSWORD });
  return r.body.access_token as string;
}
beforeAll(async () => {
  techTok = await token(SEED_USERS.technician.email);
  dispTok = await token(SEED_USERS.dispatcher.email);
});

describe('startOrderWork — contrato (forma por código, OpenAPI)', () => {
  it('200 → forma exacta de Order (sin claves extra)', async () => {
    const o = await makeOrder(prisma, { status: 'assigned', assignedTo: SEED_USERS.technician.id });
    const res = await request(app)
      .post(`/v1/orders/${o.id}/start`)
      .set('Authorization', `Bearer ${techTok}`);
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(ORDER_KEYS);
    expect(res.body.status).toBe('in_progress');
  });

  it('401 sin token → {code,message}', async () => {
    const res = await request(app).post('/v1/orders/018f2000-0000-7000-8000-0000000000ee/start');
    expect(res.status).toBe(401);
    expect(typeof res.body.code).toBe('string');
    expect(typeof res.body.message).toBe('string');
  });

  it('403 rol no technician → {code,message}', async () => {
    const res = await request(app)
      .post('/v1/orders/018f2000-0000-7000-8000-0000000000ee/start')
      .set('Authorization', `Bearer ${dispTok}`);
    expect(res.status).toBe(403);
    expect(typeof res.body.code).toBe('string');
  });

  it('404 → cuerpo genérico {code,message} sin details', async () => {
    const res = await request(app)
      .post('/v1/orders/018f2000-0000-7000-8000-0000000000ee/start')
      .set('Authorization', `Bearer ${techTok}`);
    expect(res.status).toBe(404);
    expect(typeof res.body.code).toBe('string');
    expect(res.body.details).toBeUndefined();
  });

  it('422 orden propia en estado no legal → {code,message}', async () => {
    const o = await makeOrder(prisma, { status: 'closed', assignedTo: SEED_USERS.technician.id });
    const res = await request(app)
      .post(`/v1/orders/${o.id}/start`)
      .set('Authorization', `Bearer ${techTok}`);
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('INVALID_TRANSITION');
  });

  it('500 (error de BD) → cuerpo genérico sin detalle de Postgres', async () => {
    const o = await makeOrder(prisma, { status: 'assigned', assignedTo: SEED_USERS.technician.id });
    const res = await request(app500)
      .post(`/v1/orders/${o.id}/start`)
      .set('Authorization', `Bearer ${techTok}`);
    expect(res.status).toBe(500);
    expect(typeof res.body.code).toBe('string');
    expect(JSON.stringify(res.body)).not.toMatch(/boom|SQLSTATE|postgres|constraint/i);
  });
});
