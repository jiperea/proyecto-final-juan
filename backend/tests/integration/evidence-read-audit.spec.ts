import { mkdtempSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import request from 'supertest';
import { SEED_PASSWORD, SEED_USERS } from '../../prisma/seed-data';
import { makeTestApp, makeTestAppWithEvidence, testConfig } from '../helpers/test-app';
import { makeOrder } from '../helpers/transition';
import { commitRealEvidence, getEvidence } from '../helpers/evidence';
import { validJpeg } from '../helpers/image-fixtures';

// T037 (024, US3, FR-021) — una lectura AUTORIZADA de evidencia (`getOrderEvidence` → 200) deja un registro
// de auditoría APPEND-ONLY (actor, orderId, evidenceId, timestamp), SIN el binario/`object_ref`. El único
// mecanismo append-only existente en el repo (verificado por trigger de BD, no por REVOKE — ver
// order-audit-append-only.spec.ts) es la tabla `OrderAudit`; complementa/reutiliza `infra/audit/` (el
// `PinoDeniedAccessLogger` de #010, que es SOLO best-effort/no-durable, no un registro de auditoría). Un
// acceso DENEGADO (401/404) NO debe crear un registro durable nuevo — solo emite la señal best-effort YA
// existente (heredada de getOrderDetail, FR-007/#010).
// RED esperado: hoy `getOrderEvidence` (get-evidence.ts) NO escribe ningún registro de auditoría en la
// lectura autorizada — el conteo de `OrderAudit` para la orden NO cambia tras un 200. Lo pone en verde
// T041 (024, US3): auditoría de lectura en `get-evidence.ts` reutilizando `infra/audit/`.
const storageDir = mkdtempSync(join(tmpdir(), 'fieldops-evidence-read-audit-'));
afterAll(async () => {
  await rm(storageDir, { recursive: true, force: true });
});

const ENC_KEY = testConfig().evidenceEncKey;
const { app: baseApp, prisma } = makeTestApp({ evidenceStorageDir: storageDir });
afterAll(async () => {
  await prisma.$disconnect();
});

const T = SEED_USERS.technician;
const D = SEED_USERS.dispatcher;
let techTok = '';
let dispTok = '';
beforeAll(async () => {
  const r1 = await request(baseApp).post('/v1/auth/login').send({ identifier: T.email, password: SEED_PASSWORD });
  techTok = r1.body.access_token;
  const r2 = await request(baseApp).post('/v1/auth/login').send({ identifier: D.email, password: SEED_PASSWORD });
  dispTok = r2.body.access_token;
});

describe('evidencia — auditoría append-only de lectura (024, US3, FR-021)', () => {
  it('una lectura autorizada (200) crea EXACTAMENTE 1 registro de auditoría nuevo, sin binario/object_ref', async () => {
    const o = await makeOrder(prisma, { status: 'in_progress', assignedTo: T.id });
    const commit = await commitRealEvidence({
      app: baseApp,
      prisma,
      baseDir: storageDir,
      encKey: ENC_KEY,
      ownerId: T.id,
      orderId: o.id,
      token: techTok,
      bytes: validJpeg(),
      contentType: 'image/jpeg',
    });

    const before = await prisma.orderAudit.count({ where: { orderId: o.id } });

    const res = await getEvidence(baseApp, o.id, commit.evidenceId, techTok);
    expect(res.status).toBe(200);

    const after = await prisma.orderAudit.count({ where: { orderId: o.id } });
    // Único registro NUEVO originado por la lectura (no confundir con el de la transición del submit,
    // que ya estaba contado en `before`).
    expect(after).toBe(before + 1);

    // El/los registro(s) de auditoría de esta orden nunca contienen el object_ref ni el binario (ninguna
    // columna de OrderAudit los admite estructuralmente; se afirma explícitamente por robustez).
    const rows = await prisma.orderAudit.findMany({ where: { orderId: o.id } });
    const dump = JSON.stringify(rows);
    expect(dump).not.toContain(commit.objectRef);
  });

  it('un acceso DENEGADO (404, dispatcher) NO crea un registro de auditoría durable nuevo — solo la señal best-effort heredada', async () => {
    const captured: unknown[] = [];
    const { app } = makeTestAppWithEvidence(
      { deniedLogger: { record: (e) => captured.push(e) } },
      { evidenceStorageDir: storageDir },
    );
    const o = await makeOrder(prisma, { status: 'in_progress', assignedTo: T.id });
    const commit = await commitRealEvidence({
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

    const before = await prisma.orderAudit.count({ where: { orderId: o.id } });
    const res = await getEvidence(app, o.id, commit.evidenceId, dispTok);
    expect(res.status).toBe(404);
    const after = await prisma.orderAudit.count({ where: { orderId: o.id } });

    expect(after).toBe(before); // sin registro durable nuevo por el acceso denegado
    expect(captured.length).toBe(1); // la señal best-effort SÍ se emitió (heredada de getOrderDetail)
  });
});
