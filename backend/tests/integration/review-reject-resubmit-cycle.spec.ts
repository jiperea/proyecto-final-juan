import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import request from 'supertest';
import { SEED_PASSWORD, SEED_USERS } from '../../prisma/seed-data';
import { makeTestApp, testConfig } from '../helpers/test-app';
import { makePendingReviewOrder } from '../helpers/transition';
import { stageBlob } from '../helpers/evidence-storage';
import { validJpeg } from '../helpers/image-fixtures';

// T020 (006, US2 AC3, G2/K3/H-004) — ciclo cruzado 006↔005: reject → in_progress → submitOrderExecution(005)
// reenvía evidencia → pending_review → reviewOrder approve → closed. Verifica coherencia de status/version, que
// el guard FR-013 cuenta la evidencia del reenvío, y la POSTCONDICIÓN de 005 (evidenceCount≥1 en pending_review).
// 024/FR-023: el reenvío usa un blob REAL staged (mismo baseDir/encKey del container bajo prueba).
const { app, prisma } = makeTestApp();
afterAll(async () => {
  await prisma.$disconnect();
});
const ENC_KEY = testConfig().evidenceEncKey;
const BASE_DIR = testConfig().evidenceStorageDir;
const S = SEED_USERS.supervisor;
const T = SEED_USERS.technician;

async function token(email: string): Promise<string> {
  const r = await request(app).post('/v1/auth/login').send({ identifier: email, password: SEED_PASSWORD });
  return r.body.access_token as string;
}
let supTok = '';
let techTok = '';
beforeAll(async () => {
  supTok = await token(S.email);
  techTok = await token(T.email);
});

describe('ciclo rechazo → reenvío(005) → re-revisión (006, US2 AC3)', () => {
  it('reject → 005 resubmit → approve → closed, con versiones coherentes', async () => {
    const o = await makePendingReviewOrder(prisma, { assignedTo: T.id, withEvidence: true, version: 5 });

    // 1) Supervisor rechaza → in_progress (version 6)
    const rej = await request(app)
      .post(`/v1/orders/${o.id}/review`)
      .set('Authorization', `Bearer ${supTok}`)
      .send({ decision: 'reject', reason: 'faltan fotos del panel' });
    expect(rej.status).toBe(200);
    expect(rej.body.status).toBe('in_progress');
    expect(rej.body.version).toBe(6);

    // 2) Technician reenvía la ejecución (005) → pending_review (version 7), con evidencia nueva
    const ref = await stageBlob({
      baseDir: BASE_DIR,
      encKey: ENC_KEY,
      ownerId: T.id,
      orderId: o.id,
      bytes: validJpeg(),
      contentType: 'image/jpeg',
    });
    const exec = await request(app)
      .post(`/v1/orders/${o.id}/execution`)
      .set('Authorization', `Bearer ${techTok}`)
      .send({
        notes: 'corregido: añadidas fotos del panel',
        evidence: [{ object_ref: ref, content_type: 'image/jpeg', size_bytes: 2048 }],
      });
    expect(exec.status).toBe(200);
    expect(exec.body.status).toBe('pending_review');
    expect(exec.body.version).toBe(7);

    // (H-004) POSTCONDICIÓN de 005 de la que depende el guard FR-013 de 006: pending_review con evidenceCount≥1.
    const evidenceCount = await prisma.orderEvidence.count({ where: { orderId: o.id } });
    expect(evidenceCount).toBeGreaterThanOrEqual(1);

    // 3) Supervisor aprueba → closed (version 8). El guard cuenta la evidencia del reenvío (no 409).
    const app2 = await request(app)
      .post(`/v1/orders/${o.id}/review`)
      .set('Authorization', `Bearer ${supTok}`)
      .send({ decision: 'approve' });
    expect(app2.status).toBe(200);
    expect(app2.body.status).toBe('closed');
    expect(app2.body.version).toBe(8);

    // Auditoría acumulada: rechazo (→in_progress) + registro 005 (→pending_review) + aprobación (→closed).
    const audits = await prisma.orderAudit.findMany({ where: { orderId: o.id }, orderBy: { at: 'asc' } });
    const toStatuses = audits.map((a) => a.toStatus);
    expect(toStatuses).toContain('in_progress');
    expect(toStatuses).toContain('pending_review');
    expect(toStatuses).toContain('closed');
  });
});
