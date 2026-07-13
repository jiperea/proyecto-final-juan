// (007, US3, ALTA G3) — fallo al LEER la fuente: BD no disponible → 503 (convención 001/006, declarado en
// contrato); error inesperado → 500 (INTERNAL, declarado). En ambos, evento outcome=error, cuerpo genérico.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { domainError } from '../../src/domain/result';
import type { AccessEvent } from '../../src/domain/ai/summary-ports';
import { SEED_PASSWORD, SEED_USERS } from '../../prisma/seed-data';
import { makeTestAppWithSummary } from '../helpers/test-app';

const events: AccessEvent[] = [];
// Fuente que falla según un modo mutable.
let mode: 'db_unavailable' | 'unexpected' = 'db_unavailable';
const source = {
  findSummarizable: () => {
    if (mode === 'db_unavailable') {
      return Promise.reject(domainError('SERVICE_UNAVAILABLE', 'El servicio no está disponible.'));
    }
    return Promise.reject(new Error('boom-postgres-detail-should-not-leak'));
  },
};
const { app, prisma } = makeTestAppWithSummary({ source, accessLog: { record: (e) => events.push(e) } });
afterAll(async () => {
  await prisma.$disconnect();
});

let supTok = '';
beforeAll(async () => {
  const r = await request(app).post('/v1/auth/login').send({ identifier: SEED_USERS.supervisor.email, password: SEED_PASSWORD });
  supTok = r.body.access_token as string;
});
const VALID = '00000000-0000-7000-8000-000000000000';
const post = () => request(app).post(`/v1/orders/${VALID}/ai-summary`).set('Authorization', `Bearer ${supTok}`);

describe('summarizeOrderIncident — fallo al leer la fuente (US3)', () => {
  it('BD no disponible (DomainError SERVICE_UNAVAILABLE propagado) → 503 + evento error', async () => {
    mode = 'db_unavailable';
    events.length = 0;
    const res = await post();
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('SERVICE_UNAVAILABLE');
    expect(events.some((e) => e.outcome === 'error')).toBe(true);
  });

  it('error inesperado → 500 INTERNAL genérico (no filtra Postgres) + evento error', async () => {
    mode = 'unexpected';
    events.length = 0;
    const res = await post();
    expect(res.status).toBe(500);
    expect(res.body.code).toBe('INTERNAL');
    expect(JSON.stringify(res.body)).not.toContain('boom-postgres-detail');
    expect(events.some((e) => e.outcome === 'error')).toBe(true);
  });
});
