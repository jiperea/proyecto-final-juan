import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import request from 'supertest';
import { SEED_PASSWORD, SEED_USERS } from '../../prisma/seed-data';
import { makeTestApp } from '../helpers/test-app';
import { makePendingReviewOrder } from '../helpers/transition';

// T017 (006, US2) — integración de reviewOrder reject + precedencia de errores
// (401→403→422 VALIDATION_ERROR→422 INVALID_REASON→404) sobre Postgres real.
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
beforeAll(async () => {
  supTok = await token(S.email);
});

function review(orderId: string, body: object, tok: string | null = supTok) {
  const req = request(app).post(`/v1/orders/${orderId}/review`);
  return (tok ? req.set('Authorization', `Bearer ${tok}`) : req).send(body);
}

describe('reviewOrder reject — integración (006, US2)', () => {
  it('reject con motivo válido → 200 in_progress, version+1, 1 auditoría con reason saneado', async () => {
    const o = await makePendingReviewOrder(prisma, { assignedTo: T.id, withEvidence: true, version: 3 });
    const res = await review(o.id, { decision: 'reject', reason: '  Faltan   fotos del cuadro ' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('in_progress');
    expect(res.body.version).toBe(4);
    const audit = await prisma.orderAudit.findFirstOrThrow({
      where: { orderId: o.id, toStatus: 'in_progress' },
    });
    expect(audit.fromStatus).toBe('pending_review');
    expect(audit.reason).toBe('Faltan fotos del cuadro'); // saneado (colapso de whitespace + trim)
  });

  it('reject SIN motivo → 422 INVALID_REASON, sin cambio de estado', async () => {
    const o = await makePendingReviewOrder(prisma, { assignedTo: T.id, withEvidence: true, version: 2 });
    const res = await review(o.id, { decision: 'reject' });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('INVALID_REASON');
    expect((await prisma.order.findUniqueOrThrow({ where: { id: o.id } })).status).toBe('pending_review');
  });

  it('reject con motivo sólo-whitespace (vacío tras saneo) → 422 INVALID_REASON', async () => {
    const o = await makePendingReviewOrder(prisma, { assignedTo: T.id, withEvidence: true });
    expect((await review(o.id, { decision: 'reject', reason: '   \t  ' })).body.code).toBe('INVALID_REASON');
  });

  it('reject con motivo >1000 tras saneo → 422 INVALID_REASON', async () => {
    const o = await makePendingReviewOrder(prisma, { assignedTo: T.id, withEvidence: true });
    expect((await review(o.id, { decision: 'reject', reason: 'x'.repeat(1001) })).body.code).toBe(
      'INVALID_REASON',
    );
  });

  it('(G2/K2) motivo con mucho whitespace (>1000 crudo, ≤1000 tras saneo) → 200', async () => {
    const o = await makePendingReviewOrder(prisma, { assignedTo: T.id, withEvidence: true });
    const raw = 'motivo' + ' '.repeat(1200) + 'valido';
    const res = await review(o.id, { decision: 'reject', reason: raw });
    expect(res.status).toBe(200);
    const audit = await prisma.orderAudit.findFirstOrThrow({
      where: { orderId: o.id, toStatus: 'in_progress' },
    });
    expect(audit.reason).toBe('motivo valido');
  });

  it('(G2/K2) motivo >4000 crudo → 422 VALIDATION_ERROR (cota de payload del schema)', async () => {
    const o = await makePendingReviewOrder(prisma, { assignedTo: T.id, withEvidence: true });
    expect((await review(o.id, { decision: 'reject', reason: 'x'.repeat(4001) })).body.code).toBe(
      'VALIDATION_ERROR',
    );
  });

  it('(FR-011) decision ausente / fuera del enum / body no-JSON → 422 VALIDATION_ERROR, antes que INVALID_REASON', async () => {
    const o = await makePendingReviewOrder(prisma, { assignedTo: T.id, withEvidence: true });
    expect((await review(o.id, {})).body.code).toBe('VALIDATION_ERROR');
    expect((await review(o.id, { decision: 'aprove' })).body.code).toBe('VALIDATION_ERROR');
    // decision inválida + reason inválido → VALIDATION_ERROR (decision antes que reason)
    expect((await review(o.id, { decision: 'x', reason: '  ' })).body.code).toBe('VALIDATION_ERROR');
  });

  it('(G2/H-001) orderId malformado + reason inválido → 422 INVALID_REASON (payload antes que recurso)', async () => {
    const res = await review('no-es-uuid', { decision: 'reject', reason: '   ' });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('INVALID_REASON');
  });

  it('(G2/H-001) orderId malformado + payload válido → 404', async () => {
    const res = await review('no-es-uuid', { decision: 'reject', reason: 'motivo válido' });
    expect(res.status).toBe(404);
  });

  it('orden no visible (in_progress) → 404', async () => {
    const { makeOrder } = await import('../helpers/transition');
    const o = await makeOrder(prisma, { status: 'in_progress', assignedTo: T.id });
    expect((await review(o.id, { decision: 'reject', reason: 'motivo' })).status).toBe(404);
  });
});
