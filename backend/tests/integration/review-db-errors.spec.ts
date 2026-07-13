import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/handlers/app';
import { buildContainer } from '../../src/infra/container';
import { testConfig } from '../helpers/test-app';
import { SEED_PASSWORD, SEED_USERS } from '../../prisma/seed-data';
import { domainError, err } from '../../src/domain/result';

// T022 (006, FR-010) — un error de BD NO transitorio → 500 genérico (sin filtrar detalle de Postgres); BD no
// disponible (SERVICE_UNAVAILABLE) → 503 fail-closed.
const { deps, prisma } = buildContainer(testConfig());
const PG_LEAK = 'error: violates foreign key constraint "order_audit_actor_id_fkey" SQLSTATE 23503';

const app500 = buildApp({
  ...deps,
  reviewDeps: {
    review: async (): Promise<never> => {
      throw new Error(PG_LEAK);
    },
  } as never,
});
const app503 = buildApp({
  ...deps,
  reviewDeps: { review: { review: async () => err(domainError('SERVICE_UNAVAILABLE', 'Servicio no disponible.')) } },
});

afterAll(async () => {
  await prisma.$disconnect();
});

let supTok = '';
beforeAll(async () => {
  const r = await request(app500)
    .post('/v1/auth/login')
    .send({ identifier: SEED_USERS.supervisor.email, password: SEED_PASSWORD });
  supTok = r.body.access_token;
});

const OID = '00000000-0000-7000-8000-000000000abc';

describe('saneo de errores de BD (006, FR-010)', () => {
  it('error no transitorio → 500 genérico sin detalle de Postgres', async () => {
    const res = await request(app500)
      .post(`/v1/orders/${OID}/review`)
      .set('Authorization', `Bearer ${supTok}`)
      .send({ decision: 'approve' });
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toMatch(/SQLSTATE|23503|constraint|fkey|postgres/i);
  });

  it('BD no disponible → 503 fail-closed', async () => {
    const res = await request(app503)
      .post(`/v1/orders/${OID}/review`)
      .set('Authorization', `Bearer ${supTok}`)
      .send({ decision: 'approve' });
    expect(res.status).toBe(503);
  });
});
