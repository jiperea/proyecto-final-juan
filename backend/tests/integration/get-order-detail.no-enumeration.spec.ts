// T026 (008/#010, Polish) — no-enumeración/precedencia (FR-004, SC-003). 401 precede a 404; ramas de 404
// con MISMO código y cuerpo (inexistente/ajena/fuera-de-estado/malformado); nunca 403.
import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { SEED_PASSWORD, SEED_USERS } from '../../prisma/seed-data';
import { makeTestApp } from '../helpers/test-app';
import { makeOrder, makeRejectedOrder } from '../helpers/transition';

const { app, prisma } = makeTestApp();
afterAll(async () => {
  await prisma.$disconnect();
});

async function token(email: string): Promise<string> {
  const r = await request(app).post('/v1/auth/login').send({ identifier: email, password: SEED_PASSWORD });
  return r.body.access_token as string;
}
const NONEXISTENT = '00000000-0000-7000-8000-000000000000';

describe('getOrderDetail — no-enumeración (FR-004/SC-003)', () => {
  it('esc.8: sin token + orderId malformado → 401 (precede a visibilidad; no 400/404)', async () => {
    const res = await request(app).get('/v1/orders/not-a-uuid');
    expect(res.status).toBe(401);
  });

  it('sin token + uuid válido → 401 (precedencia 401→404)', async () => {
    const res = await request(app).get(`/v1/orders/${NONEXISTENT}`);
    expect(res.status).toBe(401);
  });

  it('todas las ramas de 404 devuelven el MISMO código y cuerpo (inexistente/ajena/fuera-de-estado/malformado)', async () => {
    const tok = await token(SEED_USERS.technician.email);
    const ajena = await makeRejectedOrder(prisma, { assignedTo: SEED_USERS.technician2.id });
    const draftPropia = await makeOrder(prisma, { status: 'draft', assignedTo: SEED_USERS.technician.id });

    const bodies = [];
    for (const id of [NONEXISTENT, ajena.id, draftPropia.id, 'not-a-uuid']) {
      const res = await request(app).get(`/v1/orders/${id}`).set('Authorization', `Bearer ${tok}`);
      expect(res.status).toBe(404);
      bodies.push(JSON.stringify(res.body));
    }
    // Cuerpo idéntico byte a byte entre todas las causas (no-enumeración).
    expect(new Set(bodies).size).toBe(1);
  });

  it('nunca responde 403 en este endpoint', async () => {
    const tok = await token(SEED_USERS.dispatcher.email);
    // dispatcher sobre una pending_review (fuera de su alcance) → 404, no 403.
    const o = await makeRejectedOrder(prisma, { assignedTo: SEED_USERS.technician.id, resubmit: true });
    const res = await request(app).get(`/v1/orders/${o.id}`).set('Authorization', `Bearer ${tok}`);
    expect(res.status).toBe(404);
    expect(res.status).not.toBe(403);
  });
});
