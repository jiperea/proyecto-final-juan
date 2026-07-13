import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import request from 'supertest';
import { SEED_PASSWORD, SEED_USERS } from '../../prisma/seed-data';
import { makeTestApp } from '../helpers/test-app';
import { makeOrder } from '../helpers/transition';

// T020 (005, US2) — integración de submitOrderExecution. Happy path atómico + precedencia PAYLOAD PRIMERO
// (401→403→422 payload→404 pertenencia→422 estado; evidencia antes que notas). Postgres real.
const { app, prisma } = makeTestApp();
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
let dispTok = '';
beforeAll(async () => {
  techTok = await token(T.email);
  dispTok = await token(SEED_USERS.dispatcher.email);
});

const validBody = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  notes: 'trabajo terminado, equipo operativo',
  evidence: [{ object_ref: `ref/${Math.random()}`, content_type: 'image/jpeg', size_bytes: 2048 }],
  ...over,
});

function exec(orderId: string, body: unknown, tok: string | null = techTok) {
  const req = request(app).post(`/v1/orders/${orderId}/execution`);
  return (tok ? req.set('Authorization', `Bearer ${tok}`) : req).send(body as object);
}

describe('submitOrderExecution — integración (005, US2)', () => {
  it('happy path → 200 pending_review, version+1, 1 auditoría reason opaco, 1 notas, ≥1 evidencia enlazadas', async () => {
    const o = await makeOrder(prisma, { status: 'in_progress', assignedTo: T.id, version: 2 });
    const res = await exec(o.id, validBody());
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('pending_review');
    expect(res.body.version).toBe(3);

    const audits = await prisma.orderAudit.findMany({ where: { orderId: o.id } });
    expect(audits.length).toBe(1);
    const audit = audits[0];
    expect(audit?.eventType).toBe('transition');
    expect(audit?.fromStatus).toBe('in_progress');
    expect(audit?.toStatus).toBe('pending_review');
    expect(audit?.reason).toBe('execution_registered'); // marcador opaco, no el texto de notas

    const ev = await prisma.orderEvidence.findMany({ where: { orderId: o.id } });
    expect(ev.length).toBe(1);
    expect(ev[0]?.auditId).toBe(audit?.id); // evidencia enlazada a la auditoría (XI)
    expect(ev[0]?.uploadedBy).toBe(T.id); // del token, no del body

    const notes = await prisma.orderExecutionNotes.findMany({ where: { orderId: o.id } });
    expect(notes.length).toBe(1);
    expect(notes[0]?.auditId).toBe(audit?.id);
    expect(notes[0]?.createdBy).toBe(T.id);
    expect(notes[0]?.notes).toBe('trabajo terminado, equipo operativo');
  });

  it('acepta hasta 10 evidencias', async () => {
    const o = await makeOrder(prisma, { status: 'in_progress', assignedTo: T.id });
    const evidence = Array.from({ length: 10 }, (_, i) => ({
      object_ref: `ref/multi/${i}`,
      content_type: 'image/png',
      size_bytes: 100,
    }));
    const res = await exec(o.id, validBody({ evidence }));
    expect(res.status).toBe(200);
    expect(await prisma.orderEvidence.count({ where: { orderId: o.id } })).toBe(10);
  });

  it('0 evidencias → 422 EVIDENCE_REQUIRED, sin efecto', async () => {
    const o = await makeOrder(prisma, { status: 'in_progress', assignedTo: T.id, version: 1 });
    const res = await exec(o.id, validBody({ evidence: [] }));
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('EVIDENCE_REQUIRED');
    const after = await prisma.order.findUniqueOrThrow({ where: { id: o.id } });
    expect(after.status).toBe('in_progress');
    expect(after.version).toBe(1);
  });

  it('content_type fuera de allowlist → 422 INVALID_EVIDENCE', async () => {
    const o = await makeOrder(prisma, { status: 'in_progress', assignedTo: T.id });
    const res = await exec(o.id, validBody({ evidence: [{ object_ref: 'r', content_type: 'image/gif', size_bytes: 10 }] }));
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('INVALID_EVIDENCE');
  });

  it('object_ref duplicados → 422 INVALID_EVIDENCE', async () => {
    const o = await makeOrder(prisma, { status: 'in_progress', assignedTo: T.id });
    const dup = { object_ref: 'same', content_type: 'image/jpeg', size_bytes: 10 };
    const res = await exec(o.id, validBody({ evidence: [dup, { ...dup }] }));
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('INVALID_EVIDENCE');
  });

  it('> 10 evidencias → 422 INVALID_EVIDENCE', async () => {
    const o = await makeOrder(prisma, { status: 'in_progress', assignedTo: T.id });
    const evidence = Array.from({ length: 11 }, (_, i) => ({ object_ref: `r${i}`, content_type: 'image/jpeg', size_bytes: 1 }));
    const res = await exec(o.id, validBody({ evidence }));
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('INVALID_EVIDENCE');
  });

  it('notas vacías → 422 VALIDATION_ERROR', async () => {
    const o = await makeOrder(prisma, { status: 'in_progress', assignedTo: T.id });
    const res = await exec(o.id, validBody({ notes: '   ' }));
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('notas > 2000 → 422 VALIDATION_ERROR', async () => {
    const o = await makeOrder(prisma, { status: 'in_progress', assignedTo: T.id });
    const res = await exec(o.id, validBody({ notes: 'a'.repeat(2001) }));
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('orden AJENA con payload VÁLIDO → 404 (pertenencia; nunca 422)', async () => {
    const o = await makeOrder(prisma, { status: 'in_progress', assignedTo: T2.id });
    const res = await exec(o.id, validBody());
    expect(res.status).toBe(404);
    expect(res.body.code).not.toBe('INVALID_TRANSITION');
  });

  it('orden AJENA con payload INVÁLIDO → 422 (payload primero, no revela el recurso)', async () => {
    const o = await makeOrder(prisma, { status: 'in_progress', assignedTo: T2.id });
    const res = await exec(o.id, validBody({ evidence: [] }));
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('EVIDENCE_REQUIRED');
  });

  it('orden PROPIA en estado no legal (assigned/pending_review/closed) con payload válido → 422 INVALID_TRANSITION', async () => {
    for (const status of ['assigned', 'pending_review', 'closed'] as const) {
      const o = await makeOrder(prisma, { status, assignedTo: T.id });
      const res = await exec(o.id, validBody());
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('INVALID_TRANSITION');
    }
  });

  it('orderId malformado con payload válido → 404', async () => {
    const res = await exec('no-es-uuid', validBody());
    expect(res.status).toBe(404);
  });

  it('orderId malformado + payload INVÁLIDO → 422 (payload primero, H-003)', async () => {
    const res = await exec('no-es-uuid', validBody({ evidence: [] }));
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('EVIDENCE_REQUIRED');
  });

  it('actor en el body (uploaded_by/created_by/actor_id) → rechazado por .strict() (422)', async () => {
    const o = await makeOrder(prisma, { status: 'in_progress', assignedTo: T.id, version: 1 });
    const res = await exec(o.id, validBody({ uploaded_by: T2.id }));
    expect(res.status).toBe(422);
    const after = await prisma.order.findUniqueOrThrow({ where: { id: o.id } });
    expect(after.status).toBe('in_progress'); // sin efecto
    expect(after.version).toBe(1);
  });

  it('dispatcher → 403; sin token → 401', async () => {
    const o = await makeOrder(prisma, { status: 'in_progress', assignedTo: T.id });
    expect((await exec(o.id, validBody(), dispTok)).status).toBe(403);
    expect((await exec(o.id, validBody(), null)).status).toBe(401);
  });
});
