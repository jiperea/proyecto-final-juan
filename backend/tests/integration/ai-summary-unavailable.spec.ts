// 018 (FR-001/FR-002b/FR-005 · SC-001/SC-002/SC-003/SC-007) — proveedor IA no operable en este entorno.
// Con material suficiente → 501 AI_UNAVAILABLE (cuerpo genérico) + outcome 'unavailable'. La autz/estado
// van ANTES: un no-supervisor recibe 403, no 501, aun con el proveedor no operable.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { err, domainError } from '../../src/domain/result';
import type { AccessEvent } from '../../src/domain/ai/summary-ports';
import { SEED_PASSWORD, SEED_USERS } from '../../prisma/seed-data';
import { makeTestAppWithSummary } from '../helpers/test-app';
import { makePendingReviewOrder } from '../helpers/transition';

const events: AccessEvent[] = [];
// Mensaje genérico del adaptador (FR-005): sin nombre de binario/ruta/versión/traza.
const GENERIC = 'El resumen por IA no está disponible en este entorno.';
const unavailable = { generate: () => Promise.resolve(err(domainError('AI_UNAVAILABLE', GENERIC))) };
const { app, prisma } = makeTestAppWithSummary({
  provider: unavailable,
  accessLog: { record: (e) => events.push(e) },
});
afterAll(async () => {
  await prisma.$disconnect();
});

let supTok = '';
let techTok = '';
let orderId = '';
beforeAll(async () => {
  supTok = (
    await request(app).post('/v1/auth/login').send({ identifier: SEED_USERS.supervisor.email, password: SEED_PASSWORD })
  ).body.access_token as string;
  techTok = (
    await request(app).post('/v1/auth/login').send({ identifier: SEED_USERS.technician.email, password: SEED_PASSWORD })
  ).body.access_token as string;
  orderId = (
    await makePendingReviewOrder(prisma, {
      assignedTo: SEED_USERS.technician.id,
      withEvidence: true,
      notes: 'Incidencia con material suficiente para llegar a invocar al proveedor (no operable → 501).',
    })
  ).id;
});

describe('summarizeOrderIncident — proveedor no operable en este entorno (018)', () => {
  it('supervisor + material suficiente → 501 AI_UNAVAILABLE, cuerpo genérico, outcome unavailable', async () => {
    events.length = 0;
    const res = await request(app).post(`/v1/orders/${orderId}/ai-summary`).set('Authorization', `Bearer ${supTok}`);
    expect(res.status).toBe(501);
    expect(res.body.code).toBe('AI_UNAVAILABLE');
    // SC-002: mensaje genérico sin fugas de infraestructura.
    expect(res.body.message).toBe(GENERIC);
    expect(JSON.stringify(res.body)).not.toMatch(/claude|ENOENT|execFile|\/usr\/|node_modules|v\d+\.\d+/i);
    // SC-007: evento distinguible 'unavailable' (no 'error'), sin PII (solo actor/orderId/outcome).
    const ev = events.find((e) => e.outcome === 'unavailable');
    expect(ev).toBeDefined();
    expect(JSON.stringify(ev)).not.toContain('Incidencia con material');
  });

  it('SC-003 · precedencia: un technician recibe 403, NUNCA 501, aun con proveedor no operable', async () => {
    const res = await request(app).post(`/v1/orders/${orderId}/ai-summary`).set('Authorization', `Bearer ${techTok}`);
    expect(res.status).toBe(403);
    expect(res.body.code).not.toBe('AI_UNAVAILABLE');
  });

  it('SC-003 · precedencia: sin autenticar → 401, no 501', async () => {
    const res = await request(app).post(`/v1/orders/${orderId}/ai-summary`);
    expect(res.status).toBe(401);
    expect(res.body.code).not.toBe('AI_UNAVAILABLE');
  });

  it('SC-003 · precedencia: supervisor sobre orden NO visible → 404, no 501 (proveedor no operable)', async () => {
    const missing = '018f2000-0000-7000-8000-0000000000ff'; // UUID válido, orden inexistente/no visible
    const res = await request(app).post(`/v1/orders/${missing}/ai-summary`).set('Authorization', `Bearer ${supTok}`);
    expect(res.status).toBe(404);
    expect(res.body.code).not.toBe('AI_UNAVAILABLE');
  });
});
