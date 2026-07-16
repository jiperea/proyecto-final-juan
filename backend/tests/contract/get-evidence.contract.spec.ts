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
import { validJpeg } from '../helpers/image-fixtures';

// T022 (024, US2, FR-003/004/005/007/009) — contrato de getOrderEvidence (GET /v1/orders/:orderId/evidence/
// :evidenceId). RED: la ruta AÚN NO EXISTE → cualquier llamada cae en el 404 genérico de Express (ruta no
// registrada, sin cuerpo {code,...} ni cabeceras defensivas), así que TODAS las aserciones de código/forma/
// cabeceras fallan hoy por la razón correcta. Una vez implementado getOrderEvidence, deben pasar sin relajarse.
const storageDir = mkdtempSync(join(tmpdir(), 'fieldops-get-evidence-contract-'));
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
let tech2Tok = '';
beforeAll(async () => {
  techTok = await token(T.email);
  tech2Tok = await token(T2.email);
});

describe('getOrderEvidence — contrato (024, US2)', () => {
  it('200: dueño actual + evidencia committeada → binario con cabeceras defensivas, sin URL/token cliente-visible', async () => {
    const o = await makeOrder(prisma, { status: 'in_progress', assignedTo: T.id });
    const { evidenceId } = await commitRealEvidence({
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

    const res = await getEvidence(app, o.id, evidenceId, techTok);
    expect(res.status).toBe(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(['image/jpeg', 'image/png', 'image/webp', 'image/heic']).toContain(
      (res.headers['content-type'] ?? '').split(';')[0],
    );

    // FR-004: el cuerpo y las cabeceras de la 200 NO contienen ninguna URL firmada ni token detached; la
    // firma interna ≤300 s (backend↔store) nunca es cliente-visible. Se vuelca cabeceras + cuerpo (binario o
    // JSON) a texto y se comprueba la AUSENCIA de cualquier indicio de URL/firma/token.
    const bodyText = Buffer.isBuffer(res.body)
      ? res.body.toString('latin1')
      : typeof res.body === 'string'
        ? res.body
        : JSON.stringify(res.body);
    const dump = `${JSON.stringify(res.headers)}\n${bodyText}`;
    expect(/https?:\/\//i.test(dump)).toBe(false);
    expect(/signature=/i.test(dump)).toBe(false);
    expect(/token=/i.test(dump)).toBe(false);
    expect(/X-Amz/i.test(dump)).toBe(false);
  });

  it('401: sin sesión', async () => {
    const o = await makeOrder(prisma, { status: 'in_progress', assignedTo: T.id });
    const { evidenceId } = await commitRealEvidence({
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
    const res = await getEvidence(app, o.id, evidenceId, null);
    expect(res.status).toBe(401);
    expect(typeof res.body.code).toBe('string');
  });

  it('404 uniforme: no-dueño (technician2) sobre evidencia de la orden de T', async () => {
    const o = await makeOrder(prisma, { status: 'in_progress', assignedTo: T.id });
    const { evidenceId } = await commitRealEvidence({
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
    const res = await getEvidence(app, o.id, evidenceId, tech2Tok);
    expect(res.status).toBe(404);
    expect(res.body.code).not.toBe('FORBIDDEN_ROLE');
  });

  it('410 EVIDENCE_GONE: actor autorizado, orden en alcance, fila sin blob almacenado (legacy)', async () => {
    // makePendingReviewOrder siembra una fila OrderEvidence con un object_ref sintético (`s3://bucket/...`)
    // que NUNCA existió en el FsStorageAdapter real bajo prueba — representa evidencia legacy (previa a esta
    // feature, solo metadatos).
    const o = await makePendingReviewOrder(prisma, { assignedTo: T.id, evidenceCount: 1 });
    const row = await prisma.orderEvidence.findFirstOrThrow({ where: { orderId: o.id } });
    const res = await getEvidence(app, o.id, row.id, techTok);
    expect(res.status).toBe(410);
    expect(res.body.code).toBe('EVIDENCE_GONE');
  });
});
