// 026 (T006 · US1 · FR-001/SC-001) — Fase RED. Tras sembrar la evidencia con blob real (mismo mecanismo
// que usará el seed para la orden ancla `approvableReview`), `GET /v1/orders/:orderId/evidence/:evidenceId`
// debe responder 200 con el binario para el técnico DUEÑO y para el supervisor (autz heredada EXACTA de
// getOrderDetail, sin RBAC nueva); el dispatcher NUNCA accede a evidencia → 404 (igual que 024).
//
// Se ejercita sobre una orden de test AISLADA (no la ancla real `SEED_ORDERS.approvableReview`, que YA
// tiene su única fila de evidencia sembrada por `seedApprovableReviewArtifacts` — insertar una segunda aquí
// rompería el invariante «exactamente 1 evidencia» de `seed-approvable-review.spec.ts`, 019/H-002). El
// mecanismo verificado (`seedEvidenceBlobForOrder`) es EL MISMO que usará el seed real para la ancla.
//
// `seedEvidenceBlobForOrder` AÚN NO EXISTE en `backend/prisma/seed.ts` (mismo contrato esperado que en
// seed-evidence-blob-write.spec.ts) — hasta que `dev-backend` lo implemente (T007), el import falla y TODO
// el fichero es rojo por la razón correcta.
import { mkdtempSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import { SEED_PASSWORD, SEED_USERS } from '../../prisma/seed-data';
import { seedEvidenceBlobForOrder } from '../../prisma/seed';
import { FsStorageAdapter } from '../../src/infra/storage/fs-storage-adapter';
import { makeOrder } from '../helpers/transition';
import { makeTestApp, testConfig } from '../helpers/test-app';

const storageDir = mkdtempSync(join(tmpdir(), 'fieldops-seed-evidence-serve-'));
const ENC_KEY = testConfig().evidenceEncKey;
const clock = { now: (): Date => new Date() };
// Instancia de storage INDEPENDIENTE con el mismo baseDir/encKey que usará el container de la app (derivación
// determinista de subclaves desde el mismo secreto) — mismo patrón que evidence-staging-gc.spec.ts.
const storage = new FsStorageAdapter({ baseDir: storageDir, encKey: ENC_KEY, clock });

let app: Express;
let prisma: PrismaClient;

beforeAll(() => {
  ({ app, prisma } = makeTestApp({ evidenceStorageDir: storageDir }));
});
afterAll(async () => {
  await prisma.$disconnect();
  await rm(storageDir, { recursive: true, force: true });
});

async function login(identifier: string): Promise<string> {
  const res = await request(app).post('/v1/auth/login').send({ identifier, password: SEED_PASSWORD });
  return res.body.access_token as string;
}

describe('026 · evidencia sembrada servible por getOrderEvidence (FR-001/SC-001)', () => {
  it('técnico DUEÑO y supervisor → 200 con el binario; dispatcher → 404', async () => {
    const o = await makeOrder(prisma, { status: 'in_progress', assignedTo: SEED_USERS.technician.id });
    const { evidenceId } = await seedEvidenceBlobForOrder({
      prisma,
      storage,
      orderId: o.id,
      actorId: SEED_USERS.technician.id,
    });

    const techTok = await login(SEED_USERS.technician.email);
    const supTok = await login(SEED_USERS.supervisor.email);
    const dispTok = await login(SEED_USERS.dispatcher.email);

    const asOwner = await request(app)
      .get(`/v1/orders/${o.id}/evidence/${evidenceId}`)
      .set('Authorization', `Bearer ${techTok}`);
    expect(asOwner.status).toBe(200);
    expect(asOwner.headers['content-type']).toMatch(/image\/jpeg/);

    const asSupervisor = await request(app)
      .get(`/v1/orders/${o.id}/evidence/${evidenceId}`)
      .set('Authorization', `Bearer ${supTok}`);
    expect(asSupervisor.status).toBe(200);

    const asDispatcher = await request(app)
      .get(`/v1/orders/${o.id}/evidence/${evidenceId}`)
      .set('Authorization', `Bearer ${dispTok}`);
    expect(asDispatcher.status).toBe(404);
  });
});
