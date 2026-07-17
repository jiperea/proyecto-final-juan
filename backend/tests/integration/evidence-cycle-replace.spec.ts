import { mkdtempSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import request from 'supertest';
import { SEED_PASSWORD, SEED_USERS } from '../../prisma/seed-data';
import { makeTestApp, testConfig } from '../helpers/test-app';
import { makeOrder } from '../helpers/transition';
import { stageBlob } from '../helpers/evidence-storage';
import { validJpeg, validPng } from '../helpers/image-fixtures';

// T051 (024, US1/US3, FR-017) — orden rechazada: el técnico vuelve a subir fotos NUEVAS y reenvía → se crea
// un nuevo attempt/auditId, el ciclo anterior queda SUPERADO (sin borrar sus metadatos, XI), y
// `getOrderDetail.items`/`evidence` exponen SOLO el ciclo VIGENTE (el más reciente). El 410 de lectura del
// ciclo superado (getOrderEvidence) lo cubre US2 (T026); aquí solo el lado submit/detalle.
// RED: (a) `getOrderDetail` aún no expone `evidence.items` (FR-014, campo nuevo) → la aserción de `items`
// falla por ausencia del campo; (b) aunque `submitOrderExecution` YA soporta el ciclo reject→resubmit
// (review-reject-resubmit-cycle.spec.ts), la evidencia usada aquí son BLOBS REALES staged (no placeholders),
// ejercitando el flujo completo de 024 sobre ese ciclo ya existente.
// Sincrónico (no `beforeAll`): `makeTestApp` se invoca en la carga del módulo.
const storageDir = mkdtempSync(join(tmpdir(), 'fieldops-evidence-cycle-replace-'));
afterAll(async () => {
  await rm(storageDir, { recursive: true, force: true });
});

const ENC_KEY = testConfig().evidenceEncKey;
const { app, prisma } = makeTestApp({ evidenceStorageDir: storageDir });
afterAll(async () => {
  await prisma.$disconnect();
});

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

function stage(orderId: string, bytes: Buffer, contentType: string) {
  return stageBlob({ baseDir: storageDir, encKey: ENC_KEY, ownerId: T.id, orderId, bytes, contentType });
}

describe('evidencia — reemplazo de ciclo tras rechazo (024, US1/US3, FR-017)', () => {
  it('reenvío tras rechazo: nuevo attempt con blobs propios; el ciclo anterior queda superado; detalle expone SOLO el vigente', async () => {
    const o = await makeOrder(prisma, { status: 'in_progress', assignedTo: T.id });

    // Ciclo 1: submit con evidencia real (jpeg) → pending_review.
    const ref1 = await stage(o.id, validJpeg(), 'image/jpeg');
    const submit1 = await request(app)
      .post(`/v1/orders/${o.id}/execution`)
      .set('Authorization', `Bearer ${techTok}`)
      .send({ notes: 'primer intento', evidence: [{ object_ref: ref1, content_type: 'image/jpeg', size_bytes: 256 }] });
    expect(submit1.status).toBe(200);
    expect(submit1.body.status).toBe('pending_review');

    // Supervisor rechaza → in_progress.
    const reject = await request(app)
      .post(`/v1/orders/${o.id}/review`)
      .set('Authorization', `Bearer ${supTok}`)
      .send({ decision: 'reject', reason: 'faltan fotos del cuadro eléctrico' });
    expect(reject.status).toBe(200);
    expect(reject.body.status).toBe('in_progress');

    // Ciclo 2: el técnico vuelve a subir fotos NUEVAS (png, distinto blob) y reenvía.
    const ref2 = await stage(o.id, validPng(), 'image/png');
    const submit2 = await request(app)
      .post(`/v1/orders/${o.id}/execution`)
      .set('Authorization', `Bearer ${techTok}`)
      .send({ notes: 'corregido y reenviado', evidence: [{ object_ref: ref2, content_type: 'image/png', size_bytes: 256 }] });
    expect(submit2.status).toBe(200);
    expect(submit2.body.status).toBe('pending_review');

    // Ambas filas de metadatos persisten (append-only, XI) — el ciclo 1 NO se borra de OrderEvidence.
    const allEvidence = await prisma.orderEvidence.findMany({ where: { orderId: o.id }, orderBy: { at: 'asc' } });
    expect(allEvidence.map((e) => e.objectRef)).toEqual([ref1, ref2]);

    // El detalle (técnico dueño) SOLO expone el ciclo VIGENTE (el más reciente): count=1, content_types=[png].
    const detailTech = await request(app).get(`/v1/orders/${o.id}`).set('Authorization', `Bearer ${techTok}`);
    expect(detailTech.status).toBe(200);
    expect(detailTech.body.evidence.count).toBe(1);
    expect(detailTech.body.evidence.content_types).toEqual(['image/png']);
    // FR-014: items[] con evidence_id opaco del ciclo vigente, MISMO orden que content_types, length==count.
    expect(Array.isArray(detailTech.body.evidence.items)).toBe(true);
    expect(detailTech.body.evidence.items.length).toBe(1);
    expect(detailTech.body.evidence.items[0].content_type).toBe('image/png');
    const vigenteId = allEvidence[1]!.id;
    expect(detailTech.body.evidence.items[0].evidence_id).toBe(vigenteId);
    // El evidence_id del ciclo SUPERADO (ref1) NO debe aparecer en items.
    const superadoId = allEvidence[0]!.id;
    expect(detailTech.body.evidence.items.map((it: { evidence_id: string }) => it.evidence_id)).not.toContain(
      superadoId,
    );

    // El detalle del supervisor (también autorizado sobre pending_review) ve el mismo recorte al ciclo vigente.
    const detailSup = await request(app).get(`/v1/orders/${o.id}`).set('Authorization', `Bearer ${supTok}`);
    expect(detailSup.status).toBe(200);
    expect(detailSup.body.evidence.items.length).toBe(1);
    expect(detailSup.body.evidence.items[0].evidence_id).toBe(vigenteId);
  });
});
