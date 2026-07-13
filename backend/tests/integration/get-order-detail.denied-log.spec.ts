// T027 (008/#010, Polish) — observabilidad de accesos denegados (FR-009). 401 sin actor (outcome
// 401_unauth); 404 con actor (outcome 404_not_visible); recurso saneado (UUID o <malformed>, nunca crudo);
// un fallo del logger NO bloquea la respuesta. El registro DURABLE append-only es la feature #009.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { DeniedAccessEvent } from '../../src/domain/order/read-side/ports';
import { SEED_PASSWORD, SEED_USERS } from '../../prisma/seed-data';
import { makeTestAppWithOrderDetail } from '../helpers/test-app';
import { makeRejectedOrder } from '../helpers/transition';

const events: DeniedAccessEvent[] = [];
const { app, prisma } = makeTestAppWithOrderDetail({
  deniedLogger: { record: (e) => events.push(e) },
});
afterAll(async () => {
  await prisma.$disconnect();
});

async function token(email: string): Promise<string> {
  const r = await request(app).post('/v1/auth/login').send({ identifier: email, password: SEED_PASSWORD });
  return r.body.access_token as string;
}
const NONEXISTENT = '00000000-0000-7000-8000-000000000000';
let tok = '';
beforeAll(async () => {
  tok = await token(SEED_USERS.technician.email);
});

describe('getOrderDetail — denied-access log (FR-009)', () => {
  it('401 (sin token) → entrada con outcome=401_unauth y SIN actor; recurso saneado', async () => {
    events.length = 0;
    await request(app).get(`/v1/orders/${NONEXISTENT}`);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      endpoint: 'getOrderDetail',
      outcome: '401_unauth',
      recurso: NONEXISTENT,
    });
    expect(events[0]!.actor).toBeUndefined();
  });

  it('401 (sin token) con orderId malformado → recurso <malformed> (nunca crudo)', async () => {
    events.length = 0;
    await request(app).get('/v1/orders/pii-juan@example.com');
    expect(events).toHaveLength(1);
    expect(events[0]!.outcome).toBe('401_unauth');
    expect(events[0]!.recurso).toBe('<malformed>');
  });

  it('404 (autenticado) → outcome=404_not_visible e INCLUYE el actor', async () => {
    events.length = 0;
    const ajena = await makeRejectedOrder(prisma, { assignedTo: SEED_USERS.technician2.id });
    await request(app).get(`/v1/orders/${ajena.id}`).set('Authorization', `Bearer ${tok}`);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      endpoint: 'getOrderDetail',
      outcome: '404_not_visible',
      actor: SEED_USERS.technician.id,
      recurso: ajena.id,
    });
  });

  it('404 malformado (autenticado) → recurso <malformed> con actor', async () => {
    events.length = 0;
    await request(app).get('/v1/orders/not-a-uuid').set('Authorization', `Bearer ${tok}`);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ outcome: '404_not_visible', recurso: '<malformed>', actor: SEED_USERS.technician.id });
  });

  it('200 (visible) → NO emite entrada de acceso denegado', async () => {
    events.length = 0;
    const propia = await makeRejectedOrder(prisma, { assignedTo: SEED_USERS.technician.id });
    const res = await request(app).get(`/v1/orders/${propia.id}`).set('Authorization', `Bearer ${tok}`);
    expect(res.status).toBe(200);
    expect(events).toHaveLength(0);
  });

  it('un fallo del logger NO bloquea la respuesta (best-effort)', async () => {
    const { app: appKo, prisma: pKo } = makeTestAppWithOrderDetail({
      deniedLogger: {
        record: () => {
          throw new Error('logger KO');
        },
      },
    });
    const koTok = (
      await request(appKo).post('/v1/auth/login').send({ identifier: SEED_USERS.technician.email, password: SEED_PASSWORD })
    ).body.access_token as string;
    const res = await request(appKo).get(`/v1/orders/${NONEXISTENT}`).set('Authorization', `Bearer ${koTok}`);
    expect(res.status).toBe(404);
    await pKo.$disconnect();
  });
});
