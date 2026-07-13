import { describe, it, expect, afterAll } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { SEED_USERS } from '../../prisma/seed-data';
import { makeTestApp } from '../helpers/test-app';
import { makeOrder } from '../helpers/transition';
import { PrismaOrderExecutionRepository } from '../../src/infra/repositories/order-write-side-repository';

// T021 (005, US2, SC-006/FR-006) — atomicidad todo-o-nada: si falla la inserción de auditoría, evidencia o
// notas (por separado), la orden NO transiciona y no quedan filas nuevas de ese intento en las 3 tablas.
const { prisma } = makeTestApp();
afterAll(async () => {
  await prisma.$disconnect();
});

const T = SEED_USERS.technician;

// Envuelve el PrismaClient para que un modelo concreto reviente DENTRO de la $transaction (fuerza rollback).
type FailStep = 'orderAudit' | 'orderEvidence' | 'orderExecutionNotes';
function faultyPrisma(step: FailStep): PrismaClient {
  const handler: ProxyHandler<PrismaClient> = {
    get(target, prop, receiver) {
      if (prop === '$transaction') {
        return (fn: (tx: unknown) => unknown) =>
          (target.$transaction as (f: (tx: unknown) => unknown) => unknown)((tx) => {
            const txProxy = new Proxy(tx as Record<string, unknown>, {
              get(t, p) {
                if (p === step) {
                  return {
                    create: async () => {
                      throw new Error('boom');
                    },
                    createMany: async () => {
                      throw new Error('boom');
                    },
                  };
                }
                return Reflect.get(t, p);
              },
            });
            return fn(txProxy);
          });
      }
      return Reflect.get(target, prop, receiver);
    },
  };
  return new Proxy(prisma, handler);
}

async function expectNoEffect(orderId: string): Promise<void> {
  const fresh = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  expect(fresh.status).toBe('in_progress'); // sin transición
  expect(fresh.version).toBe(1); // version intacta
  expect(await prisma.orderAudit.count({ where: { orderId } })).toBe(0);
  expect(await prisma.orderEvidence.count({ where: { orderId } })).toBe(0);
  expect(await prisma.orderExecutionNotes.count({ where: { orderId } })).toBe(0);
}

const cmd = (orderId: string) => ({
  orderId,
  actorId: T.id,
  notes: 'notas de ejecución',
  evidence: [{ objectRef: 'ref/atomic', contentType: 'image/jpeg', sizeBytes: 100 }],
});

describe('submitOrderExecution — atomicidad (005, SC-006)', () => {
  for (const step of ['orderAudit', 'orderEvidence', 'orderExecutionNotes'] as const) {
    it(`fallo en la inserción de ${step} → rollback total, sin efecto`, async () => {
      const o = await makeOrder(prisma, { status: 'in_progress', assignedTo: T.id, version: 1 });
      const repo = new PrismaOrderExecutionRepository(faultyPrisma(step));
      await expect(repo.submitExecution(cmd(o.id))).rejects.toThrow();
      await expectNoEffect(o.id);
    });
  }
});
