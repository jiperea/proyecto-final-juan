// T022 (007, US3, FR-013/SC-007) — evento de acceso en CADA salida, desglosado por guard (K5) con
// deniedReason (S-001), caso combinado 429-vs-404, y 0 PII en el evento.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { ok } from '../../src/domain/result';
import type { AccessEvent } from '../../src/domain/ai/summary-ports';
import { SEED_PASSWORD, SEED_USERS } from '../../prisma/seed-data';
import { makeTestAppWithSummary } from '../helpers/test-app';
import { makePendingReviewOrder } from '../helpers/transition';

const events: AccessEvent[] = [];
const provider = { generate: () => Promise.resolve(ok({ summary: 'Resumen fiel del incidente.', sufficient: true })) };
// max=2 para forzar el 429 con pocas peticiones en la parte de rate-limit.
const { app, prisma } = makeTestAppWithSummary(
  { provider, accessLog: { record: (e) => events.push(e) } },
  { aiRateMax: 2, aiRateWindowMs: 600_000 },
);
afterAll(async () => {
  await prisma.$disconnect();
});

async function token(email: string): Promise<string> {
  const r = await request(app).post('/v1/auth/login').send({ identifier: email, password: SEED_PASSWORD });
  return r.body.access_token as string;
}
let supTok = '';
let techTok = '';
beforeAll(async () => {
  supTok = await token(SEED_USERS.supervisor.email);
  techTok = await token(SEED_USERS.technician.email);
});
const NONEXISTENT = '00000000-0000-7000-8000-000000000000';
const post = (id: string, tok: string) => request(app).post(`/v1/orders/${id}/ai-summary`).set('Authorization', `Bearer ${tok}`);

describe('summarizeOrderIncident — evento de acceso (US3)', () => {
  it('403 (rol) emite denied/role_403', async () => {
    events.length = 0;
    await post(NONEXISTENT, techTok);
    expect(events.at(-1)).toMatchObject({ outcome: 'denied', deniedReason: 'role_403' });
  });

  it('404 (no visible) emite denied/not_visible_404', async () => {
    events.length = 0;
    await post(NONEXISTENT, supTok);
    expect(events.at(-1)).toMatchObject({ outcome: 'denied', deniedReason: 'not_visible_404' });
  });

  it('success emite outcome=success con 0 PII (solo ids/enums)', async () => {
    events.length = 0;
    const o = await makePendingReviewOrder(prisma, {
      assignedTo: SEED_USERS.technician.id,
      withEvidence: true,
      notes: 'Incidencia con detalle suficiente para un resumen fiel del incidente registrado hoy.',
    });
    await post(o.id, supTok);
    const ev = events.at(-1);
    expect(ev?.outcome).toBe('success');
    // 0 PII: el evento solo lleva actor/orderId/outcome (+deniedReason). Sin notas/summary/object_ref.
    expect(Object.keys(ev ?? {}).sort()).toEqual(['actor', 'orderId', 'outcome']);
  });

  it('K5 combinado 429-vs-404: supervisor rate-limited sobre orden NO visible → 429 (precede al 404) con denied/rate_limited_429', async () => {
    // Consumir la ventana (max=2) sobre una orden cualquiera visible.
    const o = await makePendingReviewOrder(prisma, {
      assignedTo: SEED_USERS.technician.id,
      withEvidence: true,
      notes: 'Incidencia con detalle suficiente para consumir la ventana de rate-limit del usuario.',
    });
    await post(o.id, supTok);
    await post(o.id, supTok);
    events.length = 0;
    const limited = await post(NONEXISTENT, supTok); // no visible Y rate-limited → 429 gana
    expect(limited.status).toBe(429);
    expect(events.at(-1)).toMatchObject({ outcome: 'denied', deniedReason: 'rate_limited_429' });
  });
});
