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

// T052 (024, US2, FR-016) — la autz de getOrderEvidence se RE-EVALÚA por petición (no hay capacidad
// portadora que se congele en el momento del commit): tras una reasignación (cambia `assigned_to`), el
// técnico SALIENTE pierde el acceso, el NUEVO dueño lo gana, y el supervisor (cuyo alcance no depende de
// `assigned_to`) mantiene el suyo sin importar quién sea el dueño actual.
// RED: GET /v1/orders/:orderId/evidence/:evidenceId no existe → hoy TODO cae en 404 genérico de Express, así
// que las aserciones de 200 (dueño saliente ANTES de reasignar, nuevo dueño DESPUÉS, supervisor en ambos
// instantes) fallan por la razón correcta (falta el endpoint), no solo el 404 esperado del saliente.
const storageDir = mkdtempSync(join(tmpdir(), 'fieldops-evidence-reassign-'));
afterAll(async () => {
  await rm(storageDir, { recursive: true, force: true });
});

const ENC_KEY = testConfig().evidenceEncKey;
const { app, prisma } = makeTestApp({ evidenceStorageDir: storageDir });
afterAll(async () => {
  await prisma.$disconnect();
});

const T1 = SEED_USERS.reassignSrc; // técnico saliente
const T2 = SEED_USERS.reassignDst; // técnico nuevo dueño
const S = SEED_USERS.supervisor;
const DISP = SEED_USERS.dispatcher;

async function token(email: string): Promise<string> {
  const r = await request(app).post('/v1/auth/login').send({ identifier: email, password: SEED_PASSWORD });
  return r.body.access_token as string;
}
let t1Tok = '';
let t2Tok = '';
let supTok = '';
let dispTok = '';
beforeAll(async () => {
  t1Tok = await token(T1.email);
  t2Tok = await token(T2.email);
  supTok = await token(S.email);
  dispTok = await token(DISP.email);
});

function reassign(orderId: string, body: unknown) {
  const req = request(app).post(`/v1/orders/${orderId}/reassignments`);
  return req.set('Authorization', `Bearer ${dispTok}`).send(body as object);
}

describe('getOrderEvidence — reasignación cambia el dueño de acceso (024, US2, FR-016)', () => {
  it('reasignación real (in_progress): T1 pierde acceso (404), T2 lo gana (200)', async () => {
    const o = await makeOrder(prisma, { status: 'in_progress', assignedTo: T1.id });
    const { evidenceId } = await commitRealEvidence({
      app,
      prisma,
      baseDir: storageDir,
      encKey: ENC_KEY,
      ownerId: T1.id,
      orderId: o.id,
      token: t1Tok,
      bytes: validJpeg(),
      contentType: 'image/jpeg',
    });
    // El submit deja la orden en pending_review; el supervisor rechaza para volver a in_progress (estado
    // reasignable, REASSIGNABLE=['assigned','in_progress']) conservando la fila de evidencia.
    const reject = await request(app)
      .post(`/v1/orders/${o.id}/review`)
      .set('Authorization', `Bearer ${supTok}`)
      .send({ decision: 'reject', reason: 'faltan fotos de la instalación completa' });
    expect(reject.status).toBe(200);
    expect(reject.body.status).toBe('in_progress');

    // ANTES de reasignar: T1 (dueño actual) accede.
    const before = await getEvidence(app, o.id, evidenceId, t1Tok);
    expect(before.status).toBe(200);

    // Reasignación real vía el endpoint de dispatcher ya implementado (004).
    const res = await reassign(o.id, { assignee_id: T2.id, reason: 'reparto de carga' });
    expect(res.status).toBe(200);
    expect(res.body.assigned_to).toBe(T2.id);

    // DESPUÉS de reasignar: T1 (saliente) → 404; T2 (nuevo dueño) → 200. La autz se re-evalúa por petición.
    const afterT1 = await getEvidence(app, o.id, evidenceId, t1Tok);
    expect(afterT1.status).toBe(404);
    const afterT2 = await getEvidence(app, o.id, evidenceId, t2Tok);
    expect(afterT2.status).toBe(200);
  });

  it('el supervisor mantiene su acceso sobre pending_review independientemente de quién sea assigned_to', async () => {
    // El endpoint de reasignación real solo opera sobre assigned/in_progress (REASSIGNABLE), no
    // pending_review (alcance del supervisor). Para ejercitar que el alcance del supervisor NO depende de
    // `assigned_to` (FR-016 — "mantiene su acceso" cuando el dueño cambia), se simula el cambio de
    // `assigned_to` directamente en BD (equivalente observable a una reasignación completada por otra vía),
    // manteniendo la orden en pending_review — el supervisor conserva acceso ANTES y DESPUÉS del cambio.
    const o = await makeOrder(prisma, { status: 'in_progress', assignedTo: T1.id });
    const { evidenceId } = await commitRealEvidence({
      app,
      prisma,
      baseDir: storageDir,
      encKey: ENC_KEY,
      ownerId: T1.id,
      orderId: o.id,
      token: t1Tok,
      bytes: validJpeg(),
      contentType: 'image/jpeg',
    });
    const fresh = await prisma.order.findUniqueOrThrow({ where: { id: o.id } });
    expect(fresh.status).toBe('pending_review');

    const supBefore = await getEvidence(app, o.id, evidenceId, supTok);
    expect(supBefore.status).toBe(200);
    // El dueño (T1) también accede en este instante (pending_review está en su alcance activo).
    const t1Before = await getEvidence(app, o.id, evidenceId, t1Tok);
    expect(t1Before.status).toBe(200);

    await prisma.order.update({ where: { id: o.id }, data: { assignedTo: T2.id } });

    // El supervisor SIGUE accediendo (su alcance no filtra por assigned_to).
    const supAfter = await getEvidence(app, o.id, evidenceId, supTok);
    expect(supAfter.status).toBe(200);
    // El saliente (T1) pierde el acceso; el nuevo dueño (T2) lo gana — re-evaluado por petición.
    const t1After = await getEvidence(app, o.id, evidenceId, t1Tok);
    expect(t1After.status).toBe(404);
    const t2After = await getEvidence(app, o.id, evidenceId, t2Tok);
    expect(t2After.status).toBe(200);
  });
});
