import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import request from 'supertest';
import { SEED_PASSWORD, SEED_USERS } from '../../prisma/seed-data';
import { makeTestApp } from '../helpers/test-app';
import { makePendingReviewOrder } from '../helpers/transition';

// T019 (006, US2, FR-005) — tras aprobar o rechazar, la evidencia y las notas de 005 siguen presentes e
// inalteradas (0 pérdidas). 006 nunca toca order_evidence / order_execution_notes.
const { app, prisma } = makeTestApp();
afterAll(async () => {
  await prisma.$disconnect();
});
const S = SEED_USERS.supervisor;
const T = SEED_USERS.technician;

let supTok = '';
beforeAll(async () => {
  const r = await request(app).post('/v1/auth/login').send({ identifier: S.email, password: SEED_PASSWORD });
  supTok = r.body.access_token;
});

async function snapshot(orderId: string) {
  const evidence = await prisma.orderEvidence.findMany({ where: { orderId }, orderBy: { objectRef: 'asc' } });
  const notes = await prisma.orderExecutionNotes.findMany({ where: { orderId } });
  return {
    evidence: evidence.map((e) => ({ ref: e.objectRef, ct: e.contentType, sz: e.sizeBytes })),
    notes: notes.map((n) => n.notes),
  };
}

describe('reviewOrder — conservación de evidencia/notas (006, FR-005)', () => {
  it('approve conserva evidencia y notas intactas', async () => {
    const o = await makePendingReviewOrder(prisma, { assignedTo: T.id, withEvidence: true, evidenceCount: 3 });
    const before = await snapshot(o.id);
    const res = await request(app)
      .post(`/v1/orders/${o.id}/review`)
      .set('Authorization', `Bearer ${supTok}`)
      .send({ decision: 'approve' });
    expect(res.status).toBe(200);
    expect(await snapshot(o.id)).toEqual(before);
    expect(before.evidence.length).toBe(3);
    expect(before.notes.length).toBe(1);
  });

  it('reject conserva evidencia y notas intactas', async () => {
    const o = await makePendingReviewOrder(prisma, { assignedTo: T.id, withEvidence: true, evidenceCount: 2 });
    const before = await snapshot(o.id);
    const res = await request(app)
      .post(`/v1/orders/${o.id}/review`)
      .set('Authorization', `Bearer ${supTok}`)
      .send({ decision: 'reject', reason: 'faltan detalles' });
    expect(res.status).toBe(200);
    expect(await snapshot(o.id)).toEqual(before);
  });
});
