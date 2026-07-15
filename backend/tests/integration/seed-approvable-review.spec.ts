// 019 (SC-001/SC-002 · FR-001/FR-002/FR-003) — el seed produce una orden APROBABLE de origen.
// Verifica, contra el dato semilla real de db-test: (a) la ancla en pending_review, de technician1, version=1;
// (b) EXACTAMENTE 1 evidencia + 1 notas + 1 audit de transición in_progress→pending_review, enlazadas;
// (c) el guard de re-seed aborta con mensaje accionable (H-001); (d) el supervisor APRUEBA la ancla → 200 closed.
import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { SEED_ORDERS, SEED_PASSWORD, SEED_USERS } from '../../prisma/seed-data';
import { ensureSeedableOrThrow, RESEED_HINT } from '../../prisma/seed';
import { makeTestApp } from '../helpers/test-app';

const ANCHOR = SEED_ORDERS.approvableReview;
const { app, prisma } = makeTestApp();
afterAll(async () => {
  await prisma.$disconnect();
});

describe('019 · seed de orden aprobable', () => {
  it('FR-001: ancla en pending_review, technician1, version=1 con 1 evidencia + 1 notas + 1 audit enlazados', async () => {
    const order = await prisma.order.findUnique({ where: { id: ANCHOR } });
    expect(order?.status).toBe('pending_review');
    expect(order?.assignedTo).toBe(SEED_USERS.technician.id);
    expect(order?.version).toBe(1); // H-002: coherente con 1 transición auditada

    const audits = await prisma.orderAudit.findMany({ where: { orderId: ANCHOR } });
    expect(audits).toHaveLength(1);
    expect(audits[0]!.fromStatus).toBe('in_progress');
    expect(audits[0]!.toStatus).toBe('pending_review');

    const evidence = await prisma.orderEvidence.findMany({ where: { orderId: ANCHOR } });
    const notes = await prisma.orderExecutionNotes.findMany({ where: { orderId: ANCHOR } });
    expect(evidence).toHaveLength(1); // exactamente 1 (no ≥1)
    expect(notes).toHaveLength(1);
    expect(evidence[0]!.auditId).toBe(audits[0]!.id); // enlazadas al mismo audit
    expect(notes[0]!.auditId).toBe(audits[0]!.id);
  });

  it('FR-003/H-001: el guard de re-seed aborta con mensaje accionable si la BD no está vacía', async () => {
    await expect(ensureSeedableOrThrow(prisma)).rejects.toThrow(RESEED_HINT);
  });

  it('FR-002/SC-001: el supervisor aprueba la ancla → 200 closed (sin 409 EVIDENCE_MISSING)', async () => {
    const login = await request(app)
      .post('/v1/auth/login')
      .send({ identifier: SEED_USERS.supervisor.email, password: SEED_PASSWORD });
    const tok = login.body.access_token as string;
    const res = await request(app).post(`/v1/orders/${ANCHOR}/review`).set('Authorization', `Bearer ${tok}`).send({ decision: 'approve' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('closed');
  });
});
