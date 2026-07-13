// T029 (008/#010, Polish) — snapshot atómico bajo concurrencia (FR-003/FR-005, D4). Interleaving
// DETERMINISTA (dos clientes Prisma con una tx en vuelo retenida por señales, NO timing real): el reader
// corre en REPEATABLE READ, así que un submit/reasignación NO comiteado no entra en su snapshot → motivo y
// notas quedan del MISMO ciclo y el guard de propiedad es coherente con lo servido (anti ex-dueño, anti híbrido).
import { PrismaClient } from '@prisma/client';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { SEED_PASSWORD, SEED_USERS } from '../../prisma/seed-data';
import { makeTestApp } from '../helpers/test-app';
import { makeRejectedOrder } from '../helpers/transition';

const { app, prisma } = makeTestApp();
const blocker = new PrismaClient();
afterAll(async () => {
  await blocker.$disconnect();
  await prisma.$disconnect();
});

async function token(email: string): Promise<string> {
  const r = await request(app).post('/v1/auth/login').send({ identifier: email, password: SEED_PASSWORD });
  return r.body.access_token as string;
}
function get(id: string, tok: string): request.Test {
  return request(app).get(`/v1/orders/${id}`).set('Authorization', `Bearer ${tok}`);
}

let t1Tok = '';
beforeAll(async () => {
  t1Tok = await token(SEED_USERS.technician.email);
});

// Ejecuta `mutate` dentro de una tx del `blocker` que se retiene abierta (sin commit) mientras corre `during`.
async function withInFlightTx(
  mutate: (tx: PrismaClient) => Promise<void>,
  during: () => Promise<void>,
): Promise<void> {
  let signalDone!: () => void;
  const mutated = new Promise<void>((r) => (signalDone = r));
  let release!: () => void;
  const released = new Promise<void>((r) => (release = r));
  const txPromise = blocker.$transaction(
    async (tx) => {
      await mutate(tx as unknown as PrismaClient);
      signalDone(); // la mutación ya corrió (sin commit)
      await released; // mantener la tx abierta
    },
    { timeout: 20_000 },
  );
  await mutated;
  try {
    await during();
  } finally {
    release();
    await txPromise;
  }
}

describe('getOrderDetail — snapshot atómico bajo concurrencia (FR-003/FR-005, D4)', () => {
  it('GET vs submitOrderExecution EN VUELO → motivo + notas del MISMO ciclo (sin híbrido)', async () => {
    const o = await makeRejectedOrder(prisma, {
      assignedTo: SEED_USERS.technician.id,
      reason: 'MOTIVO_VIGENTE',
      notes: 'NOTAS_CICLO_ACTUAL',
    });
    await withInFlightTx(
      async (tx) => {
        // Reenvío (nuevo ciclo) en vuelo: nuevo submit + notas, con `at` posterior, SIN comitear.
        const newAudit = uuidv7();
        await tx.orderAudit.create({
          data: {
            id: newAudit,
            orderId: o.id,
            actorId: SEED_USERS.technician.id,
            eventType: 'transition',
            fromStatus: 'in_progress',
            toStatus: 'pending_review',
            reason: 'execution_registered',
            at: new Date('2026-07-06T00:00:00Z'),
          },
        });
        await tx.orderExecutionNotes.create({
          data: {
            id: uuidv7(),
            orderId: o.id,
            auditId: newAudit,
            notes: 'NOTAS_NUEVO_CICLO',
            createdBy: SEED_USERS.technician.id,
            at: new Date('2026-07-06T00:00:00Z'),
          },
        });
      },
      async () => {
        const res = await get(o.id, t1Tok);
        expect(res.status).toBe(200);
        // El reader NO ve el submit no comiteado → sirve el ciclo N: motivo + notas coherentes.
        expect(res.body.last_rejection_reason).toBe('MOTIVO_VIGENTE');
        expect(res.body.notes).toBe('NOTAS_CICLO_ACTUAL');
      },
    );
  });

  it('GET vs reasignación EN VUELO → guard + motivo del mismo snapshot (sin fuga híbrida)', async () => {
    const o = await makeRejectedOrder(prisma, {
      assignedTo: SEED_USERS.technician.id,
      reason: 'MOTIVO_DUENO_ACTUAL',
      notes: 'NOTAS_DUENO_ACTUAL',
    });
    await withInFlightTx(
      async (tx) => {
        await tx.order.update({
          where: { id: o.id },
          data: { assignedTo: SEED_USERS.technician2.id, version: { increment: 1 } },
        });
      },
      async () => {
        const res = await get(o.id, t1Tok);
        // T1 sigue como dueño en el snapshot consistente (reasignación no comiteada) → 200 coherente:
        // guard(assigned_to) y motivo/notas del MISMO instante. No hay estado donde guard=T2 y motivo→T1.
        expect(res.status).toBe(200);
        expect(res.body.order.assigned_to).toBe(SEED_USERS.technician.id);
        expect(res.body.last_rejection_reason).toBe('MOTIVO_DUENO_ACTUAL');
        expect(res.body.notes).toBe('NOTAS_DUENO_ACTUAL');
      },
    );
  });

  it('reasignación YA comiteada → el ex-dueño obtiene 404 (no ve el motivo)', async () => {
    const o = await makeRejectedOrder(prisma, {
      assignedTo: SEED_USERS.technician.id,
      reason: 'MOTIVO_EX_DUENO',
    });
    await prisma.order.update({ where: { id: o.id }, data: { assignedTo: SEED_USERS.technician2.id } });
    const res = await get(o.id, t1Tok);
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toContain('MOTIVO_EX_DUENO');
  });
});
