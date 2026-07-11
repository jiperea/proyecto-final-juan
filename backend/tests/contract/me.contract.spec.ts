import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { SEED_PASSWORD, SEED_USERS } from '../../prisma/seed-data';
import { makeTestApp } from '../helpers/test-app';

const { app, prisma } = makeTestApp();
afterAll(async () => {
  await prisma.$disconnect();
});

describe('me contract (FR-006, operationId=me)', () => {
  it('401: sin access token', async () => {
    const res = await request(app).get('/v1/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHENTICATED');
  });

  it('200: identidad del usuario autenticado', async () => {
    const login = await request(app)
      .post('/v1/auth/login')
      .send({ identifier: SEED_USERS.technician.email, password: SEED_PASSWORD });
    const res = await request(app)
      .get('/v1/auth/me')
      .set('Authorization', `Bearer ${login.body.access_token}`);
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      role: 'technician',
      email: SEED_USERS.technician.email,
    });
  });
});
