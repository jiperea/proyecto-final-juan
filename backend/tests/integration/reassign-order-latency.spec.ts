import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import request from 'supertest';
import { SEED_PASSWORD, SEED_USERS } from '../../prisma/seed-data';
import { makeTestApp } from '../helpers/test-app';
import { makeOrder } from '../helpers/transition';

const { app, prisma } = makeTestApp();
afterAll(async () => {
  await prisma.$disconnect();
});

let disp = '';
beforeAll(async () => {
  const r = await request(app)
    .post('/v1/auth/login')
    .send({ identifier: SEED_USERS.dispatcher.email, password: SEED_PASSWORD });
  disp = r.body.access_token;
});

const T: [string, string] = [SEED_USERS.technician.id, SEED_USERS.technician2.id];

describe('reassignOrder — latencia p95 (SC-010)', () => {
  it('p95 < 300 ms sobre 50 peticiones secuenciales (BD caliente, warm-up descartado, nearest-rank)', async () => {
    const o = await makeOrder(prisma, { status: 'assigned', assignedTo: T[0], version: 0 });
    // Warm-up (descartado): primera reasignación (cold-start del pool).
    await request(app)
      .post(`/v1/orders/${o.id}/reassignments`)
      .set('Authorization', `Bearer ${disp}`)
      .send({ assignee_id: T[1], reason: 'warmup' });

    const samples: number[] = [];
    let cur = 1; // ya está en T[1]
    for (let i = 0; i < 50; i += 1) {
      const next = cur === 0 ? 1 : 0; // alterna T1↔T2 (destino distinto; evita el no-op y no usa T3)
      const t0 = performance.now();
      const res = await request(app)
        .post(`/v1/orders/${o.id}/reassignments`)
        .set('Authorization', `Bearer ${disp}`)
        .send({ assignee_id: T[next], reason: `m${i}` });
      samples.push(performance.now() - t0);
      expect(res.status).toBe(200);
      cur = next;
    }
    samples.sort((a, b) => a - b);
    const p95 = samples[Math.ceil(0.95 * 50) - 1] ?? samples[samples.length - 1]!; // nearest-rank, índice 48
    expect(p95).toBeLessThan(300);
  });
});
