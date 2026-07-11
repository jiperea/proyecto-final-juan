import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { SEED_ORDERS, SEED_PASSWORD, SEED_USERS } from '../../prisma/seed-data';
import { makeTestApp } from '../helpers/test-app';

const { app, prisma } = makeTestApp();
afterAll(async () => {
  await prisma.$disconnect();
});

async function access(email: string): Promise<string> {
  const r = await request(app).post('/v1/auth/login').send({ identifier: email, password: SEED_PASSWORD });
  return r.body.access_token as string;
}
function list(token: string, qs = ''): request.Test {
  return request(app).get(`/v1/orders${qs}`).set('Authorization', `Bearer ${token}`);
}

describe('GET /v1/orders — listado por rol (SC-001/004, FR-002/003/004/008/009/012/015)', () => {
  it('technician1: solo sus activas (sin closed/draft, sin ajenas, sin la pending_review de technician2)', async () => {
    const res = await list(await access(SEED_USERS.technician.email));
    expect(res.status).toBe(200);
    const orders = res.body.orders as { id: string; assigned_to: string; status: string }[];
    expect(orders.length).toBeGreaterThan(0);
    for (const o of orders) {
      expect(o.assigned_to).toBe(SEED_USERS.technician.id);
      expect(['assigned', 'in_progress', 'pending_review']).toContain(o.status);
    }
    expect(orders.some((o) => o.id === SEED_ORDERS.tech2PendingReview)).toBe(false); // IDOR
  });

  it('supervisor: solo pending_review (incluida la de technician2)', async () => {
    const orders = (await list(await access(SEED_USERS.supervisor.email))).body.orders as {
      id: string;
      status: string;
    }[];
    for (const o of orders) {
      expect(o.status).toBe('pending_review');
    }
    expect(orders.some((o) => o.id === SEED_ORDERS.tech2PendingReview)).toBe(true);
  });

  it('dispatcher: solo assigned/in_progress', async () => {
    const orders = (await list(await access(SEED_USERS.dispatcher.email))).body.orders as {
      status: string;
    }[];
    for (const o of orders) {
      expect(['assigned', 'in_progress']).toContain(o.status);
    }
  });

  it('technician3 (sin activas) → 200 con lista vacía', async () => {
    const res = await list(await access(SEED_USERS.technician3.email));
    expect(res.status).toBe(200);
    expect(res.body.orders).toEqual([]);
  });

  it('orden created_at desc con id desc como tiebreak', async () => {
    const orders = (await list(await access(SEED_USERS.technician.email))).body.orders as {
      id: string;
      created_at: string;
    }[];
    const idxHi = orders.findIndex((o) => o.id === SEED_ORDERS.tiePairHi);
    const idxLo = orders.findIndex((o) => o.id === SEED_ORDERS.tiePairLo);
    expect(idxHi).toBeGreaterThanOrEqual(0);
    expect(idxLo).toBe(idxHi + 1); // mismo created_at → id mayor (Hi) primero
    for (let i = 1; i < orders.length; i++) {
      expect(new Date(orders[i - 1]!.created_at).getTime()).toBeGreaterThanOrEqual(
        new Date(orders[i]!.created_at).getTime(),
      );
    }
  });

  it('query params no amplían el alcance (FR-015)', async () => {
    const t = await access(SEED_USERS.technician.email);
    const base = ((await list(t)).body.orders as { id: string }[]).map((o) => o.id).sort();
    const forced = (
      (await list(t, `?assigned_to=${SEED_USERS.technician2.id}&status=closed`)).body.orders as {
        id: string;
      }[]
    )
      .map((o) => o.id)
      .sort();
    expect(forced).toEqual(base);
  });
});
