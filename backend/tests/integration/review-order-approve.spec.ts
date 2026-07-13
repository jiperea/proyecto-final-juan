import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import request from 'supertest';
import { SEED_PASSWORD, SEED_USERS } from '../../prisma/seed-data';
import { makeTestApp } from '../helpers/test-app';
import { makeOrder, makePendingReviewOrder } from '../helpers/transition';

// T012 (006, US1) — integración de reviewOrder approve sobre Postgres real. Aprobación, guard de evidencia
// (409 EVIDENCE_MISSING) y no-enumeración (orden no visible SIN evidencia → 404, NUNCA 409; G2/K1).
const { app, prisma } = makeTestApp();
afterAll(async () => {
  await prisma.$disconnect();
});

const S = SEED_USERS.supervisor;
const T = SEED_USERS.technician;

async function token(email: string): Promise<string> {
  const r = await request(app).post('/v1/auth/login').send({ identifier: email, password: SEED_PASSWORD });
  return r.body.access_token as string;
}
let supTok = '';
let techTok = '';
beforeAll(async () => {
  supTok = await token(S.email);
  techTok = await token(T.email);
});

function review(orderId: string, body: object, tok: string | null) {
  const req = request(app).post(`/v1/orders/${orderId}/review`);
  return (tok ? req.set('Authorization', `Bearer ${tok}`) : req).send(body);
}

describe('reviewOrder approve — integración (006, US1)', () => {
  it('pending_review con evidencia → 200 closed, version+1, 1 auditoría {pending_review→closed, actor:S, reason NULL}', async () => {
    const o = await makePendingReviewOrder(prisma, { assignedTo: T.id, withEvidence: true, version: 4 });
    const res = await review(o.id, { decision: 'approve' }, supTok);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('closed');
    expect(res.body.version).toBe(5);

    const after = await prisma.order.findUniqueOrThrow({ where: { id: o.id } });
    expect(after.status).toBe('closed');
    const audits = await prisma.orderAudit.findMany({
      where: { orderId: o.id, toStatus: 'closed' },
    });
    expect(audits.length).toBe(1);
    expect(audits[0]?.fromStatus).toBe('pending_review');
    expect(audits[0]?.actorId).toBe(S.id);
    expect(audits[0]?.reason).toBeNull();
  });

  it('pending_review REAL sin evidencia → 409 EVIDENCE_MISSING, sin efecto', async () => {
    const o = await makePendingReviewOrder(prisma, { assignedTo: T.id, withEvidence: false, version: 2 });
    const res = await review(o.id, { decision: 'approve' }, supTok);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('EVIDENCE_MISSING');
    const after = await prisma.order.findUniqueOrThrow({ where: { id: o.id } });
    expect(after.status).toBe('pending_review');
    expect(after.version).toBe(2);
  });

  it('(G2/K1) orden NO visible SIN evidencia (assigned) → 404 genérico, NUNCA 409', async () => {
    const o = await makeOrder(prisma, { status: 'assigned', assignedTo: T.id, version: 1 });
    const res = await review(o.id, { decision: 'approve' }, supTok);
    expect(res.status).toBe(404);
    expect(res.body.code).not.toBe('EVIDENCE_MISSING');
  });

  it('closed (no visible) → 404, sin efecto', async () => {
    const o = await makeOrder(prisma, { status: 'closed', assignedTo: T.id, version: 9 });
    const res = await review(o.id, { decision: 'approve' }, supTok);
    expect(res.status).toBe(404);
  });

  it('sin token → 401', async () => {
    const o = await makePendingReviewOrder(prisma, { assignedTo: T.id, withEvidence: true });
    expect((await review(o.id, { decision: 'approve' }, null)).status).toBe(401);
  });

  it('technician → 403 (rol ≠ supervisor)', async () => {
    const o = await makePendingReviewOrder(prisma, { assignedTo: T.id, withEvidence: true });
    const res = await review(o.id, { decision: 'approve' }, techTok);
    expect(res.status).toBe(403);
    expect(await prisma.orderAudit.count({ where: { orderId: o.id, toStatus: 'closed' } })).toBe(0);
  });

  it('orderId inexistente / malformado → 404', async () => {
    expect((await review('00000000-0000-7000-8000-0000000000ff', { decision: 'approve' }, supTok)).status).toBe(404);
    expect((await review('no-es-uuid', { decision: 'approve' }, supTok)).status).toBe(404);
  });

  it('(FR-012) actor_id en el cuerpo → rechazado (.strict), actor = token', async () => {
    const o = await makePendingReviewOrder(prisma, { assignedTo: T.id, withEvidence: true });
    const res = await review(o.id, { decision: 'approve', actor_id: T.id }, supTok);
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('(G2/H-005) orderId malformado + reason inválido presente en approve → 422 INVALID_REASON (payload primero)', async () => {
    const res = await review('no-es-uuid', { decision: 'approve', reason: '   ' }, supTok);
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('INVALID_REASON');
  });

  it('(G2/H-005) orderId malformado + approve sin reason → 404', async () => {
    const res = await review('no-es-uuid', { decision: 'approve' }, supTok);
    expect(res.status).toBe(404);
  });

  it('(G3/I-001, FR-008) approve con motivo VÁLIDO → 200 y OrderAudit.reason = motivo saneado', async () => {
    const o = await makePendingReviewOrder(prisma, { assignedTo: T.id, withEvidence: true, version: 1 });
    const res = await review(o.id, { decision: 'approve', reason: '  Trabajo   correcto ' }, supTok);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('closed');
    const audit = await prisma.orderAudit.findFirstOrThrow({ where: { orderId: o.id, toStatus: 'closed' } });
    expect(audit.reason).toBe('Trabajo correcto'); // saneado (colapso de whitespace + trim); mismo trato que reject
  });
});
