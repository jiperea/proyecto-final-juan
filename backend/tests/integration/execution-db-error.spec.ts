import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/handlers/app';
import { buildContainer } from '../../src/infra/container';
import { testConfig } from '../helpers/test-app';
import { SEED_PASSWORD, SEED_USERS } from '../../prisma/seed-data';
import { makeOrder } from '../helpers/transition';

// T025 (005, SC-008) — saneo de errores de BD: un error de BD en start/execution → 500 genérico, sin filtrar
// SQLSTATE/constraint/columna/query de Postgres.
const { deps, prisma } = buildContainer(testConfig());

// Simula un error de BD crudo (con detalle de Postgres) desde los puertos → debe quedar saneado a 500.
const PG_LEAK = 'error: duplicate key value violates unique constraint "order_evidence_pkey" SQLSTATE 23505';
const app = buildApp({
  ...deps,
  startDeps: {
    start: {
      startWork: async (): Promise<never> => {
        throw new Error(PG_LEAK);
      },
    },
  },
  executionDeps: {
    execution: {
      submitExecution: async (): Promise<never> => {
        throw new Error(PG_LEAK);
      },
    },
  },
});

afterAll(async () => {
  await prisma.$disconnect();
});

let techTok = '';
beforeAll(async () => {
  const r = await request(app)
    .post('/v1/auth/login')
    .send({ identifier: SEED_USERS.technician.email, password: SEED_PASSWORD });
  techTok = r.body.access_token;
});

function assertSanitized(body: unknown): void {
  const s = JSON.stringify(body);
  expect(s).not.toMatch(/SQLSTATE|23505|constraint|order_evidence_pkey|duplicate key|postgres/i);
}

describe('saneo de errores de BD (005, SC-008)', () => {
  it('start: error de BD → 500 genérico sin detalle de Postgres', async () => {
    const o = await makeOrder(prisma, { status: 'assigned', assignedTo: SEED_USERS.technician.id });
    const res = await request(app).post(`/v1/orders/${o.id}/start`).set('Authorization', `Bearer ${techTok}`);
    expect(res.status).toBe(500);
    assertSanitized(res.body);
  });

  it('execution: error de BD → 500 genérico sin detalle de Postgres', async () => {
    const o = await makeOrder(prisma, { status: 'in_progress', assignedTo: SEED_USERS.technician.id });
    const res = await request(app)
      .post(`/v1/orders/${o.id}/execution`)
      .set('Authorization', `Bearer ${techTok}`)
      .send({ notes: 'ok', evidence: [{ object_ref: 'r', content_type: 'image/jpeg', size_bytes: 1 }] });
    expect(res.status).toBe(500);
    assertSanitized(res.body);
  });
});
