import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { SEED_PASSWORD, SEED_USERS } from '../../prisma/seed-data';
import { makeTestApp } from '../helpers/test-app';

const { app, prisma } = makeTestApp();
afterAll(async () => {
  await prisma.$disconnect();
});

describe('GET /v1/orders — auth/authorize orden 401→403 (FR-005/006/014)', () => {
  it('sin token → 401', async () => {
    const res = await request(app).get('/v1/orders');
    expect(res.status).toBe(401);
  });

  it('token inválido → 401 (auth antes que autorización)', async () => {
    const res = await request(app).get('/v1/orders').set('Authorization', 'Bearer basura');
    expect(res.status).toBe(401);
  });

  it('rol permitido con token válido → 200', async () => {
    const r = await request(app)
      .post('/v1/auth/login')
      .send({ identifier: SEED_USERS.dispatcher.email, password: SEED_PASSWORD });
    const res = await request(app).get('/v1/orders').set('Authorization', `Bearer ${r.body.access_token}`);
    expect(res.status).toBe(200);
  });
});
