import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { SEED_PASSWORD, SEED_USERS } from '../../prisma/seed-data';
import { makeTestApp } from '../helpers/test-app';

const { app, prisma } = makeTestApp();
afterAll(async () => {
  await prisma.$disconnect();
});

describe('login contract (FR-001/002/011, operationId=login)', () => {
  it('200: access en cuerpo + Set-Cookie refresh/csrf', async () => {
    const res = await request(app)
      .post('/v1/auth/login')
      .send({ identifier: SEED_USERS.dispatcher.email, password: SEED_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.token_type).toBe('Bearer');
    expect(res.body.access_token).toBeTruthy();
    expect(res.body.expires_in).toBe(900);
    expect(res.body.user).toMatchObject({
      role: 'dispatcher',
      email: SEED_USERS.dispatcher.email,
      username: SEED_USERS.dispatcher.username,
    });
    const cookies = String(res.headers['set-cookie']);
    expect(cookies).toContain('refresh_token=');
    expect(cookies).toContain('csrf_token=');
    expect(cookies).toContain('HttpOnly'); // refresh HttpOnly
  });

  it('401: credenciales inválidas (uniforme)', async () => {
    const res = await request(app)
      .post('/v1/auth/login')
      .send({ identifier: SEED_USERS.supervisor.email, password: 'incorrecta-1234' });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('422: cuerpo mal formado (contraseña demasiado corta)', async () => {
    const res = await request(app)
      .post('/v1/auth/login')
      .send({ identifier: 'x@y.com', password: 'corta' });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('429: cuenta bloqueada (locked_until) con Retry-After', async () => {
    const res = await request(app)
      .post('/v1/auth/login')
      .send({ identifier: SEED_USERS.locked.email, password: SEED_PASSWORD });
    expect(res.status).toBe(429);
    expect(res.headers['retry-after']).toBeTruthy();
  });
});
