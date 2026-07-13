// T021 (008/#010, US2) — integración por rol (escenarios 5–7, 10, 13).
import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Role } from '../../src/domain/model';
import type { AccessClaims, TokenIssuerPort } from '../../src/domain/ports/services';
import { buildApp } from '../../src/handlers/app';
import { buildContainer } from '../../src/infra/container';
import { SEED_PASSWORD, SEED_USERS } from '../../prisma/seed-data';
import { makeTestApp, testConfig } from '../helpers/test-app';
import { makeOrder, makePendingReviewOrder, makeRejectedOrder } from '../helpers/transition';

const { app, prisma } = makeTestApp();
afterAll(async () => {
  await prisma.$disconnect();
});

async function token(email: string): Promise<string> {
  const r = await request(app).post('/v1/auth/login').send({ identifier: email, password: SEED_PASSWORD });
  return r.body.access_token as string;
}
function get(id: string, tok: string, appOverride = app): request.Test {
  return request(appOverride).get(`/v1/orders/${id}`).set('Authorization', `Bearer ${tok}`);
}

describe('getOrderDetail — supervisor/dispatcher (US2)', () => {
  it('esc.5: supervisor + orden pending_review → 200 con notes+evidence, SIN motivo', async () => {
    const o = await makePendingReviewOrder(prisma, {
      assignedTo: SEED_USERS.technician.id,
      withEvidence: true,
      evidenceCount: 2,
      notes: 'Trabajo terminado.',
    });
    const res = await get(o.id, await token(SEED_USERS.supervisor.email));
    expect(res.status).toBe(200);
    expect(res.body.notes).toBe('Trabajo terminado.');
    expect(res.body.evidence.count).toBe(2);
    expect(res.body).not.toHaveProperty('last_rejection_reason');
  });

  it('esc.6: dispatcher + orden assigned/in_progress → 200 SIN notes/evidence/motivo (mínimo privilegio)', async () => {
    const o = await makeOrder(prisma, { status: 'in_progress', assignedTo: SEED_USERS.technician.id });
    const res = await get(o.id, await token(SEED_USERS.dispatcher.email));
    expect(res.status).toBe(200);
    expect(Object.keys(res.body)).toEqual(['order']);
  });

  it('esc.7: cualquier rol + orden draft o closed → 404', async () => {
    const supTok = await token(SEED_USERS.supervisor.email);
    const dispTok = await token(SEED_USERS.dispatcher.email);
    const draft = await makeOrder(prisma, { status: 'draft', assignedTo: SEED_USERS.technician.id });
    const closed = await makeOrder(prisma, { status: 'closed', assignedTo: SEED_USERS.technician.id });
    expect((await get(draft.id, dispTok)).status).toBe(404);
    expect((await get(closed.id, supTok)).status).toBe(404);
    expect((await get(closed.id, dispTok)).status).toBe(404);
  });

  it('esc.13: reasignación T2→T1 — nuevo dueño ve ciclo anterior + motivo; ex-dueño → 404', async () => {
    const o = await makeRejectedOrder(prisma, {
      assignedTo: SEED_USERS.technician2.id,
      reason: 'Corrige el conexionado.',
      notes: 'Notas del técnico anterior.',
    });
    await prisma.order.update({ where: { id: o.id }, data: { assignedTo: SEED_USERS.technician.id } });

    const newOwner = await get(o.id, await token(SEED_USERS.technician.email));
    expect(newOwner.status).toBe(200);
    expect(newOwner.body.last_rejection_reason).toBe('Corrige el conexionado.');
    expect(newOwner.body.notes).toBe('Notas del técnico anterior.');

    const exOwner = await get(o.id, await token(SEED_USERS.technician2.email));
    expect(exOwner.status).toBe(404);
    expect(exOwner.body.code).toBe('ORDER_NOT_FOUND');
  });

  it('esc.10: rol no reconocido (claim corrupto) autenticado → 404 (alcance vacío, fail-secure)', async () => {
    // 001 (inamovible) rechaza roles desconocidos en verifyAccess (→401), así que para ejercitar la rama de
    // VISIBILIDAD fail-secure (FR-004) se inyecta un TokenIssuer que acepta un rol raro (sin tocar 001).
    const { deps, prisma: p2 } = buildContainer(testConfig());
    const TOKEN = 'ROLE_RARO';
    const fakeTokens: TokenIssuerPort = {
      issue: deps.tokens.issue.bind(deps.tokens),
      hashRefresh: deps.tokens.hashRefresh.bind(deps.tokens),
      verifyAccess: (t): AccessClaims | null =>
        t === TOKEN
          ? { sub: SEED_USERS.technician.id, sid: 'sid-raro', role: 'auditor' as Role }
          : deps.tokens.verifyAccess(t),
    };
    const app2 = buildApp({
      ...deps,
      tokens: fakeTokens,
      sessionState: { isRevoked: async () => false, isUserActive: async () => true, revokeSession: () => undefined },
    });
    const o = await makePendingReviewOrder(p2, { assignedTo: SEED_USERS.technician.id, withEvidence: true });
    const res = await get(o.id, TOKEN, app2);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('ORDER_NOT_FOUND');
    await p2.$disconnect();
  });
});
