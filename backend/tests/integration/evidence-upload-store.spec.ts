import { mkdtempSync } from 'node:fs';
import { readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import request from 'supertest';
import { SEED_PASSWORD, SEED_USERS } from '../../prisma/seed-data';
import { makeTestApp } from '../helpers/test-app';
import { makeOrder } from '../helpers/transition';
import { uploadEvidence } from '../helpers/evidence';
import { validJpeg, validPng, validWebp } from '../helpers/image-fixtures';

// T013 (024, US1, FR-001) — dueño en in_progress sube 1..N imágenes válidas → 201 con object_ref por cada
// una; tras submitOrderExecution, count==N y las filas OrderEvidence quedan creadas con esos object_ref; el
// binario vive CIFRADO en el store (los bytes crudos en disco difieren del original, AES-256-GCM, FR-001).
// RED: uploadOrderEvidence no existe aún (404 en cada llamada) → ninguna aserción de este fichero puede
// pasar hoy; quedará verde cuando el endpoint exista y submit cree las filas a partir de los object_ref.
// Sincrónico (no `beforeAll`): `makeTestApp` se invoca en la carga del módulo, así que `storageDir` debe
// existir ANTES de esa llamada (si fuera async en un `beforeAll`, la app se construiría con baseDir='').
const storageDir = mkdtempSync(join(tmpdir(), 'fieldops-evidence-upload-store-'));
afterAll(async () => {
  await rm(storageDir, { recursive: true, force: true });
});

const { app, prisma } = makeTestApp({ evidenceStorageDir: storageDir });
afterAll(async () => {
  await prisma.$disconnect();
});

const T = SEED_USERS.technician;

async function token(email: string): Promise<string> {
  const r = await request(app).post('/v1/auth/login').send({ identifier: email, password: SEED_PASSWORD });
  return r.body.access_token as string;
}
let techTok = '';
beforeAll(async () => {
  techTok = await token(T.email);
});

describe('evidencia — subida y almacenamiento (024, US1, FR-001)', () => {
  it('sube 3 imágenes válidas (jpeg/png/webp); cada una devuelve un object_ref distinto', async () => {
    const o = await makeOrder(prisma, { status: 'in_progress', assignedTo: T.id });
    const buffers = [validJpeg(), validPng(), validWebp()];
    const contentTypes = ['image/jpeg', 'image/png', 'image/webp'];
    const refs: string[] = [];
    for (let i = 0; i < buffers.length; i++) {
      const res = await uploadEvidence(app, o.id, techTok, buffers[i]!, { contentType: contentTypes[i]! });
      expect(res.status).toBe(201);
      refs.push(res.body.object_ref);
    }
    expect(new Set(refs).size).toBe(3); // sin colisión entre refs

    // Tras el submit, count == N y las filas OrderEvidence quedan enlazadas a esos object_ref.
    const exec = await request(app)
      .post(`/v1/orders/${o.id}/execution`)
      .set('Authorization', `Bearer ${techTok}`)
      .send({
        notes: 'evidencia real subida por el técnico',
        evidence: refs.map((ref, i) => ({ object_ref: ref, content_type: contentTypes[i], size_bytes: 512 })),
      });
    expect(exec.status).toBe(200);
    expect(exec.body.status).toBe('pending_review');

    const rows = await prisma.orderEvidence.findMany({ where: { orderId: o.id } });
    expect(rows.length).toBe(3);
    expect(new Set(rows.map((r) => r.objectRef))).toEqual(new Set(refs));
  });

  it('el blob queda cifrado en reposo: los bytes crudos en el store difieren del binario original', async () => {
    const o = await makeOrder(prisma, { status: 'in_progress', assignedTo: T.id });
    const original = validJpeg(4096); // relleno grande y distintivo para buscarlo en claro
    const res = await uploadEvidence(app, o.id, techTok, original, { contentType: 'image/jpeg' });
    expect(res.status).toBe(201);

    const files = await readdir(storageDir).catch(() => [] as string[]);
    const binFiles = files.filter((f) => f.endsWith('.bin'));
    expect(binFiles.length).toBeGreaterThan(0); // debe haberse escrito AL MENOS un blob
    for (const f of binFiles) {
      const raw = await readFile(join(storageDir, f));
      expect(raw.includes(original)).toBe(false); // nunca en claro
    }
  });
});
