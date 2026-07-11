import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { SEED_USERS } from '../../prisma/seed-data';
import { makeTestApp } from '../helpers/test-app';

const { app, prisma } = makeTestApp();
afterAll(async () => {
  await prisma.$disconnect();
});

describe('contenido de ErrorResponse — sin fugas (FR-014/S-001/S-005)', () => {
  it('401 de login: uniforme, sin identifier/password ni oráculo de existencia', async () => {
    const password = 'contra-secreta-999';
    const res = await request(app)
      .post('/v1/auth/login')
      .send({ identifier: SEED_USERS.supervisor.email, password });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain(password);
    expect(serialized).not.toContain(SEED_USERS.supervisor.email);
  });

  it('422: details.fields lista SÓLO nombres de campo, nunca sus valores', async () => {
    const password = 'corta';
    const res = await request(app)
      .post('/v1/auth/login')
      .send({ identifier: 'quien@sea.com', password });
    expect(res.status).toBe(422);
    expect(res.body.details.fields).toContain('password');
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain(password);
    expect(serialized).not.toContain('quien@sea.com');
  });
});
