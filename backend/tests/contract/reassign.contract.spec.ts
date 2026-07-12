import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import request from 'supertest';
import { SEED_PASSWORD, SEED_USERS } from '../../prisma/seed-data';
import { makeTestApp } from '../helpers/test-app';
import { makeOrder } from '../helpers/transition';

const { app, prisma } = makeTestApp();
afterAll(async () => {
  await prisma.$disconnect();
});

let disp = '';
beforeAll(async () => {
  const r = await request(app)
    .post('/v1/auth/login')
    .send({ identifier: SEED_USERS.dispatcher.email, password: SEED_PASSWORD });
  disp = r.body.access_token;
});

const ORDER_KEYS = [
  'id',
  'title',
  'description',
  'status',
  'assigned_to',
  'version',
  'created_at',
  'updated_at',
].sort();

describe('reassignOrder — contrato (forma por código, OpenAPI)', () => {
  it('200 → forma exacta de Order (sin claves extra)', async () => {
    const o = await makeOrder(prisma, { status: 'assigned', assignedTo: SEED_USERS.technician.id });
    const res = await request(app)
      .post(`/v1/orders/${o.id}/reassignments`)
      .set('Authorization', `Bearer ${disp}`)
      .send({ assignee_id: SEED_USERS.technician2.id, reason: 'motivo' });
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(ORDER_KEYS);
  });

  it('422 INVALID_ASSIGNEE → {code,message,agent_action}, sin details reveladores', async () => {
    const o = await makeOrder(prisma, { status: 'assigned', assignedTo: SEED_USERS.technician.id });
    const res = await request(app)
      .post(`/v1/orders/${o.id}/reassignments`)
      .set('Authorization', `Bearer ${disp}`)
      .send({ assignee_id: SEED_USERS.technician.id, reason: 'm' }); // mismo que el actual
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('INVALID_ASSIGNEE');
    expect(typeof res.body.message).toBe('string');
    expect(typeof res.body.agent_action).toBe('string');
  });

  it('404 → cuerpo genérico {code,message} sin details', async () => {
    const res = await request(app)
      .post('/v1/orders/018f2000-0000-7000-8000-0000000000ee/reassignments')
      .set('Authorization', `Bearer ${disp}`)
      .send({ assignee_id: SEED_USERS.technician2.id, reason: 'm' });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('ORDER_NOT_FOUND');
    expect(res.body.details).toBeUndefined();
  });

  it('401 sin token → {code,message}', async () => {
    const res = await request(app)
      .post('/v1/orders/018f2000-0000-7000-8000-0000000000ee/reassignments')
      .send({ assignee_id: SEED_USERS.technician2.id, reason: 'm' });
    expect(res.status).toBe(401);
    expect(typeof res.body.code).toBe('string');
  });
});
