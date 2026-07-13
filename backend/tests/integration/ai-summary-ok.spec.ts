// T014 (007, US1) — integración "resumen fiel". Provider MOCK (config aiProvider=mock) → 200 sufficient=true.
// Postgres real + login real + makePendingReviewOrder.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { SEED_PASSWORD, SEED_USERS } from '../../prisma/seed-data';
import { makeTestApp } from '../helpers/test-app';
import { makePendingReviewOrder } from '../helpers/transition';

const { app, prisma } = makeTestApp();
afterAll(async () => {
  await prisma.$disconnect();
});

const SUP = SEED_USERS.supervisor;
const TECH = SEED_USERS.technician;

async function token(email: string): Promise<string> {
  const r = await request(app).post('/v1/auth/login').send({ identifier: email, password: SEED_PASSWORD });
  return r.body.access_token as string;
}
let supTok = '';
beforeAll(async () => {
  supTok = await token(SUP.email);
});

function summarize(orderId: string, tok: string | null = supTok) {
  const req = request(app).post(`/v1/orders/${orderId}/ai-summary`);
  return tok ? req.set('Authorization', `Bearer ${tok}`) : req;
}

describe('summarizeOrderIncident — integración US1 (resumen fiel)', () => {
  it('orden pending_review con notas+evidencia → 200 {summary, sufficient:true}', async () => {
    const o = await makePendingReviewOrder(prisma, {
      assignedTo: TECH.id,
      withEvidence: true,
      evidenceCount: 2,
      notes: 'El compresor de la unidad 4 no arrancaba; se sustituyo el rele y quedo operativo tras prueba.',
    });
    const res = await summarize(o.id);
    expect(res.status).toBe(200);
    expect(res.body.sufficient).toBe(true);
    expect(typeof res.body.summary).toBe('string');
    expect((res.body.summary as string).length).toBeGreaterThan(0);
  });

  it('la respuesta es exactamente {summary, sufficient} (FR-011, sin campos extra)', async () => {
    const o = await makePendingReviewOrder(prisma, { assignedTo: TECH.id, withEvidence: true });
    const res = await summarize(o.id);
    expect(Object.keys(res.body).sort()).toEqual(['sufficient', 'summary']);
  });
});
