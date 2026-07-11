import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { SEED_PASSWORD, SEED_USERS } from '../../prisma/seed-data';
import { cookieValue, makeTestApp } from '../helpers/test-app';

const { app, prisma } = makeTestApp();
afterAll(async () => {
  await prisma.$disconnect();
});

describe('logout contract (FR-003/018, operationId=logout)', () => {
  it('401: sin cookie de sesión', async () => {
    const res = await request(app).post('/v1/auth/logout');
    expect(res.status).toBe(401);
  });

  it('204: revoca la sesión; 2º logout con la misma cookie → 401 (no idempotente)', async () => {
    const login = await request(app)
      .post('/v1/auth/login')
      .send({ identifier: SEED_USERS.supervisor.email, password: SEED_PASSWORD });
    const refresh = cookieValue(login.headers['set-cookie'], 'refresh_token');
    expect(refresh).toBeTruthy();

    const first = await request(app).post('/v1/auth/logout').set('Cookie', `refresh_token=${refresh}`);
    expect(first.status).toBe(204);

    const second = await request(app)
      .post('/v1/auth/logout')
      .set('Cookie', `refresh_token=${refresh}`);
    expect(second.status).toBe(401);
  });
});
