// T019 (007, US3) — rate-limit del endpoint IA (FR-008): 10 OK, 11ª → 429 + Retry-After, sin proveedor.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { ok } from '../../src/domain/result';
import { SEED_PASSWORD, SEED_USERS } from '../../prisma/seed-data';
import { makeTestAppWithSummary } from '../helpers/test-app';
import { makePendingReviewOrder } from '../helpers/transition';

const spy = vi.fn(() => Promise.resolve(ok({ summary: 'ok', sufficient: true })));
// Ventana amplia para que las 11 peticiones caigan en la misma ventana; max=10.
const { app, prisma } = makeTestAppWithSummary({ provider: { generate: spy } }, { aiRateMax: 10, aiRateWindowMs: 600_000 });
afterAll(async () => {
  await prisma.$disconnect();
});

let supTok = '';
let orderId = '';
beforeAll(async () => {
  const r = await request(app).post('/v1/auth/login').send({ identifier: SEED_USERS.supervisor.email, password: SEED_PASSWORD });
  supTok = r.body.access_token as string;
  const o = await makePendingReviewOrder(prisma, {
    assignedTo: SEED_USERS.technician.id,
    withEvidence: true,
    notes: 'Incidencia con contenido suficiente para el resumen, repetida en varias peticiones seguidas.',
  });
  orderId = o.id;
});

describe('summarizeOrderIncident — rate-limit (US3)', () => {
  it('10 peticiones OK y la 11ª → 429 RATE_LIMITED + Retry-After, sin llamar al proveedor', async () => {
    const call = () => request(app).post(`/v1/orders/${orderId}/ai-summary`).set('Authorization', `Bearer ${supTok}`);
    for (let i = 0; i < 10; i++) {
      const res = await call();
      expect(res.status).toBe(200);
    }
    spy.mockClear();
    const limited = await call();
    expect(limited.status).toBe(429);
    expect(limited.body.code).toBe('RATE_LIMITED');
    expect(limited.headers['retry-after']).toBeDefined();
    expect(spy).not.toHaveBeenCalled();
  });
});
