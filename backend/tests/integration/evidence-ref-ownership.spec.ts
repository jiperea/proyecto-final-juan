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
import { validJpeg } from '../helpers/image-fixtures';

// T017 (024, US1, FR-023) — submitOrderExecution DEBE re-verificar cada object_ref, EN TRANSACCIÓN, bajo la
// concurrencia optimista de la orden: (a) staged por el mismo dueño actual para ESA orden; (b) sin fila ya
// creada (no reuso de evidencia committeada); (c) su blob existe. Mapeo determinista de códigos: ajeno/otra
// orden/otro actor → 404 uniforme; malformado → 422; con fila ya existente → 422; TTL de staging superado
// (24h, por edad, no por si el GC corrió) → 422; doble-submit del mismo dueño → el segundo 409.
// RED: submitOrderExecution HOY solo valida FORMATO (validateEvidence), no existencia/pertenencia/edad del
// object_ref — así que un ref con formato válido (aunque ajeno/malformado/expirado/reusado) es ACEPTADO
// (200) en vez de rechazado con el código correcto. Los blobs de este test se fabrican DIRECTAMENTE contra
// el mismo StoragePort de filesystem (mismo baseDir/encKey) que la app bajo prueba (sin depender del
// endpoint uploadOrderEvidence, que se cubre en T012-T016).
// Sincrónico (no `beforeAll`): `makeTestApp` se invoca en la carga del módulo.
const storageDir = mkdtempSync(join(tmpdir(), 'fieldops-evidence-ref-ownership-'));
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

async function token(email: string): Promise<string> {
  const r = await request(app).post('/v1/auth/login').send({ identifier: email, password: SEED_PASSWORD });
  return r.body.access_token as string;
}
let techTok = '';
beforeAll(async () => {
  techTok = await token(T.email);
});

function stage(ownerId: string, orderId: string, atMs?: number) {
  return stageBlob({
    baseDir: storageDir,
    encKey: ENC_KEY,
    ownerId,
    orderId,
    bytes: validJpeg(),
    contentType: 'image/jpeg',
    atMs,
  });
}

function submit(orderId: string, evidenceRefs: string[], tok = techTok) {
  return request(app)
    .post(`/v1/orders/${orderId}/execution`)
    .set('Authorization', `Bearer ${tok}`)
    .send({
      notes: 'ejecución con referencia a evidencia staged',
      evidence: evidenceRefs.map((ref) => ({ object_ref: ref, content_type: 'image/jpeg', size_bytes: 256 })),
    });
}

describe('submitOrderExecution — re-verificación de object_ref (024, US1, FR-023)', () => {
  it('ref staged por OTRO actor (technician2) → 404 uniforme (no-enumeración, nunca 422)', async () => {
    const o = await makeOrder(prisma, { status: 'in_progress', assignedTo: T.id });
    const ajeno = await stage(T2.id, o.id); // staged por T2, aunque para el orderId correcto
    const res = await submit(o.id, [ajeno]);
    expect(res.status).toBe(404);
  });

  it('ref propio pero staged para OTRA orden → 404 uniforme', async () => {
    const orderA = await makeOrder(prisma, { status: 'in_progress', assignedTo: T.id });
    const orderB = await makeOrder(prisma, { status: 'in_progress', assignedTo: T.id });
    const refDeOtraOrden = await stage(T.id, orderB.id);
    const res = await submit(orderA.id, [refDeOtraOrden]);
    expect(res.status).toBe(404);
  });

  it('ref malformado (no es un token HMAC válido) → 422', async () => {
    const o = await makeOrder(prisma, { status: 'in_progress', assignedTo: T.id });
    const res = await submit(o.id, ['esto-no-es-un-object_ref-real']);
    expect(res.status).toBe(422);
  });

  it('ref con fila YA creada (reuso de evidencia committeada) → 422 "vuelve a subir"', async () => {
    const first = await makeOrder(prisma, { status: 'in_progress', assignedTo: T.id });
    const ref = await stage(T.id, first.id);
    const committed = await submit(first.id, [ref]);
    expect(committed.status).toBe(200); // control: el primer submit sí commitea la fila

    const second = await makeOrder(prisma, { status: 'in_progress', assignedTo: T.id });
    const reused = await submit(second.id, [ref]); // MISMO ref, ya tiene fila de `first`
    expect(reused.status).toBe(422);
  });

  it('ref propio, sin fila, pero edad de staging > 24h (TTL) → 422 "evidencia expirada"', async () => {
    const o = await makeOrder(prisma, { status: 'in_progress', assignedTo: T.id });
    const stale = await stage(T.id, o.id, Date.now() - 25 * 60 * 60 * 1000); // 25h de antigüedad
    const res = await submit(o.id, [stale]);
    expect(res.status).toBe(422);
  });

  it('ref repetido DENTRO del mismo evidence[] → 422 (ya cubierto por el dedup existente de 005; se conserva por trazabilidad FR-023)', async () => {
    const o = await makeOrder(prisma, { status: 'in_progress', assignedTo: T.id });
    const ref = await stage(T.id, o.id);
    const res = await submit(o.id, [ref, ref]);
    expect(res.status).toBe(422);
  });

  it('doble-submit del mismo dueño (misma orden) → el segundo 409 (concurrencia optimista, no crea 2º attempt)', async () => {
    const o = await makeOrder(prisma, { status: 'in_progress', assignedTo: T.id });
    const refA = await stage(T.id, o.id);
    const refB = await stage(T.id, o.id);
    const firstSubmit = await submit(o.id, [refA]);
    expect(firstSubmit.status).toBe(200); // el primero commitea

    const secondSubmit = await submit(o.id, [refB]); // la orden ya NO está in_progress
    expect(secondSubmit.status).toBe(409);
    // sin efecto: no debe haber un segundo `attempt`/auditoría de transición por este envío.
    const audits = await prisma.orderAudit.count({ where: { orderId: o.id, eventType: 'transition' } });
    expect(audits).toBe(1);
  });
});
