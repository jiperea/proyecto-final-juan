// T010 (008/#010, US1) — contrato de getOrderDetail: forma de la respuesta por código (200/401/404/500/503).
// Validación ESTRICTA de claves (sin campos extra; ningún campo de auditoría adicional). 200 conforme a
// OrderDetailResponse; evidence/notes/last_rejection_reason opcionales; dispatcher los OMITE; nunca 403.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { domainError } from '../../src/domain/result';
import { SEED_PASSWORD, SEED_USERS } from '../../prisma/seed-data';
import { makeTestApp, makeTestAppWithOrderDetail } from '../helpers/test-app';
import { makeOrder, makeRejectedOrder } from '../helpers/transition';

const { app, prisma } = makeTestApp();
afterAll(async () => {
  await prisma.$disconnect();
});

async function token(email: string): Promise<string> {
  const r = await request(app).post('/v1/auth/login').send({ identifier: email, password: SEED_PASSWORD });
  return r.body.access_token as string;
}
let techTok = '';
let dispTok = '';
beforeAll(async () => {
  techTok = await token(SEED_USERS.technician.email);
  dispTok = await token(SEED_USERS.dispatcher.email);
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

const NONEXISTENT = '00000000-0000-7000-8000-000000000000';

describe('getOrderDetail — contrato (operationId=getOrderDetail)', () => {
  it('200 technician con motivo: OrderDetailResponse { order, notes, evidence, last_rejection_reason } exacto', async () => {
    const o = await makeRejectedOrder(prisma, { assignedTo: SEED_USERS.technician.id });
    const res = await request(app).get(`/v1/orders/${o.id}`).set('Authorization', `Bearer ${techTok}`);
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(
      ['order', 'notes', 'evidence', 'last_rejection_reason'].sort(),
    );
    expect(Object.keys(res.body.order).sort()).toEqual(ORDER_KEYS);
    expect(Object.keys(res.body.evidence).sort()).toEqual(['count', 'content_types', 'items'].sort());
    expect(res.body.evidence.count).toBe(res.body.evidence.content_types.length);
    expect(res.body.evidence.count).toBe(res.body.evidence.items.length); // 024/FR-014
    expect(typeof res.body.last_rejection_reason).toBe('string');
  });

  it('200 dispatcher: OMITE notes y evidence (mínimo privilegio); solo { order }', async () => {
    const o = await makeOrder(prisma, { status: 'in_progress', assignedTo: SEED_USERS.technician.id });
    const res = await request(app).get(`/v1/orders/${o.id}`).set('Authorization', `Bearer ${dispTok}`);
    expect(res.status).toBe(200);
    expect(Object.keys(res.body)).toEqual(['order']);
    expect(res.body).not.toHaveProperty('notes');
    expect(res.body).not.toHaveProperty('evidence');
    expect(res.body).not.toHaveProperty('last_rejection_reason');
  });

  it('401: sin token → ErrorResponse { code, message } + x-correlation-id (nunca 403)', async () => {
    const res = await request(app).get(`/v1/orders/${NONEXISTENT}`);
    expect(res.status).toBe(401);
    expect(res.body.code).toBeTruthy();
    expect(res.body.message).toBeTruthy();
    expect(res.headers['x-correlation-id']).toBeTruthy();
  });

  it('404: inexistente/malformado → ErrorResponse genérico (nunca 403)', async () => {
    const nx = await request(app).get(`/v1/orders/${NONEXISTENT}`).set('Authorization', `Bearer ${techTok}`);
    expect(nx.status).toBe(404);
    expect(nx.body.code).toBe('ORDER_NOT_FOUND');
    const mal = await request(app).get('/v1/orders/not-a-uuid').set('Authorization', `Bearer ${techTok}`);
    expect(mal.status).toBe(404);
    expect(mal.body.code).toBe('ORDER_NOT_FOUND');
  });

  it('503: BD no disponible al leer → ErrorResponse SERVICE_UNAVAILABLE', async () => {
    const { app: app503, prisma: p503 } = makeTestAppWithOrderDetail({
      reader: {
        read: async () => {
          throw domainError('SERVICE_UNAVAILABLE', 'El servicio no está disponible.');
        },
      },
    });
    const tok = (
      await request(app503).post('/v1/auth/login').send({ identifier: SEED_USERS.technician.email, password: SEED_PASSWORD })
    ).body.access_token as string;
    const res = await request(app503).get(`/v1/orders/${NONEXISTENT}`).set('Authorization', `Bearer ${tok}`);
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('SERVICE_UNAVAILABLE');
    await p503.$disconnect();
  });

  it('500: error inesperado del reader → ErrorResponse INTERNAL genérico', async () => {
    const { app: app500, prisma: p500 } = makeTestAppWithOrderDetail({
      reader: {
        read: async () => {
          throw new Error('boom inesperado');
        },
      },
    });
    const tok = (
      await request(app500).post('/v1/auth/login').send({ identifier: SEED_USERS.technician.email, password: SEED_PASSWORD })
    ).body.access_token as string;
    const res = await request(app500).get(`/v1/orders/${NONEXISTENT}`).set('Authorization', `Bearer ${tok}`);
    expect(res.status).toBe(500);
    expect(res.body.code).toBe('INTERNAL');
    await p500.$disconnect();
  });
});
