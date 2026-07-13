// T031 (008/#010, Polish) — SC-005 (excepción XI de mínimo privilegio). No hay vía para pedir otra
// transición/orden/registro: query params se ignoran; la respuesta nunca lleva >1 campo de auditoría
// (last_rejection_reason); una orden ajena → 404 no expone su motivo.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { SEED_PASSWORD, SEED_USERS } from '../../prisma/seed-data';
import { makeTestApp } from '../helpers/test-app';
import { makeRejectedOrder } from '../helpers/transition';

const { app, prisma } = makeTestApp();
afterAll(async () => {
  await prisma.$disconnect();
});

async function token(email: string): Promise<string> {
  const r = await request(app).post('/v1/auth/login').send({ identifier: email, password: SEED_PASSWORD });
  return r.body.access_token as string;
}
let tok = '';
beforeAll(async () => {
  tok = await token(SEED_USERS.technician.email);
});

// Campos de auditoría exponibles por el detalle. SOLO uno (last_rejection_reason) puede aparecer.
const AUDIT_FIELDS = ['last_rejection_reason', 'audit', 'audits', 'history', 'transitions', 'rejections'];

describe('getOrderDetail — mínimo privilegio XI (SC-005)', () => {
  it('query params (?auditId=/?history=) se ignoran: misma respuesta que sin ellos', async () => {
    const o = await makeRejectedOrder(prisma, { assignedTo: SEED_USERS.technician.id, reason: 'Motivo vigente.' });
    const base = await request(app).get(`/v1/orders/${o.id}`).set('Authorization', `Bearer ${tok}`);
    const forced = await request(app)
      .get(`/v1/orders/${o.id}?auditId=${SEED_USERS.technician2.id}&history=all&transition=reject`)
      .set('Authorization', `Bearer ${tok}`);
    expect(forced.status).toBe(200);
    expect(forced.body).toEqual(base.body);
  });

  it('la respuesta nunca incluye más de UN campo de auditoría (solo last_rejection_reason)', async () => {
    const o = await makeRejectedOrder(prisma, { assignedTo: SEED_USERS.technician.id, reason: 'Motivo vigente.' });
    const res = await request(app).get(`/v1/orders/${o.id}`).set('Authorization', `Bearer ${tok}`);
    const present = AUDIT_FIELDS.filter((f) => f in res.body);
    expect(present).toEqual(['last_rejection_reason']);
  });

  it('orden ajena → 404 y NO expone su motivo por ninguna vía (query incluido)', async () => {
    const ajena = await makeRejectedOrder(prisma, { assignedTo: SEED_USERS.technician2.id, reason: 'Motivo secreto ajeno.' });
    const res = await request(app).get(`/v1/orders/${ajena.id}?history=all`).set('Authorization', `Bearer ${tok}`);
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toContain('Motivo secreto ajeno.');
    expect(res.body).not.toHaveProperty('last_rejection_reason');
  });
});
