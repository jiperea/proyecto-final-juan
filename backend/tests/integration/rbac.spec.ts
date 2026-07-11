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

function probe(id: string, token: string): request.Test {
  return request(app).get(`/v1/rbac/probe/${id}`).set('Authorization', `Bearer ${token}`);
}

let dispatcher = '';
let supervisor = '';
let technician = '';
beforeAll(async () => {
  dispatcher = await accessFor(SEED_USERS.dispatcher.email);
  supervisor = await accessFor(SEED_USERS.supervisor.email);
  technician = await accessFor(SEED_USERS.technician.email);
});

describe('RBAC 401/403/404 deterministas (SC-002, FR-007/008/009/010/017/017b)', () => {
  it('sin autenticación → 401', async () => {
    expect((await request(app).get(`/v1/rbac/probe/${SEED_PROBES.A.id}`)).status).toBe(401);
  });

  it('technician → 403 SIEMPRE (aun con id en alcance de otros)', async () => {
    expect((await probe(SEED_PROBES.A.id, technician)).status).toBe(403);
  });

  it('dispatcher y supervisor → 200 sobre probe-A (ambos en alcance)', async () => {
    expect((await probe(SEED_PROBES.A.id, dispatcher)).status).toBe(200);
    expect((await probe(SEED_PROBES.A.id, supervisor)).status).toBe(200);
  });

  it('404-por-alcance: dispatcher sobre probe-B (solo supervisor) y supervisor sobre probe-C (solo dispatcher)', async () => {
    expect((await probe(SEED_PROBES.B.id, dispatcher)).status).toBe(404);
    expect((await probe(SEED_PROBES.B.id, supervisor)).status).toBe(200);
    expect((await probe(SEED_PROBES.C.id, supervisor)).status).toBe(404);
    expect((await probe(SEED_PROBES.C.id, dispatcher)).status).toBe(200);
  });

  it('404-por-inexistencia: id que no existe → 404 (indistinguible de fuera-de-alcance)', async () => {
    expect((await probe(NONEXISTENT_PROBE_ID, dispatcher)).status).toBe(404);
    expect((await probe(NONEXISTENT_PROBE_ID, supervisor)).status).toBe(404);
  });
});
