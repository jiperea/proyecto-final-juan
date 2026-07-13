import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import request from 'supertest';
import { createLogger } from '../../src/infra/logger';
import { SEED_PASSWORD, SEED_USERS } from '../../prisma/seed-data';
import { makeTestApp } from '../helpers/test-app';
import { makeOrder } from '../helpers/transition';

// T024 (005, SC-007) — no-fuga de PII: notes y object_ref centinela NO aparecen en logs ni en el cuerpo de
// error; OrderAudit.reason = "execution_registered" (nunca el texto de las notas — Constitution XI).
const { app, prisma } = makeTestApp();
afterAll(async () => {
  await prisma.$disconnect();
});

const T = SEED_USERS.technician;
const SENTINEL_NOTES = 'PII_NOTES_SENTINEL_zzz';
const SENTINEL_REF = 'PII_OBJECTREF_SENTINEL_zzz';

let techTok = '';
beforeAll(async () => {
  const r = await request(app).post('/v1/auth/login').send({ identifier: T.email, password: SEED_PASSWORD });
  techTok = r.body.access_token;
});

describe('no-fuga de notes/object_ref (005, SC-007)', () => {
  it('el logger redacta notes y evidence[*].object_ref (top-level y anidado en req.body)', () => {
    const lines: string[] = [];
    const logger = createLogger({ stream: { write: (s: string) => lines.push(s) } });
    logger.info({ notes: SENTINEL_NOTES, object_ref: SENTINEL_REF }, 'top-level');
    logger.info(
      { req: { body: { notes: SENTINEL_NOTES, evidence: [{ object_ref: SENTINEL_REF }] } } },
      'req.body anidado',
    );
    logger.error({ err: { notes: SENTINEL_NOTES, cause: { object_ref: SENTINEL_REF } } }, 'error');
    const out = lines.join('');
    expect(out).not.toContain(SENTINEL_NOTES);
    expect(out).not.toContain(SENTINEL_REF);
    expect(out).toContain('[Redacted]');
  });

  it('el cuerpo de error (422) NO contiene el object_ref ni las notas centinela', async () => {
    const o = await makeOrder(prisma, { status: 'in_progress', assignedTo: T.id });
    const res = await request(app)
      .post(`/v1/orders/${o.id}/execution`)
      .set('Authorization', `Bearer ${techTok}`)
      .send({
        notes: SENTINEL_NOTES,
        evidence: [{ object_ref: SENTINEL_REF, content_type: 'image/gif', size_bytes: 1 }], // tipo inválido → 422
      });
    expect(res.status).toBe(422);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain(SENTINEL_NOTES);
    expect(body).not.toContain(SENTINEL_REF);
  });

  it('OrderAudit.reason = "execution_registered" (nunca el texto de las notas)', async () => {
    const o = await makeOrder(prisma, { status: 'in_progress', assignedTo: T.id });
    const res = await request(app)
      .post(`/v1/orders/${o.id}/execution`)
      .set('Authorization', `Bearer ${techTok}`)
      .send({
        notes: SENTINEL_NOTES,
        evidence: [{ object_ref: SENTINEL_REF, content_type: 'image/jpeg', size_bytes: 100 }],
      });
    expect(res.status).toBe(200);
    const audit = await prisma.orderAudit.findFirstOrThrow({ where: { orderId: o.id } });
    expect(audit.reason).toBe('execution_registered');
    expect(audit.reason).not.toContain(SENTINEL_NOTES);
    // Las notas SÍ se persisten (en su tabla aparte, payload PII), no en la auditoría.
    const notes = await prisma.orderExecutionNotes.findFirstOrThrow({ where: { orderId: o.id } });
    expect(notes.notes).toBe(SENTINEL_NOTES);
  });
});
