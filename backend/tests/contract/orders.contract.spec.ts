import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { SEED_PASSWORD, SEED_USERS } from '../../prisma/seed-data';
import { makeTestApp } from '../helpers/test-app';

const { app, prisma } = makeTestApp();
afterAll(async () => {
  await prisma.$disconnect();
});

const ORDER_KEYS = [
  'id',
  'title',
  'description',
  'status',
  'assigned_to',
  'version',
  'created_at',
  'updated_at',
].sort();

describe('listOrders contract (FR-001/007/011/014)', () => {
  it('200: { orders: [...] } con los campos públicos exactos', async () => {
    const login = await request(app)
      .post('/v1/auth/login')
      .send({ identifier: SEED_USERS.dispatcher.email, password: SEED_PASSWORD });
    const res = await request(app)
      .get('/v1/orders')
      .set('Authorization', `Bearer ${login.body.access_token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.orders)).toBe(true);
    const order = res.body.orders[0];
    expect(Object.keys(order).sort()).toEqual(ORDER_KEYS);
    expect(order.assigned_to === null || /^[0-9a-f-]{36}$/.test(order.assigned_to)).toBe(true);
  });

  it('401: sin token → { code, message } accionable + x-correlation-id', async () => {
    const res = await request(app).get('/v1/orders');
    expect(res.status).toBe(401);
    expect(res.body.code).toBeTruthy();
    expect(res.body.message).toBeTruthy();
    expect(res.headers['x-correlation-id']).toBeTruthy();
  });
});
