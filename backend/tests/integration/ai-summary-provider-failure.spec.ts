// T021 (007, US3, FR-010/SC-006 + M1) — timeout/fallo de proceso del proveedor → 503, y evento outcome=error.
// La salida bien terminada pero no conforme es 200 fallback (cubierto en T017), NO aquí.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { err, domainError } from '../../src/domain/result';
import type { AccessEvent } from '../../src/domain/ai/summary-ports';
import { SEED_PASSWORD, SEED_USERS } from '../../prisma/seed-data';
import { makeTestAppWithSummary } from '../helpers/test-app';
import { makePendingReviewOrder } from '../helpers/transition';

const events: AccessEvent[] = [];
// Provider que simula timeout/fallo de proceso → err(SERVICE_UNAVAILABLE) con el MISMO mensaje genérico
// que produce el adaptador real (el adaptador nunca pone detalle del proceso en el error; unit test aparte).
const GENERIC = 'El asistente de IA no está disponible.';
const failing = { generate: () => Promise.resolve(err(domainError('SERVICE_UNAVAILABLE', GENERIC))) };
const { app, prisma } = makeTestAppWithSummary({
  provider: failing,
  accessLog: { record: (e) => events.push(e) },
});
afterAll(async () => {
  await prisma.$disconnect();
});

let supTok = '';
let orderId = '';
beforeAll(async () => {
  const r = await request(app).post('/v1/auth/login').send({ identifier: SEED_USERS.supervisor.email, password: SEED_PASSWORD });
  supTok = r.body.access_token as string;
  const o = await makePendingReviewOrder(prisma, {
    assignedTo: SEED_USERS.technician.id,
    withEvidence: true,
    notes: 'Incidencia con contenido suficiente para llegar a invocar al proveedor y provocar el 503.',
  });
  orderId = o.id;
});

describe('summarizeOrderIncident — fallo del proveedor (US3)', () => {
  it('timeout/fallo → 503 SERVICE_UNAVAILABLE (cuerpo genérico) + evento outcome=error', async () => {
    events.length = 0;
    const res = await request(app).post(`/v1/orders/${orderId}/ai-summary`).set('Authorization', `Bearer ${supTok}`);
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('SERVICE_UNAVAILABLE');
    expect(res.body.message).toBe(GENERIC); // cuerpo genérico (el detalle del proveedor no llega al cliente)
    expect(events.some((e) => e.outcome === 'error')).toBe(true);
  });
});
