import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { SEED_PASSWORD, SEED_USERS } from '../../prisma/seed-data';
import { cookieValue, makeTestApp } from '../helpers/test-app';

const { app, prisma } = makeTestApp();
afterAll(async () => {
  await prisma.$disconnect();
});

describe('flujo US1 login→me→logout (SC-001, FR-001/002b/003)', () => {
  it('entro, sé quién soy, salgo', async () => {
    const login = await request(app)
      .post('/v1/auth/login')
      .send({ identifier: SEED_USERS.dispatcher.username, password: SEED_PASSWORD });
    expect(login.status).toBe(200);
    const access = login.body.access_token as string;
    const refresh = cookieValue(login.headers['set-cookie'], 'refresh_token');
    const csrf = cookieValue(login.headers['set-cookie'], 'csrf_token');

    const me = await request(app).get('/v1/auth/me').set('Authorization', `Bearer ${access}`);
    expect(me.status).toBe(200);
    expect(me.body.user.username).toBe(SEED_USERS.dispatcher.username);

    const logout = await request(app)
      .post('/v1/auth/logout')
      .set('Cookie', `refresh_token=${refresh}; csrf_token=${csrf}`)
      .set('X-CSRF-Token', csrf);
    expect(logout.status).toBe(204);
  });

  it('cuenta disabled → 401 y no puede iniciar sesión (FR-002b)', async () => {
    const res = await request(app)
      .post('/v1/auth/login')
      .send({ identifier: SEED_USERS.disabled.email, password: SEED_PASSWORD });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
  });
});
