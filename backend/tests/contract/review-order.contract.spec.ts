import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/handlers/app';
import { buildContainer } from '../../src/infra/container';
import { testConfig } from '../helpers/test-app';
import { SEED_PASSWORD, SEED_USERS } from '../../prisma/seed-data';
import { makeOrder, makePendingReviewOrder } from '../helpers/transition';
import { domainError, err, ok } from '../../src/domain/result';
import type { OrderRecord } from '../../src/domain/order/model';

// T009 (006) — contrato de reviewOrder × cada código (200/401/403/404/409/422/500/503) contra el schema
// (Order en 200; ErrorResponse {code,message} en el resto).
const { deps, prisma } = buildContainer(testConfig());
const app = buildApp(deps);

const RECORD: OrderRecord = {
  id: '00000000-0000-7000-8000-000000000abc',
  title: 't',
  description: 'd',
  status: 'closed',
  assignedTo: null,
  version: 1,
  createdAt: new Date(0),
  updatedAt: new Date(0),
};
// App cuyo puerto LANZA → 500 genérico (catch-all).
const app500 = buildApp({
  ...deps,
  reviewDeps: {
    review: async (): Promise<never> => {
      throw new Error('boom');
    },
  } as never,
});
// App cuyo puerto devuelve SERVICE_UNAVAILABLE → 503 (fail-closed BD).
const app503 = buildApp({
  ...deps,
  reviewDeps: { review: { review: async () => err(domainError('SERVICE_UNAVAILABLE', 'no disp.')) } },
});
// App cuyo puerto devuelve un Order OK → 200 (para el 200 sin depender de datos).
const app200 = buildApp({
  ...deps,
  reviewDeps: { review: { review: async () => ok(RECORD) } },
});

afterAll(async () => {
  await prisma.$disconnect();
});

const ORDER_KEYS = ['id', 'title', 'description', 'status', 'assigned_to', 'version', 'created_at', 'updated_at'].sort();
const OID = '00000000-0000-7000-8000-000000000abc';

let supTok = '';
let techTok = '';
async function token(email: string): Promise<string> {
  const r = await request(app).post('/v1/auth/login').send({ identifier: email, password: SEED_PASSWORD });
  return r.body.access_token as string;
}
beforeAll(async () => {
  supTok = await token(SEED_USERS.supervisor.email);
  techTok = await token(SEED_USERS.technician.email);
});

function errShape(body: unknown): void {
  expect(body).toHaveProperty('code');
  expect(body).toHaveProperty('message');
  expect(typeof (body as { code: unknown }).code).toBe('string');
}

describe('reviewOrder — contrato (forma por código, OpenAPI)', () => {
  it('200 → forma exacta de Order', async () => {
    const res = await request(app200)
      .post(`/v1/orders/${OID}/review`)
      .set('Authorization', `Bearer ${supTok}`)
      .send({ decision: 'approve' });
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(ORDER_KEYS);
  });

  it('401 → ErrorResponse', async () => {
    const res = await request(app).post(`/v1/orders/${OID}/review`).send({ decision: 'approve' });
    expect(res.status).toBe(401);
    errShape(res.body);
  });

  it('403 → ErrorResponse (rol ≠ supervisor)', async () => {
    const res = await request(app)
      .post(`/v1/orders/${OID}/review`)
      .set('Authorization', `Bearer ${techTok}`)
      .send({ decision: 'approve' });
    expect(res.status).toBe(403);
    errShape(res.body);
  });

  it('404 → ErrorResponse (no visible)', async () => {
    const o = await makeOrder(prisma, { status: 'assigned', assignedTo: SEED_USERS.technician.id });
    const res = await request(app)
      .post(`/v1/orders/${o.id}/review`)
      .set('Authorization', `Bearer ${supTok}`)
      .send({ decision: 'reject', reason: 'x' });
    expect(res.status).toBe(404);
    errShape(res.body);
  });

  it('409 → ErrorResponse (EVIDENCE_MISSING)', async () => {
    const o = await makePendingReviewOrder(prisma, {
      assignedTo: SEED_USERS.technician.id,
      withEvidence: false,
    });
    const res = await request(app)
      .post(`/v1/orders/${o.id}/review`)
      .set('Authorization', `Bearer ${supTok}`)
      .send({ decision: 'approve' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('EVIDENCE_MISSING');
  });

  it('422 → ErrorResponse (decision inválida)', async () => {
    const res = await request(app)
      .post(`/v1/orders/${OID}/review`)
      .set('Authorization', `Bearer ${supTok}`)
      .send({ decision: 'nope' });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('500 → ErrorResponse genérico (sin filtrar detalle)', async () => {
    const res = await request(app500)
      .post(`/v1/orders/${OID}/review`)
      .set('Authorization', `Bearer ${supTok}`)
      .send({ decision: 'approve' });
    expect(res.status).toBe(500);
    errShape(res.body);
    expect(JSON.stringify(res.body)).not.toContain('boom');
  });

  it('503 → ErrorResponse (BD no disponible)', async () => {
    const res = await request(app503)
      .post(`/v1/orders/${OID}/review`)
      .set('Authorization', `Bearer ${supTok}`)
      .send({ decision: 'approve' });
    expect(res.status).toBe(503);
    errShape(res.body);
  });
});
