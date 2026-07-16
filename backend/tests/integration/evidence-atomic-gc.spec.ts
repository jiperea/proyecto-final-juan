import { mkdtempSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PrismaClient } from '@prisma/client';
import { describe, it, expect, afterAll } from 'vitest';
import { SEED_USERS } from '../../prisma/seed-data';
import { makeTestApp, testConfig } from '../helpers/test-app';
import { makeOrder } from '../helpers/transition';
import { stageBlob } from '../helpers/evidence-storage';
import { validJpeg } from '../helpers/image-fixtures';
import { FsStorageAdapter } from '../../src/infra/storage/fs-storage-adapter';
import { PrismaOrderExecutionRepository } from '../../src/infra/repositories/order-write-side-repository';

// T050 (024, US1/US3, FR-011) — atomicidad realista: el blob se escribe PRIMERO (staging, fuera de la
// transacción PG); la transacción de Postgres (transición+auditoría+evidencia+notas) es la ÚNICA verdad
// de si la evidencia "cuenta". (a) Si esa transacción falla y hace rollback DESPUÉS de que el blob ya
// existe, el blob queda HUÉRFANO (sin fila) — candidato del GC de FR-024 (aquí solo se afirma el estado
// huérfano; el GC en sí es de US3, `evidence-staging-gc.spec.ts`). (b) Invariante "si no hay blob, no se
// crea fila": si el blob referenciado ya no existe en el store (p. ej. purgado por el GC entre el staging y
// el submit), `submitOrderExecution` DEBE re-verificar su existencia DENTRO de la transacción (FR-023.c) y
// rechazar — nunca crear una fila `OrderEvidence` que apunte a un blob inexistente.
// RED: `submitOrderExecution` HOY no toca el `StoragePort` en absoluto (solo valida el FORMATO del
// object_ref) → (b) falla: crea la fila igualmente aunque el blob ya no exista.
// Sincrónico (no `beforeAll`): `makeTestApp` se invoca en la carga del módulo.
const storageDir = mkdtempSync(join(tmpdir(), 'fieldops-evidence-atomic-gc-'));
afterAll(async () => {
  await rm(storageDir, { recursive: true, force: true });
});

const ENC_KEY = testConfig().evidenceEncKey;
const { prisma } = makeTestApp({ evidenceStorageDir: storageDir });
afterAll(async () => {
  await prisma.$disconnect();
});

const T = SEED_USERS.technician;
const clockNow = { now: (): Date => new Date() };
const storage = new FsStorageAdapter({ baseDir: storageDir, encKey: ENC_KEY, clock: clockNow });

function stage(orderId: string) {
  return stageBlob({
    baseDir: storageDir,
    encKey: ENC_KEY,
    ownerId: T.id,
    orderId,
    bytes: validJpeg(),
    contentType: 'image/jpeg',
  });
}

// Mismo patrón que submit-execution-atomicity.spec.ts: fuerza el fallo de un paso DENTRO de la $transaction.
function faultyPrisma(step: 'orderEvidence'): PrismaClient {
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

const cmd = (orderId: string, objectRef: string) => ({
  orderId,
  actorId: T.id,
  notes: 'evidencia real, fallo simulado en la transacción',
  evidence: [{ objectRef, contentType: 'image/jpeg', sizeBytes: 256 }],
});

describe('evidencia — atomicidad realista y GC (024, US1/US3, FR-011)', () => {
  it('rollback tras staging: el blob SOBREVIVE (huérfano, sin fila) — candidato del GC de FR-024', async () => {
    const o = await makeOrder(prisma, { status: 'in_progress', assignedTo: T.id, version: 1 });
    const ref = await stage(o.id);

    const repo = new PrismaOrderExecutionRepository(faultyPrisma('orderEvidence'));
    await expect(repo.submitExecution(cmd(o.id, ref))).rejects.toThrow();

    // Sin efecto en Postgres (control, igual que submit-execution-atomicity.spec.ts).
    const fresh = await prisma.order.findUniqueOrThrow({ where: { id: o.id } });
    expect(fresh.status).toBe('in_progress');
    expect(fresh.version).toBe(1);
    expect(await prisma.orderEvidence.count({ where: { orderId: o.id } })).toBe(0);

    // El blob SIGUE en el store (nadie lo borró): huérfano — sin fila que lo reclame (candidato de GC).
    const listed = await storage.list();
    expect(listed.some((s) => s.objectRef === ref)).toBe(true);
  });

  it('si el blob referenciado ya no existe en el store, submitOrderExecution NO debe crear la fila (FR-023.c)', async () => {
    const o = await makeOrder(prisma, { status: 'in_progress', assignedTo: T.id, version: 1 });
    const ref = await stage(o.id);
    await storage.delete(ref); // simula que el GC (FR-024, US3) ya purgó este blob huérfano/abandonado

    const repo = new PrismaOrderExecutionRepository(prisma); // prisma real, sin fallo inyectado
    const res = await repo.submitExecution(cmd(o.id, ref));

    // Invariante FR-011: "no hay blob sin fila que lo reclame" implica, a la inversa, que el submit no debe
    // COMMITEAR una fila nueva cuyo blob ya no existe (eso dejaría una fila-y-blob descoordinados para el
    // lector recién creado, distinto del caso legítimo de retención/superado → 410).
    expect(res.ok).toBe(false);
    expect(await prisma.orderEvidence.count({ where: { orderId: o.id } })).toBe(0);
    const fresh = await prisma.order.findUniqueOrThrow({ where: { id: o.id } });
    expect(fresh.status).toBe('in_progress'); // sin transición si la evidencia no es válida
  });
});
