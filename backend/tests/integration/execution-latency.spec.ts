import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import request from 'supertest';
import { SEED_PASSWORD, SEED_USERS } from '../../prisma/seed-data';
import { makeTestApp } from '../helpers/test-app';
import { makeOrder } from '../helpers/transition';

// T026 (005, SC-009) — latencia p95 < 300 ms (50 peticiones secuenciales, BD caliente, warm-up descartado,
// nearest-rank) en start y execution; correlation-ID presente en respuesta. Gated por RUN_PERF=1 (fuera del
// `vitest run` por defecto): 50 peticiones junto al resto de la suite saturan el pool y vuelven flaky a otros
// tests de integración (mismo criterio que 002b/004). Verificado en aislamiento.
const { app, prisma } = makeTestApp();
afterAll(async () => {
  await prisma.$disconnect();
});

const T = SEED_USERS.technician;
let techTok = '';
beforeAll(async () => {
  const r = await request(app).post('/v1/auth/login').send({ identifier: T.email, password: SEED_PASSWORD });
  techTok = r.body.access_token;
});

function p95(samples: number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.ceil(0.95 * sorted.length) - 1] ?? sorted[sorted.length - 1] ?? 0;
}

describe.runIf(process.env.RUN_PERF === '1')('latencia p95 (005, SC-009)', () => {
  it('start: p95 < 300 ms sobre 50 peticiones secuenciales', async () => {
    // warm-up descartado
    const warm = await makeOrder(prisma, { status: 'assigned', assignedTo: T.id });
    const w = await request(app).post(`/v1/orders/${warm.id}/start`).set('Authorization', `Bearer ${techTok}`);
    expect(w.headers['x-correlation-id']).toBeTruthy();

    const samples: number[] = [];
    for (let i = 0; i < 50; i += 1) {
      const o = await makeOrder(prisma, { status: 'assigned', assignedTo: T.id });
      const t0 = performance.now();
      const res = await request(app).post(`/v1/orders/${o.id}/start`).set('Authorization', `Bearer ${techTok}`);
      samples.push(performance.now() - t0);
      expect(res.status).toBe(200);
    }
    expect(p95(samples)).toBeLessThan(300);
  });

  it('execution: p95 < 300 ms sobre 50 peticiones secuenciales', async () => {
    const body = () => ({
      notes: 'ejecución',
      evidence: [{ object_ref: `ref/${Math.random()}`, content_type: 'image/jpeg', size_bytes: 100 }],
    });
    const warm = await makeOrder(prisma, { status: 'in_progress', assignedTo: T.id });
    await request(app).post(`/v1/orders/${warm.id}/execution`).set('Authorization', `Bearer ${techTok}`).send(body());

    const samples: number[] = [];
    for (let i = 0; i < 50; i += 1) {
      const o = await makeOrder(prisma, { status: 'in_progress', assignedTo: T.id });
      const t0 = performance.now();
      const res = await request(app)
        .post(`/v1/orders/${o.id}/execution`)
        .set('Authorization', `Bearer ${techTok}`)
        .send(body());
      samples.push(performance.now() - t0);
      expect(res.status).toBe(200);
    }
    expect(p95(samples)).toBeLessThan(300);
  });
});
