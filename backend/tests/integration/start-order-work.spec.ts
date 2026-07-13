import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import request from 'supertest';
import { SEED_PASSWORD, SEED_USERS } from '../../prisma/seed-data';
import { makeTestApp } from '../helpers/test-app';
import { makeOrder } from '../helpers/transition';

// T012 (005) — integración de startOrderWork sobre Postgres real. Precedencia 401→403→404→422; pertenencia
// antes que estado (orden ajena en estado no operable → 404, NUNCA 422); orderId malformado → 404.
const { app, prisma } = makeTestApp();
afterAll(async () => {
  await prisma.$disconnect();
});

const T = SEED_USERS.technician; // dueño
const T2 = SEED_USERS.technician2; // otro técnico

async function token(email: string): Promise<string> {
  const r = await request(app).post('/v1/auth/login').send({ identifier: email, password: SEED_PASSWORD });
  return r.body.access_token as string;
}
let techTok = '';
let dispTok = '';
beforeAll(async () => {
  techTok = await token(T.email);
  dispTok = await token(SEED_USERS.dispatcher.email);
});

function start(orderId: string, tok: string | null) {
  const req = request(app).post(`/v1/orders/${orderId}/start`);
  return tok ? req.set('Authorization', `Bearer ${tok}`) : req;
}

describe('startOrderWork — integración (005, US1)', () => {
  it('orden assigned PROPIA → 200, in_progress, version+1, 1 auditoría transition (reason NULL)', async () => {
    const o = await makeOrder(prisma, { status: 'assigned', assignedTo: T.id, version: 3 });
    const res = await start(o.id, techTok);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('in_progress');
    expect(res.body.version).toBe(4);

    const after = await prisma.order.findUniqueOrThrow({ where: { id: o.id } });
    expect(after.status).toBe('in_progress');
    expect(after.version).toBe(4);

    const audits = await prisma.orderAudit.findMany({ where: { orderId: o.id } });
    expect(audits.length).toBe(1);
    expect(audits[0]?.eventType).toBe('transition');
    expect(audits[0]?.fromStatus).toBe('assigned');
    expect(audits[0]?.toStatus).toBe('in_progress');
    expect(audits[0]?.actorId).toBe(T.id);
    expect(audits[0]?.reason).toBeNull();
  });

  it('orden AJENA en estado no operable (closed, de T2) → 404 genérico, NUNCA 422', async () => {
    const o = await makeOrder(prisma, { status: 'closed', assignedTo: T2.id, version: 5 });
    const res = await start(o.id, techTok);
    expect(res.status).toBe(404);
    expect(res.body.code).not.toBe('INVALID_TRANSITION');
    // sin efecto
    const after = await prisma.order.findUniqueOrThrow({ where: { id: o.id } });
    expect(after.status).toBe('closed');
    expect(after.version).toBe(5);
    expect(await prisma.orderAudit.count({ where: { orderId: o.id } })).toBe(0);
  });

  it('orden AJENA en estado assigned (de T2) → 404 (pertenencia antes que estado)', async () => {
    const o = await makeOrder(prisma, { status: 'assigned', assignedTo: T2.id });
    const res = await start(o.id, techTok);
    expect(res.status).toBe(404);
  });

  it('orden PROPIA ya in_progress → 422 INVALID_TRANSITION, sin efecto', async () => {
    const o = await makeOrder(prisma, { status: 'in_progress', assignedTo: T.id, version: 2 });
    const res = await start(o.id, techTok);
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('INVALID_TRANSITION');
    const after = await prisma.order.findUniqueOrThrow({ where: { id: o.id } });
    expect(after.version).toBe(2);
  });

  it('orden PROPIA closed → 422 INVALID_TRANSITION', async () => {
    const o = await makeOrder(prisma, { status: 'closed', assignedTo: T.id });
    const res = await start(o.id, techTok);
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('INVALID_TRANSITION');
  });

  it('orderId malformado (no-uuid) → 404 (no 400/500)', async () => {
    const res = await start('no-es-uuid', techTok);
    expect(res.status).toBe(404);
  });

  it('orden inexistente → 404', async () => {
    const res = await start('018f2000-0000-7000-8000-0000000000ee', techTok);
    expect(res.status).toBe(404);
  });

  it('dispatcher (rol ≠ technician) → 403', async () => {
    const o = await makeOrder(prisma, { status: 'assigned', assignedTo: T.id });
    const res = await start(o.id, dispTok);
    expect(res.status).toBe(403);
  });

  it('sin token → 401', async () => {
    const res = await start('018f2000-0000-7000-8000-0000000000ee', null);
    expect(res.status).toBe(401);
  });
});
