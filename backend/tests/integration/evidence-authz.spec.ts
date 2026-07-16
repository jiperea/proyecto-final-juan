import { mkdtempSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import request from 'supertest';
import { SEED_PASSWORD, SEED_USERS } from '../../prisma/seed-data';
import { makeTestApp, testConfig } from '../helpers/test-app';
import { makeOrder } from '../helpers/transition';
import { commitRealEvidence, getEvidence } from '../helpers/evidence';
import { validJpeg } from '../helpers/image-fixtures';

// T024 (024, US2, FR-003) — autz de getOrderEvidence HEREDADA EXACTA de getOrderDetail (008/#010):
// technician dueño ACTUAL o supervisor (solo sobre pending_review, su único alcance) → 200; dispatcher →
// NUNCA (mínimo privilegio, se le omite `evidence` igual que hoy en el detalle). Cubre el par rol×alcance
// completo: dueño sí / no-dueño no / supervisor dentro-de-alcance sí / supervisor fuera-de-alcance no /
// dispatcher en su propio alcance no / dispatcher fuera de alcance no.
// RED: la ruta GET /v1/orders/:orderId/evidence/:evidenceId no existe → todo cae en 404 genérico de Express,
// así que las aserciones de 200 (dueño/supervisor) fallan hoy por la razón correcta (falta el endpoint).
const storageDir = mkdtempSync(join(tmpdir(), 'fieldops-evidence-authz-'));
afterAll(async () => {
  await rm(storageDir, { recursive: true, force: true });
});

const ENC_KEY = testConfig().evidenceEncKey;
const { app, prisma } = makeTestApp({ evidenceStorageDir: storageDir });
afterAll(async () => {
  await prisma.$disconnect();
});

const T = SEED_USERS.technician;
const T2 = SEED_USERS.technician2;
const S = SEED_USERS.supervisor;
const D = SEED_USERS.dispatcher;

async function token(email: string): Promise<string> {
  const r = await request(app).post('/v1/auth/login').send({ identifier: email, password: SEED_PASSWORD });
  return r.body.access_token as string;
}
let techTok = '';
let tech2Tok = '';
let supTok = '';
let dispTok = '';
beforeAll(async () => {
  techTok = await token(T.email);
  tech2Tok = await token(T2.email);
  supTok = await token(S.email);
  dispTok = await token(D.email);
});

async function commit(orderId: string, ownerId: string, tok: string) {
  return commitRealEvidence({
    app,
    prisma,
    baseDir: storageDir,
    encKey: ENC_KEY,
    ownerId,
    orderId,
    token: tok,
    bytes: validJpeg(),
    contentType: 'image/jpeg',
  });
}

describe('getOrderEvidence — autz heredada de getOrderDetail (024, US2, FR-003)', () => {
  it('technician dueño actual (in_progress) → 200', async () => {
    const o = await makeOrder(prisma, { status: 'in_progress', assignedTo: T.id });
    const { evidenceId } = await commit(o.id, T.id, techTok);
    const res = await getEvidence(app, o.id, evidenceId, techTok);
    expect(res.status).toBe(200);
  });

  it('technician NO-dueño sobre orden de T → 404 (nunca 403)', async () => {
    const o = await makeOrder(prisma, { status: 'in_progress', assignedTo: T.id });
    const { evidenceId } = await commit(o.id, T.id, techTok);
    const res = await getEvidence(app, o.id, evidenceId, tech2Tok);
    expect(res.status).toBe(404);
  });

  it('supervisor sobre pending_review (su alcance) → 200', async () => {
    const o = await makeOrder(prisma, { status: 'in_progress', assignedTo: T.id });
    const { evidenceId } = await commit(o.id, T.id, techTok);
    // El submit deja la orden en pending_review (entra en el alcance del supervisor).
    const fresh = await prisma.order.findUniqueOrThrow({ where: { id: o.id } });
    expect(fresh.status).toBe('pending_review');
    const res = await getEvidence(app, o.id, evidenceId, supTok);
    expect(res.status).toBe(200);
  });

  it('supervisor sobre in_progress (fuera de su alcance) → 404', async () => {
    const o = await makeOrder(prisma, { status: 'in_progress', assignedTo: T.id });
    const { evidenceId } = await commit(o.id, T.id, techTok);
    // Reabre la orden a in_progress vía rechazo del supervisor, para tener un caso donde su PROPIO rol la
    // saca de alcance (pending_review→in_progress) — control de que el alcance se re-evalúa, no un flag fijo.
    const reject = await request(app)
      .post(`/v1/orders/${o.id}/review`)
      .set('Authorization', `Bearer ${supTok}`)
      .send({ decision: 'reject', reason: 'faltan detalles del trabajo realizado' });
    expect(reject.status).toBe(200);
    expect(reject.body.status).toBe('in_progress');
    const res = await getEvidence(app, o.id, evidenceId, supTok);
    expect(res.status).toBe(404);
  });

  it('dispatcher NUNCA accede (mínimo privilegio) — ni sobre pending_review ni sobre in_progress', async () => {
    const pending = await makeOrder(prisma, { status: 'in_progress', assignedTo: T.id });
    const { evidenceId: pendingEvidenceId } = await commit(pending.id, T.id, techTok);
    const resPending = await getEvidence(app, pending.id, pendingEvidenceId, dispTok);
    expect(resPending.status).toBe(404);

    const inProgress = await makeOrder(prisma, { status: 'in_progress', assignedTo: T.id });
    const { evidenceId: ipEvidenceId } = await commit(inProgress.id, T.id, techTok);
    // Rechazo del supervisor devuelve la orden a in_progress (alcance PROPIO del dispatcher, assigned/
    // in_progress) conservando la fila de evidencia — control de que ni siquiera en SU alcance accede.
    const reject = await request(app)
      .post(`/v1/orders/${inProgress.id}/review`)
      .set('Authorization', `Bearer ${supTok}`)
      .send({ decision: 'reject', reason: 'faltan detalles del trabajo realizado' });
    expect(reject.status).toBe(200);
    expect(reject.body.status).toBe('in_progress');
    const resInProgress = await getEvidence(app, inProgress.id, ipEvidenceId, dispTok);
    expect(resInProgress.status).toBe(404);
  });
});
