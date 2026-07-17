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

// T025 (024, US2, FR-007/FR-015) — no-enumeración/precedencia de getOrderEvidence: (1) sin sesión → 401,
// precede a todo; (2) no-autorizado / orden ajena / inexistente / `closed` → 404 UNIFORME (mismo cuerpo byte
// a byte, nunca 403); (3) `evidenceId` de OTRA orden bajo un `orderId` propio → 404 (verifica pertenencia,
// FR-015 — evita usar un orderId propio como oráculo para leer evidencia de otra orden vía IDOR).
// RED: la ruta no existe → todo cae hoy en el 404 genérico de Express (cuerpo/forma distintos de
// {code,message,...}, sin cabeceras del contrato) — las aserciones de forma/precedencia fallan por la razón
// correcta hasta que se implemente getOrderEvidence.
const storageDir = mkdtempSync(join(tmpdir(), 'fieldops-evidence-404-uniforme-'));
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
const NONEXISTENT_ORDER = '018f2000-0000-7000-8000-0000000000ee';
const NONEXISTENT_EVIDENCE = '018f2000-0000-7000-8000-0000000000ef';

async function token(email: string): Promise<string> {
  const r = await request(app).post('/v1/auth/login').send({ identifier: email, password: SEED_PASSWORD });
  return r.body.access_token as string;
}
let techTok = '';
let tech2Tok = '';
beforeAll(async () => {
  techTok = await token(T.email);
  tech2Tok = await token(T2.email);
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

describe('getOrderEvidence — 404 uniforme y no-enumeración (024, US2, FR-007/FR-015)', () => {
  it('sin sesión → 401 (precede a todo lo demás, incl. ids malformados)', async () => {
    const res = await getEvidence(app, 'no-es-uuid', 'tampoco-es-uuid', null);
    expect(res.status).toBe(401);
  });

  it('sin sesión + ids válidos pero inexistentes → 401 (precedencia 401→404)', async () => {
    const res = await getEvidence(app, NONEXISTENT_ORDER, NONEXISTENT_EVIDENCE, null);
    expect(res.status).toBe(401);
  });

  it('todas las ramas de 404 devuelven el MISMO cuerpo (no-autorizado/ajena/inexistente/closed/malformado)', async () => {
    // (a) no-autorizado: technician2 sobre evidencia de T.
    const oAjena = await makeOrder(prisma, { status: 'in_progress', assignedTo: T.id });
    const { evidenceId: ajenaEvidenceId } = await commit(oAjena.id, T.id, techTok);

    // (b) orden inexistente.
    // (c) closed: evidencia commiteada, orden luego cerrada — fuera de alcance de TODO rol (FR-003/FR-009).
    const oClosed = await makeOrder(prisma, { status: 'in_progress', assignedTo: T.id });
    const { evidenceId: closedEvidenceId } = await commit(oClosed.id, T.id, techTok);
    await prisma.order.update({ where: { id: oClosed.id }, data: { status: 'closed' } });

    // (d) orderId malformado.
    const cases: Array<[string, string]> = [
      [oAjena.id, ajenaEvidenceId], // no-autorizado (con tech2)
      [NONEXISTENT_ORDER, NONEXISTENT_EVIDENCE], // inexistente
      [oClosed.id, closedEvidenceId], // closed (fuera de alcance de todo rol)
      ['no-es-uuid', 'no-es-uuid'], // malformado
    ];

    const bodies: string[] = [];
    for (const [orderId, evidenceId] of cases) {
      const res = await getEvidence(app, orderId, evidenceId, tech2Tok);
      expect(res.status).toBe(404);
      expect(res.status).not.toBe(403);
      bodies.push(JSON.stringify(res.body));
    }
    expect(new Set(bodies).size).toBe(1);
  });

  it('evidenceId de OTRA orden bajo un orderId propio → 404 (FR-015, verifica pertenencia)', async () => {
    const orderA = await makeOrder(prisma, { status: 'in_progress', assignedTo: T.id });
    const orderB = await makeOrder(prisma, { status: 'in_progress', assignedTo: T.id });
    const { evidenceId: evidenceIdOfB } = await commit(orderB.id, T.id, techTok);

    // T es dueño de AMBAS órdenes (descarta que el 404 se deba a falta de autz sobre la orden en sí): el
    // rechazo debe venir específicamente de que evidenceIdOfB no pertenece a orderA.
    const res = await getEvidence(app, orderA.id, evidenceIdOfB, techTok);
    expect(res.status).toBe(404);

    // Control: la MISMA evidencia, bajo SU propio orderId (B), sí es accesible (200) — confirma que el 404
    // anterior es específico de la pertenencia orderId/evidenceId, no un fallo genérico de autz.
    const control = await getEvidence(app, orderB.id, evidenceIdOfB, techTok);
    expect(control.status).toBe(200);
  });

  it('evidenceId inexistente bajo orderId propio y visible → 404', async () => {
    const o = await makeOrder(prisma, { status: 'in_progress', assignedTo: T.id });
    await commit(o.id, T.id, techTok);
    const res = await getEvidence(app, o.id, NONEXISTENT_EVIDENCE, techTok);
    expect(res.status).toBe(404);
  });

  it('orderId propio válido + evidenceId con formato uuid pero de otra orden ajena → 404 (sin filtrar existencia)', async () => {
    const own = await makeOrder(prisma, { status: 'in_progress', assignedTo: T.id });
    const ajena = await makeOrder(prisma, { status: 'in_progress', assignedTo: T2.id });
    const { evidenceId } = await commit(ajena.id, T2.id, tech2Tok);
    const res = await getEvidence(app, own.id, evidenceId, techTok);
    expect(res.status).toBe(404);
  });
});
