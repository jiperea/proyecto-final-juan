// T018 (007, US3) — RBAC + no-enumeración + precedencia, SIN llamar al proveedor (spy 0).
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { ok } from '../../src/domain/result';
import { SEED_PASSWORD, SEED_USERS } from '../../prisma/seed-data';
import { makeTestAppWithSummary } from '../helpers/test-app';
import { makePendingReviewOrder } from '../helpers/transition';

const providerSpy = vi.fn(() => Promise.resolve(ok({ summary: 'x', sufficient: true })));
const { app, prisma } = makeTestAppWithSummary({ provider: { generate: providerSpy } });
afterAll(async () => {
  await prisma.$disconnect();
});

async function token(email: string): Promise<string> {
  const r = await request(app).post('/v1/auth/login').send({ identifier: email, password: SEED_PASSWORD });
  return r.body.access_token as string;
}
let supTok = '';
let techTok = '';
let dispTok = '';
beforeAll(async () => {
  supTok = await token(SEED_USERS.supervisor.email);
  techTok = await token(SEED_USERS.technician.email);
  dispTok = await token(SEED_USERS.dispatcher.email);
});

const NONEXISTENT = '00000000-0000-7000-8000-000000000000';
const post = (id: string, tok: string | null) => {
  const r = request(app).post(`/v1/orders/${id}/ai-summary`);
  return tok ? r.set('Authorization', `Bearer ${tok}`) : r;
};

describe('summarizeOrderIncident — authz/precedencia (US3)', () => {
  it('sin token → 401, sin llamar al proveedor', async () => {
    providerSpy.mockClear();
    expect((await post(NONEXISTENT, null)).status).toBe(401);
    expect(providerSpy).not.toHaveBeenCalled();
  });

  it('technician y dispatcher → 403 FORBIDDEN_ROLE, sin proveedor', async () => {
    providerSpy.mockClear();
    expect((await post(NONEXISTENT, techTok)).status).toBe(403);
    expect((await post(NONEXISTENT, dispTok)).status).toBe(403);
    expect(providerSpy).not.toHaveBeenCalled();
  });

  it('supervisor sobre orden inexistente/malformada/estado≠pending_review → 404 genérico, sin proveedor', async () => {
    providerSpy.mockClear();
    expect((await post(NONEXISTENT, supTok)).status).toBe(404);
    expect((await post('not-a-uuid', supTok)).status).toBe(404);
    // Orden existente pero NO en pending_review (assigned) → 404 (no visible).
    const assigned = await makePendingReviewOrder(prisma, { assignedTo: SEED_USERS.technician.id });
    await prisma.order.update({ where: { id: assigned.id }, data: { status: 'assigned' } });
    expect((await post(assigned.id, supTok)).status).toBe(404);
    expect(providerSpy).not.toHaveBeenCalled();
  });
});
