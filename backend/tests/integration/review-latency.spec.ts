import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import request from 'supertest';
import { SEED_PASSWORD, SEED_USERS } from '../../prisma/seed-data';
import { makeTestApp } from '../helpers/test-app';
import { makePendingReviewOrder } from '../helpers/transition';

// T023 (006, SC-006) — latencia p95 < 300 ms medida POR SEPARADO para approve (sin motivo) y reject (motivo
// hasta 1000 chars), 50 peticiones secuenciales, BD caliente, warm-up descartado, nearest-rank; correlation-ID
// presente. Gated por RUN_PERF=1 (50 req junto al resto saturan el pool y vuelven flaky otros tests).
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

function p95(samples: number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.ceil(0.95 * sorted.length) - 1] ?? sorted[sorted.length - 1] ?? 0;
}

describe.runIf(process.env.RUN_PERF === '1')('latencia p95 por camino (006, SC-006)', () => {
  it('approve: p95 < 300 ms sobre 50 peticiones', async () => {
    const warm = await makePendingReviewOrder(prisma, { assignedTo: T.id, withEvidence: true });
    const w = await request(app)
      .post(`/v1/orders/${warm.id}/review`)
      .set('Authorization', `Bearer ${supTok}`)
      .send({ decision: 'approve' });
    expect(w.headers['x-correlation-id']).toBeTruthy();

    const samples: number[] = [];
    for (let i = 0; i < 50; i += 1) {
      const o = await makePendingReviewOrder(prisma, { assignedTo: T.id, withEvidence: true });
      const t0 = performance.now();
      const res = await request(app)
        .post(`/v1/orders/${o.id}/review`)
        .set('Authorization', `Bearer ${supTok}`)
        .send({ decision: 'approve' });
      samples.push(performance.now() - t0);
      expect(res.status).toBe(200);
    }
    expect(p95(samples)).toBeLessThan(300);
  });

  it('reject (motivo 1000 chars): p95 < 300 ms sobre 50 peticiones', async () => {
    const reason = 'x'.repeat(1000);
    const samples: number[] = [];
    for (let i = 0; i < 50; i += 1) {
      const o = await makePendingReviewOrder(prisma, { assignedTo: T.id, withEvidence: true });
      const t0 = performance.now();
      const res = await request(app)
        .post(`/v1/orders/${o.id}/review`)
        .set('Authorization', `Bearer ${supTok}`)
        .send({ decision: 'reject', reason });
      samples.push(performance.now() - t0);
      expect(res.status).toBe(200);
    }
    expect(p95(samples)).toBeLessThan(300);
  });
});
