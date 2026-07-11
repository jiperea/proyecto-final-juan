import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { SEED_PASSWORD, SEED_USERS } from '../../prisma/seed-data';
import { cookieValue, makeTestApp } from '../helpers/test-app';

const { app, prisma } = makeTestApp();
afterAll(async () => {
  await prisma.$disconnect();
});

interface Creds {
  refresh: string;
  csrf: string;
}
async function login(email: string): Promise<Creds> {
  const r = await request(app).post('/v1/auth/login').send({ identifier: email, password: SEED_PASSWORD });
  return {
    refresh: cookieValue(r.headers['set-cookie'], 'refresh_token'),
    csrf: cookieValue(r.headers['set-cookie'], 'csrf_token'),
  };
}
function doRefresh(c: Creds): request.Test {
  return request(app)
    .post('/v1/auth/refresh')
    .set('Cookie', `refresh_token=${c.refresh}; csrf_token=${c.csrf}`)
    .set('X-CSRF-Token', c.csrf);
}
function doLogout(c: Creds): request.Test {
  return request(app)
    .post('/v1/auth/logout')
    .set('Cookie', `refresh_token=${c.refresh}; csrf_token=${c.csrf}`)
    .set('X-CSRF-Token', c.csrf);
}

describe('refresh integración (SC-003, FR-004/004d/005)', () => {
  it('rota: nuevo refresh distinto del anterior; el nuevo access sirve para me', async () => {
    const c = await login(SEED_USERS.dispatcher.email);
    const res = await doRefresh(c);
    expect(res.status).toBe(200);
    const newRefresh = cookieValue(res.headers['set-cookie'], 'refresh_token');
    expect(newRefresh).not.toBe(c.refresh);
    const me = await request(app)
      .get('/v1/auth/me')
      .set('Authorization', `Bearer ${res.body.access_token}`);
    expect(me.status).toBe(200);
  });

  it('reintento del mismo token dentro de gracia → mismo access (idempotente)', async () => {
    const c = await login(SEED_USERS.supervisor.email);
    const first = await doRefresh(c);
    const second = await doRefresh(c); // mismo token, dentro de la ventana de gracia
    expect(second.status).toBe(200);
    expect(second.body.access_token).toBe(first.body.access_token);
  });

  it('sesión revocada por logout → refresh 401', async () => {
    const c = await login(SEED_USERS.technician.email);
    expect((await doLogout(c)).status).toBe(204);
    expect((await doRefresh(c)).status).toBe(401);
  });
});
