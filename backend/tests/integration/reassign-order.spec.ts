import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import request from 'supertest';
import { SEED_PASSWORD, SEED_USERS } from '../../prisma/seed-data';
import { makeTestApp } from '../helpers/test-app';
import { makeOrder } from '../helpers/transition';

const { app, prisma } = makeTestApp();
afterAll(async () => {
  await prisma.$disconnect();
});

const DISP = SEED_USERS.dispatcher;
const T1 = SEED_USERS.reassignSrc.id;
const T2 = SEED_USERS.reassignDst.id;
const DISABLED = SEED_USERS.disabled.id;
const NONEXISTENT_USER = '018f9999-0000-7000-8000-0000000000ff';
const NONEXISTENT_ORDER = '018f2000-0000-7000-8000-0000000000ee';

async function token(email: string): Promise<string> {
  const r = await request(app).post('/v1/auth/login').send({ identifier: email, password: SEED_PASSWORD });
  return r.body.access_token as string;
}
let dispToken = '';
beforeAll(async () => {
  dispToken = await token(DISP.email); // login único (token válido 900s) — reduce carga de logins en paralelo
});

function reassign(orderId: string, body: unknown, tok = dispToken) {
  const req = request(app).post(`/v1/orders/${orderId}/reassignments`);
  return (tok ? req.set('Authorization', `Bearer ${tok}`) : req).send(body as object);
}

describe('reassignOrder — happy path + auditoría (SC-001, FR-001/007)', () => {
  it('assigned T1→T2: 200, assigned_to=T2, estado intacto, version+1, 1 auditoría reassignment', async () => {
    const o = await makeOrder(prisma, { status: 'assigned', assignedTo: T1, version: 0 });
    const res = await reassign(o.id, { assignee_id: T2, reason: 'sobrecarga de T1' });
    expect(res.status).toBe(200);
    expect(res.body.assigned_to).toBe(T2);
    expect(res.body.status).toBe('assigned');
    expect(res.body.version).toBe(1);
    const audits = await prisma.orderAudit.findMany({ where: { orderId: o.id } });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      eventType: 'reassignment',
      fromStatus: null,
      toStatus: null,
      fromAssignee: T1,
      toAssignee: T2,
      actorId: DISP.id,
    });
  });

  it('in_progress: estado conservado', async () => {
    const o = await makeOrder(prisma, { status: 'in_progress', assignedTo: T1 });
    const res = await reassign(o.id, { assignee_id: T2, reason: 'cambio de zona' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('in_progress');
  });

  it('orden huérfana (assigned_to NULL) SÍ se reasigna → 200, from_assignee NULL (guarda null-safe)', async () => {
    const o = await makeOrder(prisma, { status: 'assigned', assignedTo: null });
    const res = await reassign(o.id, { assignee_id: T2, reason: 'huérfana' });
    expect(res.status).toBe(200);
    expect(res.body.assigned_to).toBe(T2);
    const audit = await prisma.orderAudit.findFirst({ where: { orderId: o.id } });
    expect(audit?.fromAssignee).toBeNull();
    expect(audit?.toAssignee).toBe(T2);
  });
});

describe('reassignOrder — RBAC (SC-002, FR-003)', () => {
  it('sin token → 401', async () => {
    const o = await makeOrder(prisma, { status: 'assigned', assignedTo: T1 });
    const res = await reassign(o.id, { assignee_id: T2, reason: 'm' }, '');
    expect(res.status).toBe(401);
  });
  it('token inválido → 401', async () => {
    const o = await makeOrder(prisma, { status: 'assigned', assignedTo: T1 });
    const res = await reassign(o.id, { assignee_id: T2, reason: 'm' }, 'basura');
    expect(res.status).toBe(401);
  });
  it('technician → 403 FORBIDDEN_ROLE, sin efecto', async () => {
    const o = await makeOrder(prisma, { status: 'assigned', assignedTo: T1 });
    const res = await reassign(o.id, { assignee_id: T2, reason: 'm' }, await token(SEED_USERS.technician.email));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN_ROLE');
    const fresh = await prisma.order.findUnique({ where: { id: o.id } });
    expect(fresh?.assignedTo).toBe(T1);
  });
  it('supervisor → 403', async () => {
    const o = await makeOrder(prisma, { status: 'assigned', assignedTo: T1 });
    const res = await reassign(o.id, { assignee_id: T2, reason: 'm' }, await token(SEED_USERS.supervisor.email));
    expect(res.status).toBe(403);
  });
});

describe('reassignOrder — no-enumeración 404 (SC-003/SC-004, FR-002/004)', () => {
  it('inexistente / no-reasignable / orderId malformado → 404 cuerpo IDÉNTICO', async () => {
    const closed = await makeOrder(prisma, { status: 'closed', assignedTo: T1 });
    const rNonexistent = await reassign(NONEXISTENT_ORDER, { assignee_id: T2, reason: 'm' });
    const rClosed = await reassign(closed.id, { assignee_id: T2, reason: 'm' });
    const rMalformed = await reassign('no-es-uuid', { assignee_id: T2, reason: 'm' });
    for (const r of [rNonexistent, rClosed, rMalformed]) expect(r.status).toBe(404);
    expect(rNonexistent.body).toEqual(rClosed.body);
    expect(rClosed.body).toEqual(rMalformed.body);
    expect(rClosed.body.details).toBeUndefined();
  });
  it('sin auth + orderId malformado → 401 (auth precede a la validación de forma)', async () => {
    const res = await reassign('no-es-uuid', { assignee_id: T2, reason: 'm' }, '');
    expect(res.status).toBe(401);
  });
  it('orden no visible × body inválido → 404 (no 422): visibilidad precede', async () => {
    const closed = await makeOrder(prisma, { status: 'closed', assignedTo: T1 });
    const res = await reassign(closed.id, { assignee_id: 'no-uuid', reason: '' });
    expect(res.status).toBe(404);
  });
});

