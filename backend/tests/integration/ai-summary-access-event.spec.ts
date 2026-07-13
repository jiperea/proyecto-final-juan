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
// Rate-limit alto en la app compartida (no colisiona con las múltiples peticiones de los tests); el caso
// 429 usa su PROPIA app con max=2.
const { app, prisma } = makeTestAppWithSummary(
  { provider, accessLog: { record: (e) => events.push(e) } },
  { aiRateMax: 50, aiRateWindowMs: 600_000 },
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

  it('orderId malformado (texto arbitrario del actor) NO se registra crudo en el evento → `<malformed>` (0 PII)', async () => {
    events.length = 0;
    // Un actor podría inyectar PII en el path (email/DNI). El evento PII-free NO debe llevarlo crudo.
    await request(app).post('/v1/orders/juan.perez%40acme.com/ai-summary').set('Authorization', `Bearer ${supTok}`);
    const ev = events.at(-1);
    expect(ev?.outcome).toBe('denied');
    expect(ev?.orderId).toBe('<malformed>');
    expect(JSON.stringify(ev)).not.toContain('acme.com');
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

  it('outcome de negocio propagado al evento: fallback_insufficient (contenido bajo umbral) y blocked_pii (PII en salida)', async () => {
    // fallback_insufficient: orden por debajo del umbral FR-015 (notas cortas) → provider no se llama.
    events.length = 0;
    const poor = await makePendingReviewOrder(prisma, { assignedTo: SEED_USERS.technician.id, withEvidence: true, notes: 'corta' });
    await post(poor.id, supTok);
    expect(events.at(-1)?.outcome).toBe('fallback_insufficient');

    // blocked_pii: provider (mock de este bloque) que devuelve PII estructurada en la salida.
    events.length = 0;
    const piiApp = makeTestAppWithSummary(
      {
        provider: { generate: () => Promise.resolve(ok({ summary: 'Contacto DNI 12345678Z.', sufficient: true })) },
        accessLog: { record: (e) => events.push(e) },
      },
    );
    const piiTok = (await request(piiApp.app).post('/v1/auth/login').send({ identifier: SEED_USERS.supervisor.email, password: SEED_PASSWORD })).body.access_token as string;
    const rich = await makePendingReviewOrder(piiApp.prisma, {
      assignedTo: SEED_USERS.technician.id,
      withEvidence: true,
      notes: 'Incidencia con detalle suficiente para invocar al proveedor y producir salida con PII.',
    });
    await request(piiApp.app).post(`/v1/orders/${rich.id}/ai-summary`).set('Authorization', `Bearer ${piiTok}`);
    await piiApp.prisma.$disconnect();
    expect(events.at(-1)?.outcome).toBe('blocked_pii');
  });

  it('K5 combinado 429-vs-404: supervisor rate-limited sobre orden NO visible → 429 (precede al 404) con denied/rate_limited_429', async () => {
    // App DEDICADA con max=2 (aislada del presupuesto de rate-limit de los demás tests).
    const rlEvents: AccessEvent[] = [];
    const rl = makeTestAppWithSummary(
      { provider, accessLog: { record: (e) => rlEvents.push(e) } },
      { aiRateMax: 2, aiRateWindowMs: 600_000 },
    );
    const tok = (await request(rl.app).post('/v1/auth/login').send({ identifier: SEED_USERS.supervisor.email, password: SEED_PASSWORD })).body.access_token as string;
    const call = () => request(rl.app).post(`/v1/orders/${NONEXISTENT}/ai-summary`).set('Authorization', `Bearer ${tok}`);
    await call(); // #1
    await call(); // #2 (consume la ventana)
    rlEvents.length = 0;
    const limited = await call(); // #3: no visible Y rate-limited → 429 gana (precede al 404)
    await rl.prisma.$disconnect();
    expect(limited.status).toBe(429);
    expect(rlEvents.at(-1)).toMatchObject({ outcome: 'denied', deniedReason: 'rate_limited_429' });
  });
});
