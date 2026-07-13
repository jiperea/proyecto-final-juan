// T028 (008/#010, Polish) — no-fuga de PII (SC-004, FR-006). 0 object_ref en el cuerpo (todo rol); 0 PII
// estructural en el motivo (saneo al leer); fail-closed del redactor (200 sin motivo, nunca crudo).
import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { hasStructuredPii } from '../../src/domain/ai/pii-redactor';
import { SEED_PASSWORD, SEED_USERS } from '../../prisma/seed-data';
import { makeTestApp, makeTestAppWithOrderDetail } from '../helpers/test-app';
import { makePendingReviewOrder, makeRejectedOrder } from '../helpers/transition';

const { app, prisma } = makeTestApp();
afterAll(async () => {
  await prisma.$disconnect();
});

async function token(email: string): Promise<string> {
  const r = await request(app).post('/v1/auth/login').send({ identifier: email, password: SEED_PASSWORD });
  return r.body.access_token as string;
}

const PII_REASON = 'Llama a Juan al 600123456 o juan.perez@example.com; DNI 12345678Z.';

describe('getOrderDetail — no-fuga de PII (SC-004/FR-006)', () => {
  it('0 object_ref en el cuerpo (technician y supervisor)', async () => {
    const o = await makeRejectedOrder(prisma, { assignedTo: SEED_USERS.technician.id, evidenceCount: 3 });
    const techRes = await request(app).get(`/v1/orders/${o.id}`).set('Authorization', `Bearer ${await token(SEED_USERS.technician.email)}`);
    expect(techRes.status).toBe(200);
    const raw = JSON.stringify(techRes.body);
    expect(raw).not.toContain('object_ref');
    expect(raw).not.toContain('s3://');

    const sup = await makePendingReviewOrder(prisma, { assignedTo: SEED_USERS.technician.id, withEvidence: true });
    const supRes = await request(app).get(`/v1/orders/${sup.id}`).set('Authorization', `Bearer ${await token(SEED_USERS.supervisor.email)}`);
    expect(JSON.stringify(supRes.body)).not.toContain('s3://');
  });

  it('motivo con PII estructural → saneado al leer (0 PII estructural, [REDACTED] presente)', async () => {
    const o = await makeRejectedOrder(prisma, { assignedTo: SEED_USERS.technician.id, reason: PII_REASON });
    const res = await request(app).get(`/v1/orders/${o.id}`).set('Authorization', `Bearer ${await token(SEED_USERS.technician.email)}`);
    expect(res.status).toBe(200);
    const reason = res.body.last_rejection_reason as string;
    expect(hasStructuredPii(reason)).toBe(false);
    expect(reason).toContain('[REDACTED]');
  });

  it('esc.14: el redactor falla al servir el motivo → 200 SIN last_rejection_reason (fail-closed)', async () => {
    const { app: appKo, prisma: pKo } = makeTestAppWithOrderDetail({
      redactor: {
        redact: () => {
          throw new Error('redactor KO');
        },
      },
    });
    const o = await makeRejectedOrder(pKo, { assignedTo: SEED_USERS.technician.id, reason: PII_REASON });
    const tok = (
      await request(appKo).post('/v1/auth/login').send({ identifier: SEED_USERS.technician.email, password: SEED_PASSWORD })
    ).body.access_token as string;
    const res = await request(appKo).get(`/v1/orders/${o.id}`).set('Authorization', `Bearer ${tok}`);
    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty('last_rejection_reason');
    expect(JSON.stringify(res.body)).not.toContain('Juan');
    await pKo.$disconnect();
  });
});