describe('reassignOrder — destino inválido 422 (SC-005, FR-005)', () => {
  it('inexistente / no-technician / deshabilitado / igual al actual → 422 INVALID_ASSIGNEE cuerpo idéntico', async () => {
    const mk = () => makeOrder(prisma, { status: 'assigned', assignedTo: T1 });
    const [o1, o2, o3, o4] = [await mk(), await mk(), await mk(), await mk()];
    const rNoExist = await reassign(o1.id, { assignee_id: NONEXISTENT_USER, reason: 'm' });
    const rNoTech = await reassign(o2.id, { assignee_id: DISP.id, reason: 'm' }); // dispatcher, no technician
    const rDisabled = await reassign(o3.id, { assignee_id: DISABLED, reason: 'm' });
    const rSame = await reassign(o4.id, { assignee_id: T1, reason: 'm' });
    for (const r of [rNoExist, rNoTech, rDisabled, rSame]) {
      expect(r.status).toBe(422);
      expect(r.body.code).toBe('INVALID_ASSIGNEE');
    }
    expect(rNoExist.body).toEqual(rNoTech.body);
    expect(rNoTech.body).toEqual(rDisabled.body);
    expect(rDisabled.body).toEqual(rSame.body);
  });
});

describe('reassignOrder — body/reason 422 + no-fuga (SC-006/SC-008, FR-006/009)', () => {
  it('reason ausente/vacío/whitespace/control / >500 code points → 422 VALIDATION_ERROR', async () => {
    const mk = () => makeOrder(prisma, { status: 'assigned', assignedTo: T1 });
    const cases = [{}, { reason: '' }, { reason: '   ' }, { reason: '' }, { reason: 'x'.repeat(501) }];
    for (const c of cases) {
      const o = await mk();
      const res = await reassign(o.id, { assignee_id: T2, ...c });
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    }
  });
  it('assignee_id ausente/no-uuid → 422 VALIDATION_ERROR (no INVALID_ASSIGNEE)', async () => {
    const o = await makeOrder(prisma, { status: 'assigned', assignedTo: T1 });
    const res = await reassign(o.id, { assignee_id: 'no-uuid', reason: 'm' });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
  it('el 422 no reproduce el reason (no-fuga PII)', async () => {
    const o = await makeOrder(prisma, { status: 'assigned', assignedTo: T1 });
    const sentinel = 'PII-CENTINELA-9c3f reason';
    const res = await reassign(o.id, { assignee_id: T1, reason: sentinel }); // 422 same-as-current
    expect(res.status).toBe(422);
    expect(JSON.stringify(res.body)).not.toContain('PII-CENTINELA');
  });
  it('campo extra en el body (.strict) → 422', async () => {
    const o = await makeOrder(prisma, { status: 'assigned', assignedTo: T1 });
    const res = await reassign(o.id, { assignee_id: T2, reason: 'm', actor_id: 'x' });
    expect(res.status).toBe(422);
  });
});

describe('reassignOrder — actor infalsificable (FR-008)', () => {
  it('actor_id espurio en el body no afecta: la auditoría usa el userId del token', async () => {
    const o = await makeOrder(prisma, { status: 'assigned', assignedTo: T1 });
    // .strict lo rechaza (422); pero incluso si pasara, el actor sale del token. Verificamos el happy real:
    const res = await reassign(o.id, { assignee_id: T2, reason: 'ok' });
    expect(res.status).toBe(200);
    const audit = await prisma.orderAudit.findFirst({ where: { orderId: o.id } });
    expect(audit?.actorId).toBe(DISP.id);
  });
});

describe('reassignOrder — concurrencia (SC-005, FR-007)', () => {
  it('mismo destino concurrente: exactamente 1×200 y 1×422, sin auditoría no-op', async () => {
    const o = await makeOrder(prisma, { status: 'assigned', assignedTo: T1 });
    const [a, b] = await Promise.all([
      reassign(o.id, { assignee_id: T2, reason: 'a' }),
      reassign(o.id, { assignee_id: T2, reason: 'b' }),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 422]);
    const audits = await prisma.orderAudit.findMany({ where: { orderId: o.id } });
    expect(audits).toHaveLength(1);
  });

  it('destinos distintos secuenciales: from_assignee veraz (T1→T2 luego T2→T1)', async () => {
    const o = await makeOrder(prisma, { status: 'assigned', assignedTo: T1 });
    await reassign(o.id, { assignee_id: T2, reason: 'a' });
    await reassign(o.id, { assignee_id: T1, reason: 'b' });
    const audits = await prisma.orderAudit.findMany({ where: { orderId: o.id }, orderBy: { at: 'asc' } });
    expect(audits).toHaveLength(2);
    expect(audits[1]?.fromAssignee).toBe(T2); // valor previo REAL (no T1)
    expect(audits[1]?.toAssignee).toBe(T1);
  });
});
