import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { SEED_PASSWORD, SEED_USERS } from '../../prisma/seed-data';
import { cookieValue, makeTestApp } from '../helpers/test-app';

// graceMs corto para que el reuso quede fuera de gracia sin esperar 10s.
const { app, prisma } = makeTestApp({ graceMs: 50 });
afterAll(async () => {
  await prisma.$disconnect();
});

describe('invalidación inmediata del access tras FR-004b (B5, per-request cache path)', () => {
  it('reuso fuera de gracia revoca la familia y el access previo pasa a 401 en la misma petición', async () => {
    const login = await request(app)
      .post('/v1/auth/login')
      .send({ identifier: SEED_USERS.dispatcher.email, password: SEED_PASSWORD });
    const access = login.body.access_token as string;
    const r0 = cookieValue(login.headers['set-cookie'], 'refresh_token');
    const c0 = cookieValue(login.headers['set-cookie'], 'csrf_token');

    // El access recién emitido funciona.
    const meBefore = await request(app).get('/v1/auth/me').set('Authorization', `Bearer ${access}`);
    expect(meBefore.status).toBe(200);

    // Rota una vez (r0 queda rotado).
    const rotated = await request(app)
      .post('/v1/auth/refresh')
      .set('Cookie', `refresh_token=${r0}; csrf_token=${c0}`)
      .set('X-CSRF-Token', c0);
    expect(rotated.status).toBe(200);

    // Fuera de la ventana de gracia.
    await new Promise((res) => setTimeout(res, 90));

    // Reuso de r0 → 401 + revoca la familia (FR-004b).
    const reuse = await request(app)
      .post('/v1/auth/refresh')
      .set('Cookie', `refresh_token=${r0}; csrf_token=${c0}`)
      .set('X-CSRF-Token', c0);
    expect(reuse.status).toBe(401);

    // El access original (misma familia sid) ahora es rechazado de inmediato.
    const meAfter = await request(app).get('/v1/auth/me').set('Authorization', `Bearer ${access}`);
    expect(meAfter.status).toBe(401);
  });
});
