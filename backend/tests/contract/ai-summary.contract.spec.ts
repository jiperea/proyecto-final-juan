// T010 (007, US1) — contrato de summarizeOrderIncident: forma de la respuesta por código.
// 200 IncidentSummaryResponse; resto ErrorResponse. (429/503 en tests de integración dedicados T019/T021.)
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { SEED_PASSWORD, SEED_USERS } from '../../prisma/seed-data';
import { makeTestApp } from '../helpers/test-app';
import { makePendingReviewOrder } from '../helpers/transition';

const { app, prisma } = makeTestApp();
afterAll(async () => {
  await prisma.$disconnect();
});

async function token(email: string): Promise<string> {
  const r = await request(app).post('/v1/auth/login').send({ identifier: email, password: SEED_PASSWORD });
  return r.body.access_token as string;
}
let supTok = '';
let techTok = '';
beforeAll(async () => {
  supTok = await token(SEED_USERS.supervisor.email);
  techTok = await token(SEED_USERS.technician.email);
});

const NONEXISTENT = '00000000-0000-7000-8000-000000000000';

describe('summarizeOrderIncident — contrato (operationId=summarizeOrderIncident)', () => {
  it('200: IncidentSummaryResponse { summary, sufficient }', async () => {
    const o = await makePendingReviewOrder(prisma, {
      assignedTo: SEED_USERS.technician.id,
      withEvidence: true,
      notes: 'Incidencia registrada con detalle suficiente para resumir con fidelidad y sin relleno.',
    });
    const res = await request(app).post(`/v1/orders/${o.id}/ai-summary`).set('Authorization', `Bearer ${supTok}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('sufficient');
    expect(res.body).toHaveProperty('summary');
  });

  it('401: sin token → ErrorResponse UNAUTHENTICATED', async () => {
    const res = await request(app).post(`/v1/orders/${NONEXISTENT}/ai-summary`);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHENTICATED');
  });

  it('403: rol no supervisor → ErrorResponse FORBIDDEN_ROLE', async () => {
    const res = await request(app).post(`/v1/orders/${NONEXISTENT}/ai-summary`).set('Authorization', `Bearer ${techTok}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN_ROLE');
  });

  it('404: orden inexistente/uuid malformado → ErrorResponse genérico ORDER_NOT_FOUND', async () => {
    const res = await request(app).post(`/v1/orders/${NONEXISTENT}/ai-summary`).set('Authorization', `Bearer ${supTok}`);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('ORDER_NOT_FOUND');
    const malformed = await request(app).post('/v1/orders/not-a-uuid/ai-summary').set('Authorization', `Bearer ${supTok}`);
    expect(malformed.status).toBe(404);
  });
});
