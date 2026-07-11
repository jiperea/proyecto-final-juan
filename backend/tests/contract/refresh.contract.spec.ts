import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { SEED_PASSWORD, SEED_USERS } from '../../prisma/seed-data';
import { cookieValue, makeTestApp } from '../helpers/test-app';

const { app, prisma } = makeTestApp();
afterAll(async () => {
  await prisma.$disconnect();
});

async function loginCookies(email: string): Promise<{ refresh: string; csrf: string }> {
  const r = await request(app).post('/v1/auth/login').send({ identifier: email, password: SEED_PASSWORD });
  return {
    refresh: cookieValue(r.headers['set-cookie'], 'refresh_token'),
    csrf: cookieValue(r.headers['set-cookie'], 'csrf_token'),
  };
}

describe('refresh contract (FR-004/005/012/018, operationId=refresh)', () => {
  it('200: rota y emite nuevo access + nuevas cookies', async () => {
    const { refresh, csrf } = await loginCookies(SEED_USERS.dispatcher.email);
    const res = await request(app)
      .post('/v1/auth/refresh')
      .set('Cookie', `refresh_token=${refresh}; csrf_token=${csrf}`)
      .set('X-CSRF-Token', csrf);
    expect(res.status).toBe(200);
    expect(res.body.access_token).toBeTruthy();
    expect(String(res.headers['set-cookie'])).toContain('refresh_token=');
  });

  it('401: refresh inexistente (con CSRF válido) → no revela', async () => {
    const { csrf } = await loginCookies(SEED_USERS.dispatcher.email);
    const res = await request(app)
      .post('/v1/auth/refresh')
      .set('Cookie', `refresh_token=bogus-token; csrf_token=${csrf}`)
      .set('X-CSRF-Token', csrf);
    expect(res.status).toBe(401);
  });

  it('403: sesión válida pero CSRF ausente', async () => {
    const { refresh, csrf } = await loginCookies(SEED_USERS.supervisor.email);
    const res = await request(app)
      .post('/v1/auth/refresh')
      .set('Cookie', `refresh_token=${refresh}; csrf_token=${csrf}`); // sin cabecera X-CSRF-Token
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('CSRF_INVALID');
  });
});
