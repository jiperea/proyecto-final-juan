// T017 (007, US2) — fallback no-inventa (integración). Provider override para cada causa.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ok, type DomainError, type Result } from '../../src/domain/result';
import type { ProviderSummary } from '../../src/domain/ai/summary-ports';
import request from 'supertest';

type ProviderResultFake = Result<ProviderSummary | null, DomainError>;
import { SEED_PASSWORD, SEED_USERS } from '../../prisma/seed-data';
import { makeTestAppWithSummary } from '../helpers/test-app';
import { makePendingReviewOrder } from '../helpers/transition';

// Provider configurable por test (mutamos `next`).
let next: ProviderResultFake = ok({ summary: 'ok', sufficient: true });
const spy = vi.fn(() => Promise.resolve(next));
const { app, prisma } = makeTestAppWithSummary({ provider: { generate: spy } });
afterAll(async () => {
  await prisma.$disconnect();
});

async function token(email: string): Promise<string> {
  const r = await request(app).post('/v1/auth/login').send({ identifier: email, password: SEED_PASSWORD });
  return r.body.access_token as string;
}
let supTok = '';
beforeAll(async () => {
  supTok = await token(SEED_USERS.supervisor.email);
});
const RICH = 'Incidencia con detalle suficiente para intentar el resumen sin relleno ni invencion alguna.';
const post = (id: string) => request(app).post(`/v1/orders/${id}/ai-summary`).set('Authorization', `Bearer ${supTok}`);
const order = (over = {}) =>
  makePendingReviewOrder(prisma, { assignedTo: SEED_USERS.technician.id, withEvidence: true, notes: RICH, ...over });

describe('summarizeOrderIncident — fallback (US2)', () => {
  it('provider sufficient:false → 200 {summary:null, sufficient:false}', async () => {
    next = ok({ summary: '', sufficient: false });
    const o = await order();
    const res = await post(o.id);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ summary: null, sufficient: false });
  });

  it('por debajo del umbral FR-015 (notas cortas) → 200 fallback SIN llamar al proveedor', async () => {
    next = ok({ summary: 'no deberia llamarse', sufficient: true });
    spy.mockClear();
    const o = await makePendingReviewOrder(prisma, { assignedTo: SEED_USERS.technician.id, withEvidence: true, notes: 'corta' });
    const res = await post(o.id);
    expect(res.status).toBe(200);
    expect(res.body.sufficient).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it('por debajo del umbral FR-015 (0 evidencia) → 200 fallback sin proveedor', async () => {
    spy.mockClear();
    const o = await makePendingReviewOrder(prisma, { assignedTo: SEED_USERS.technician.id, withEvidence: false, notes: RICH });
    const res = await post(o.id);
    expect(res.status).toBe(200);
    expect(res.body.sufficient).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it('H-003: salida no parseable como JSON (provider ok(null)) → 200 fallback, NO 503', async () => {
    next = ok(null);
    const o = await order();
    const res = await post(o.id);
    expect(res.status).toBe(200);
    expect(res.body.sufficient).toBe(false);
  });

  it('salida con PII estructurada → 200 fallback, NO devuelve el texto con PII', async () => {
    next = ok({ summary: 'Contacto DNI 12345678Z incluido.', sufficient: true });
    const o = await order();
    const res = await post(o.id);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ summary: null, sufficient: false });
  });
});
