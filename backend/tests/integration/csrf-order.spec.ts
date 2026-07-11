import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { SEED_PASSWORD, SEED_USERS } from '../../prisma/seed-data';
import { cookieValue, makeTestApp } from '../helpers/test-app';

const { app, prisma } = makeTestApp();
afterAll(async () => {
  await prisma.$disconnect();
});

async function login(): Promise<{ refresh: string; csrf: string }> {
  const r = await request(app)
    .post('/v1/auth/login')
    .send({ identifier: SEED_USERS.dispatcher.email, password: SEED_PASSWORD });
  return {
    refresh: cookieValue(r.headers['set-cookie'], 'refresh_token'),
    csrf: cookieValue(r.headers['set-cookie'], 'csrf_token'),
  };
}

describe('orden sesión(401)→CSRF(403) en refresh y logout (FR-018, D2)', () => {
  it('refresh sin cookie de sesión → 401 (antes que CSRF)', async () => {
    expect((await request(app).post('/v1/auth/refresh')).status).toBe(401);
  });

  it('refresh con sesión pero sin X-CSRF-Token → 403', async () => {
    const { refresh, csrf } = await login();
    const res = await request(app)
      .post('/v1/auth/refresh')
      .set('Cookie', `refresh_token=${refresh}; csrf_token=${csrf}`);
    expect(res.status).toBe(403);
  });

  it('logout sin cookie de sesión → 401 (antes que CSRF)', async () => {
    expect((await request(app).post('/v1/auth/logout')).status).toBe(401);
  });

  it('logout con sesión pero CSRF no coincide → 403', async () => {
    const { refresh, csrf } = await login();
    const res = await request(app)
      .post('/v1/auth/logout')
      .set('Cookie', `refresh_token=${refresh}; csrf_token=${csrf}`)
      .set('X-CSRF-Token', 'no-coincide');
    expect(res.status).toBe(403);
  });

  it('refresh con sesión REVOCADA + CSRF ausente → 401, no 403 (B1/FR-018)', async () => {
    const { refresh, csrf } = await login();
    // revocar la sesión con un logout válido (CSRF correcto)
    await request(app)
      .post('/v1/auth/logout')
      .set('Cookie', `refresh_token=${refresh}; csrf_token=${csrf}`)
      .set('X-CSRF-Token', csrf);
    // ahora refresh con la cookie ya revocada y SIN X-CSRF-Token: sesión inválida → 401 antes que CSRF
    const res = await request(app)
      .post('/v1/auth/refresh')
      .set('Cookie', `refresh_token=${refresh}; csrf_token=${csrf}`);
    expect(res.status).toBe(401);
  });

  it('logout 2ª vez (sesión ya revocada) + CSRF ausente → 401, no 403 (B1/FR-018)', async () => {
    const { refresh, csrf } = await login();
    await request(app)
      .post('/v1/auth/logout')
      .set('Cookie', `refresh_token=${refresh}; csrf_token=${csrf}`)
      .set('X-CSRF-Token', csrf);
    const res = await request(app)
      .post('/v1/auth/logout')
      .set('Cookie', `refresh_token=${refresh}; csrf_token=${csrf}`);
    expect(res.status).toBe(401);
  });
});
