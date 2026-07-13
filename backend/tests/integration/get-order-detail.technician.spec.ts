// T011 (008/#010, US1) — integración BD real, camino del technician (escenarios 1–4, 9, 11).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
function get(id: string, tok: string): request.Test {
  return request(app).get(`/v1/orders/${id}`).set('Authorization', `Bearer ${tok}`);
}

let tok = '';
beforeAll(async () => {
  tok = await token(SEED_USERS.technician.email);
});

const NONEXISTENT = '00000000-0000-7000-8000-000000000000';

describe('getOrderDetail — technician (US1)', () => {
  it('esc.1: orden propia rechazada SIN atender → 200 con order+notes+evidence+motivo', async () => {
    const o = await makeRejectedOrder(prisma, {
      assignedTo: SEED_USERS.technician.id,
      reason: 'Faltan fotos del cuadro.',
      notes: 'Cambié el fusible.',
      contentTypes: ['image/jpeg', 'image/png'],
    });
    const res = await get(o.id, tok);
    expect(res.status).toBe(200);
    expect(res.body.order.id).toBe(o.id);
    expect(res.body.order.status).toBe('in_progress');
    expect(res.body.order.assigned_to).toBe(SEED_USERS.technician.id);
    expect(res.body.notes).toBe('Cambié el fusible.');
    expect(res.body.evidence).toEqual({ count: 2, content_types: ['image/jpeg', 'image/png'] });
    expect(res.body.last_rejection_reason).toBe('Faltan fotos del cuadro.');
  });

  it('esc.2: orden propia ya reenviada (pending_review) → 200 SIN last_rejection_reason', async () => {
    const o = await makeRejectedOrder(prisma, { assignedTo: SEED_USERS.technician.id, resubmit: true });
    const res = await get(o.id, tok);
    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe('pending_review');
    expect(res.body).not.toHaveProperty('last_rejection_reason');
    expect(res.body.notes).toBe('Corregido y reenviado.');
  });

  it('esc.3: orden propia nunca rechazada, sin ciclo (assigned) → evidence vacío, notes/motivo omitidos', async () => {
    const o = await makeOrder(prisma, { status: 'assigned', assignedTo: SEED_USERS.technician.id });
    const res = await get(o.id, tok);
    expect(res.status).toBe(200);
    expect(res.body.evidence).toEqual({ count: 0, content_types: [] });
    expect(res.body).not.toHaveProperty('notes');
    expect(res.body).not.toHaveProperty('last_rejection_reason');
  });

  it('esc.4: orden ajena (de otro técnico) → 404 genérico', async () => {
    const o = await makeRejectedOrder(prisma, { assignedTo: SEED_USERS.technician2.id });
    const res = await get(o.id, tok);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('ORDER_NOT_FOUND');
  });

  it('esc.9: orderId malformado (autenticado) → 404 (no 400)', async () => {
    const res = await get('not-a-uuid', tok);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('ORDER_NOT_FOUND');
  });

  it('esc.11: orden con 2+ ciclos rechazo-reenvío → motivo del ÚLTIMO rechazo', async () => {
    const o = await makeRejectedOrder(prisma, {
      assignedTo: SEED_USERS.technician.id,
      reason: 'Último rechazo vigente.',
      rejects: 3,
    });
    const res = await get(o.id, tok);
    expect(res.status).toBe(200);
    expect(res.body.last_rejection_reason).toBe('Último rechazo vigente.');
  });

  it('inexistente → 404 genérico (mismo cuerpo que ajena/malformado)', async () => {
    const res = await get(NONEXISTENT, tok);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('ORDER_NOT_FOUND');
  });
});
