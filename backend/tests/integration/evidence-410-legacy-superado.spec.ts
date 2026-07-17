import { mkdtempSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import request from 'supertest';
import { SEED_PASSWORD, SEED_USERS } from '../../prisma/seed-data';
import { makeTestApp, testConfig } from '../helpers/test-app';
import { makeOrder, makePendingReviewOrder } from '../helpers/transition';
import { commitRealEvidence, getEvidence } from '../helpers/evidence';
import { FsStorageAdapter } from '../../src/infra/storage/fs-storage-adapter';
import { validJpeg, validPng } from '../helpers/image-fixtures';

// T026 (024, US2, FR-009) — 410 EVIDENCE_GONE: reservado EXCLUSIVAMENTE para un actor AUTORIZADO sobre una
// orden EN ALCANCE (estados activos) cuya fila `OrderEvidence` existe pero su blob NO está disponible en el
// store — (a) legacy (evidencia previa a esta feature, solo metadatos, nunca tuvo blob real) o (b) superado
// (ciclo reject→resubmit: el blob del attempt anterior fue purgado por el GC de FR-024, aquí SIMULADO
// borrando el blob directamente del store tras el reemplazo de ciclo — el GC en sí es de US3). Contraste
// central: la MISMA ausencia de blob para una orden `closed` da 404 (nunca 410) — `closed` está fuera de
// alcance de TODO rol (FR-003/FR-007), así que el 410 nunca llega a evaluarse.
// RED: la ruta GET /v1/orders/:orderId/evidence/:evidenceId no existe → hoy todo cae en 404 genérico de
// Express, así que las 3 aserciones (410/410/404) fallan por la razón correcta (ni la ruta ni la
// discriminación 410-vs-404 existen todavía).
const storageDir = mkdtempSync(join(tmpdir(), 'fieldops-evidence-410-'));
afterAll(async () => {
  await rm(storageDir, { recursive: true, force: true });
});

const ENC_KEY = testConfig().evidenceEncKey;
const { app, prisma } = makeTestApp({ evidenceStorageDir: storageDir });
afterAll(async () => {
  await prisma.$disconnect();
});
const storage = new FsStorageAdapter({ baseDir: storageDir, encKey: ENC_KEY, clock: { now: () => new Date() } });

const T = SEED_USERS.technician;
const S = SEED_USERS.supervisor;

async function token(email: string): Promise<string> {
  const r = await request(app).post('/v1/auth/login').send({ identifier: email, password: SEED_PASSWORD });
  return r.body.access_token as string;
}
let techTok = '';
let supTok = '';
beforeAll(async () => {
  techTok = await token(T.email);
  supTok = await token(S.email);
});

describe('getOrderEvidence — 410 EVIDENCE_GONE vs 404 de closed (024, US2, FR-009)', () => {
  it('legacy: fila sin blob almacenado (evidencia previa a la feature) → 410, nunca 404', async () => {
    const o = await makePendingReviewOrder(prisma, { assignedTo: T.id, evidenceCount: 1 });
    const row = await prisma.orderEvidence.findFirstOrThrow({ where: { orderId: o.id } });
    // Control: el objectRef sintético NUNCA existió en el store real bajo prueba.
    const listed = await storage.list();
    expect(listed.some((s) => s.objectRef === row.objectRef)).toBe(false);

    const resTech = await getEvidence(app, o.id, row.id, techTok);
    expect(resTech.status).toBe(410);
    expect(resTech.body.code).toBe('EVIDENCE_GONE');

    const resSup = await getEvidence(app, o.id, row.id, supTok);
    expect(resSup.status).toBe(410);
    expect(resSup.body.code).toBe('EVIDENCE_GONE');
  });

  it('superado: ciclo anterior con blob purgado tras reject→resubmit → 410 para el evidenceId superado', async () => {
    const o = await makeOrder(prisma, { status: 'in_progress', assignedTo: T.id });

    // Ciclo 1: submit con blob real.
    const commit1 = await commitRealEvidence({
      app,
      prisma,
      baseDir: storageDir,
      encKey: ENC_KEY,
      ownerId: T.id,
      orderId: o.id,
      token: techTok,
      bytes: validJpeg(),
      contentType: 'image/jpeg',
    });

    // Supervisor rechaza → in_progress (el ciclo 1 sigue existiendo como fila, ahora "vigente" en in_progress).
    const reject = await request(app)
      .post(`/v1/orders/${o.id}/review`)
      .set('Authorization', `Bearer ${supTok}`)
      .send({ decision: 'reject', reason: 'faltan fotos del cuadro eléctrico principal' });
    expect(reject.status).toBe(200);
    expect(reject.body.status).toBe('in_progress');

    // Ciclo 2: el técnico reenvía con un blob NUEVO (propio) → el ciclo 1 queda SUPERADO (FR-017).
    const commit2 = await commitRealEvidence({
      app,
      prisma,
      baseDir: storageDir,
      encKey: ENC_KEY,
      ownerId: T.id,
      orderId: o.id,
      token: techTok,
      bytes: validPng(),
      contentType: 'image/png',
    });
    const freshAfter2 = await prisma.order.findUniqueOrThrow({ where: { id: o.id } });
    expect(freshAfter2.status).toBe('pending_review');

    // Simula que el GC (FR-024, US3) ya purgó físicamente el blob del ciclo superado (ciclo 1) — su fila de
    // metadatos SOBREVIVE (append-only, XI) pero su blob ya no está en el store.
    await storage.delete(commit1.objectRef);

    // El evidenceId del ciclo SUPERADO (1) → 410 para un actor autorizado sobre la orden (en alcance).
    const resSuperado = await getEvidence(app, o.id, commit1.evidenceId, techTok);
    expect(resSuperado.status).toBe(410);
    expect(resSuperado.body.code).toBe('EVIDENCE_GONE');

    // Control: el evidenceId VIGENTE (ciclo 2, blob real intacto) → 200, no 410 (el GC no afecta al vigente).
    const resVigente = await getEvidence(app, o.id, commit2.evidenceId, techTok);
    expect(resVigente.status).toBe(200);
  });

  it('closed: evidencia sin blob en una orden closed → 404 (NUNCA 410; closed fuera de alcance de todo rol)', async () => {
    const o = await makeOrder(prisma, { status: 'in_progress', assignedTo: T.id });
    const commit1 = await commitRealEvidence({
      app,
      prisma,
      baseDir: storageDir,
      encKey: ENC_KEY,
      ownerId: T.id,
      orderId: o.id,
      token: techTok,
      bytes: validJpeg(),
      contentType: 'image/jpeg',
    });
    // Purga física del blob (p. ej. tras 90 días de retención, FR-009/FR-018) + cierre de la orden.
    await storage.delete(commit1.objectRef);
    await prisma.order.update({ where: { id: o.id }, data: { status: 'closed' } });

    const res = await getEvidence(app, o.id, commit1.evidenceId, techTok);
    expect(res.status).toBe(404);
    expect(res.status).not.toBe(410);
  });
});
