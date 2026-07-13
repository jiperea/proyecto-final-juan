import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import request from 'supertest';
import { createLogger } from '../../src/infra/logger';
import { SEED_PASSWORD, SEED_USERS } from '../../prisma/seed-data';
import { makeTestApp } from '../helpers/test-app';
import { makePendingReviewOrder } from '../helpers/transition';

// T021 (006, SC-005/FR-008) — no-fuga del motivo: el `reason` centinela NO aparece en logs ni en cuerpos de
// error. El motivo SÍ se persiste en OrderAudit.reason (pre-saneado; es el motivo de la transición, XI), pero
// NUNCA en la respuesta HTTP ni en los logs.
const { app, prisma } = makeTestApp();
afterAll(async () => {
  await prisma.$disconnect();
});
const S = SEED_USERS.supervisor;
const T = SEED_USERS.technician;
const SENTINEL = 'PII_REASON_SENTINEL_zzz';

let supTok = '';
beforeAll(async () => {
  const r = await request(app).post('/v1/auth/login').send({ identifier: S.email, password: SEED_PASSWORD });
  supTok = r.body.access_token;
});

describe('no-fuga del motivo (006, SC-005/FR-008)', () => {
  it('el logger redacta reason (top-level, req.body.reason, err.reason)', () => {
    const lines: string[] = [];
    const logger = createLogger({ stream: { write: (s: string) => lines.push(s) } });
    logger.info({ reason: SENTINEL }, 'top-level');
    logger.info({ req: { body: { reason: SENTINEL } } }, 'req.body anidado');
    logger.error({ err: { reason: SENTINEL } }, 'error');
    const out = lines.join('');
    expect(out).not.toContain(SENTINEL);
    expect(out).toContain('[Redacted]');
  });

  it('el cuerpo de error (422 INVALID_REASON) NO contiene el motivo centinela', async () => {
    const o = await makePendingReviewOrder(prisma, { assignedTo: T.id, withEvidence: true });
    // motivo demasiado largo (>1000 tras saneo) con centinela → 422, sin ecoar el texto.
    const res = await request(app)
      .post(`/v1/orders/${o.id}/review`)
      .set('Authorization', `Bearer ${supTok}`)
      .send({ decision: 'reject', reason: `${SENTINEL} `.repeat(200) });
    expect(res.status).toBe(422);
    expect(JSON.stringify(res.body)).not.toContain(SENTINEL);
  });

  it('reject exitoso: el motivo se persiste en OrderAudit.reason pero NO en la respuesta', async () => {
    const o = await makePendingReviewOrder(prisma, { assignedTo: T.id, withEvidence: true });
    const res = await request(app)
      .post(`/v1/orders/${o.id}/review`)
      .set('Authorization', `Bearer ${supTok}`)
      .send({ decision: 'reject', reason: SENTINEL });
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain(SENTINEL); // la respuesta es el Order, sin reason
    const audit = await prisma.orderAudit.findFirstOrThrow({ where: { orderId: o.id, toStatus: 'in_progress' } });
    expect(audit.reason).toBe(SENTINEL); // sí persiste (motivo de la transición, XI)
  });
});
