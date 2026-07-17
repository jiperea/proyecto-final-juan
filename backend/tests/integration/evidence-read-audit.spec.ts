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
// de auditoría APPEND-ONLY (actor, orderId, evidenceId, timestamp), SIN el binario/`object_ref`. El sink es
// la tabla NUEVA `EvidenceReadAudit` (append-only por trigger de BD, mismo patrón que `OrderAudit`/
// `OrderEvidence`) — DELIBERADAMENTE separada de `OrderAudit`: esa tabla discrimina el ciclo vigente por
// transición (`toStatus`/`fromStatus`/`reason`, ver order-detail-reader.ts, de donde se deriva
// `last_rejection_reason`); insertar aquí filas de "lectura" (sin transición) contaminaría esa semántica
// FSM. `infra/audit/` (el `PinoDeniedAccessLogger` de #010) sigue siendo SOLO best-effort/no-durable, para
// accesos DENEGADOS — no un registro de auditoría durable.
// RED esperado (antes de T041): `getOrderEvidence` (get-evidence.ts) NO escribe ningún registro en
// `EvidenceReadAudit` en la lectura autorizada — el conteo NO cambia tras un 200. Lo pone en verde T041
// (024, US3): auditoría de lectura en `get-evidence.ts` vía `EvidenceReadAuditPort`.
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

    const before = await prisma.evidenceReadAudit.count({ where: { orderId: o.id } });

    const res = await getEvidence(baseApp, o.id, commit.evidenceId, techTok);
    expect(res.status).toBe(200);

    const after = await prisma.evidenceReadAudit.count({ where: { orderId: o.id } });
    // Único registro NUEVO originado por la lectura.
    expect(after).toBe(before + 1);

    // El registro deja actor/orderId/evidenceId/timestamp — nunca object_ref ni binario (ninguna columna
    // de EvidenceReadAudit los admite estructuralmente; se afirma explícitamente por robustez).
    const rows = await prisma.evidenceReadAudit.findMany({ where: { orderId: o.id } });
    expect(rows.length).toBe(1);
    expect(rows[0]?.actorId).toBe(T.id);
    expect(rows[0]?.evidenceId).toBe(commit.evidenceId);
    const dump = JSON.stringify(rows);
    expect(dump).not.toContain(commit.objectRef);

    // Confirma explícitamente la INTENCIÓN preservada de FR-021 (no-contaminación de OrderAudit/FSM): el
    // conteo de transiciones de esta orden NO cambia por la lectura (solo existía la del submit).
    const orderAuditRows = await prisma.orderAudit.count({ where: { orderId: o.id } });
    expect(orderAuditRows).toBe(1); // únicamente la transición de submitOrderExecution
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

    const before = await prisma.evidenceReadAudit.count({ where: { orderId: o.id } });
    const res = await getEvidence(app, o.id, commit.evidenceId, dispTok);
    expect(res.status).toBe(404);
    const after = await prisma.evidenceReadAudit.count({ where: { orderId: o.id } });

    expect(after).toBe(before); // sin registro durable nuevo por el acceso denegado
    expect(captured.length).toBe(1); // la señal best-effort SÍ se emitió (heredada de getOrderDetail)
  });
});
