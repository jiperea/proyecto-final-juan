import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import request from 'supertest';
import { NONEXISTENT_PROBE_ID, SEED_PASSWORD, SEED_PROBES, SEED_USERS } from '../../prisma/seed-data';
import { makeTestApp } from '../helpers/test-app';

const { app, prisma } = makeTestApp();
afterAll(async () => {
  await prisma.$disconnect();
});

async function accessFor(email: string): Promise<string> {
  const r = await request(app).post('/v1/auth/login').send({ identifier: email, password: SEED_PASSWORD });
  return r.body.access_token as string;
}

let dispatcher = '';
let technician = '';
beforeAll(async () => {
  dispatcher = await accessFor(SEED_USERS.dispatcher.email);
  technician = await accessFor(SEED_USERS.technician.email);
});

describe('rbacProbe contract (FR-007/008/009/017/017b, operationId=rbacProbe)', () => {
  it('200: rol en alcance → { id, ok: true }', async () => {
    const res = await request(app)
      .get(`/v1/rbac/probe/${SEED_PROBES.A.id}`)
      .set('Authorization', `Bearer ${dispatcher}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: SEED_PROBES.A.id, ok: true });
  });

  it('401: sin autenticación', async () => {
    const res = await request(app).get(`/v1/rbac/probe/${SEED_PROBES.A.id}`);
    expect(res.status).toBe(401);
  });

  it('403: technician nunca puede esta acción', async () => {
    const res = await request(app)
      .get(`/v1/rbac/probe/${SEED_PROBES.A.id}`)
      .set('Authorization', `Bearer ${technician}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('404: id inexistente (no revela existencia)', async () => {
    const res = await request(app)
      .get(`/v1/rbac/probe/${NONEXISTENT_PROBE_ID}`)
      .set('Authorization', `Bearer ${dispatcher}`);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });
});
