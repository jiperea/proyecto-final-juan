import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import request from 'supertest';
import { SEED_PASSWORD, SEED_USERS } from '../../prisma/seed-data';
import { makeTestApp } from '../helpers/test-app';
import { makeOrder } from '../helpers/transition';
import { uploadEvidence } from '../helpers/evidence';
import { corruptBytes, oversizedJpeg, validJpeg } from '../helpers/image-fixtures';

// T014 (024, US1, FR-020) — autz-primero en uploadOrderEvidence: (1) sin sesión→401; (2) no-dueño o estado
// ≠ in_progress → 404 uniforme ANTES de mirar el contenido; (3) SOLO si autorizado se valida forma/tipo/
// tamaño. Contraste explícito: el MISMO fichero inválido debe dar 404 (no 415/413/422) cuando el actor no
// está autorizado, y SÍ dar el código de validación correspondiente cuando el actor está autorizado — así
// se prueba que la precedencia es real y no solo "existe un 404 en alguna parte".
// RED: uploadOrderEvidence no existe (404 genérico de Express para TODOS los casos, sin cuerpo {code}); las
// aserciones de contraste (404 vs 415/413/422 según autorización) no pueden pasar hasta que el handler
// implemente la precedencia FR-020.
const { app, prisma } = makeTestApp();
afterAll(async () => {
  await prisma.$disconnect();
});

const T = SEED_USERS.technician; // dueño
const T2 = SEED_USERS.technician2; // no-dueño

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

describe('uploadOrderEvidence — autz-primero (024, US1, FR-020)', () => {
  it('no-dueño + fichero INVÁLIDO (corrupto) → 404 (nunca 422): la autz precede al contenido', async () => {
    const o = await makeOrder(prisma, { status: 'in_progress', assignedTo: T.id });
    const res = await uploadEvidence(app, o.id, tech2Tok, corruptBytes(), { contentType: 'image/jpeg' });
    expect(res.status).toBe(404);
    expect(res.body.code).not.toBe('INVALID_EVIDENCE');
  });

  it('no-dueño + fichero OVERSIZED → 404 (nunca 413): la autz precede al tamaño', async () => {
    const o = await makeOrder(prisma, { status: 'in_progress', assignedTo: T.id });
    const res = await uploadEvidence(app, o.id, tech2Tok, oversizedJpeg());
    expect(res.status).toBe(404);
    expect(res.body.code).not.toBe('PAYLOAD_TOO_LARGE');
  }, 20_000);

  it('no-dueño + content_type FUERA de allowlist → 404 (nunca 415): la autz precede al tipo', async () => {
    const o = await makeOrder(prisma, { status: 'in_progress', assignedTo: T.id });
    const res = await uploadEvidence(app, o.id, tech2Tok, validJpeg(), { contentType: 'image/gif' });
    expect(res.status).toBe(404);
    expect(res.body.code).not.toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('orden PROPIA pero NO in_progress (pending_review) + fichero inválido → 404 (nunca 422)', async () => {
    const o = await makeOrder(prisma, { status: 'pending_review', assignedTo: T.id });
    const res = await uploadEvidence(app, o.id, techTok, corruptBytes(), { contentType: 'image/jpeg' });
    expect(res.status).toBe(404);
    expect(res.body.code).not.toBe('INVALID_EVIDENCE');
  });

  it('orden PROPIA pero closed + fichero válido → 404 (fuera de alcance, no 201)', async () => {
    const o = await makeOrder(prisma, { status: 'closed', assignedTo: T.id });
    const res = await uploadEvidence(app, o.id, techTok, validJpeg());
    expect(res.status).toBe(404);
  });

  it('CONTRASTE: mismo fichero corrupto, mismo dueño+in_progress → 422 (no 404): la validación SÍ corre cuando autoriza', async () => {
    const o = await makeOrder(prisma, { status: 'in_progress', assignedTo: T.id });
    const res = await uploadEvidence(app, o.id, techTok, corruptBytes(), { contentType: 'image/jpeg' });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('INVALID_EVIDENCE');
  });

  it('orderId malformado → 404 (no-enumeración, igual que getOrderDetail)', async () => {
    const res = await uploadEvidence(app, 'no-es-uuid', techTok, validJpeg());
    expect(res.status).toBe(404);
  });

  it('sin sesión → 401 (precede a todo lo demás)', async () => {
    const o = await makeOrder(prisma, { status: 'in_progress', assignedTo: T.id });
    const res = await uploadEvidence(app, o.id, null, corruptBytes());
    expect(res.status).toBe(401);
  });
});
