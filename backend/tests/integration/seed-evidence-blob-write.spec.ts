// 026 (T005 · US1 · FR-001/FR-007/FR-010) — Fase RED. El seed debe escribir el blob de evidencia vía el
// MISMO `StoragePort`/adaptador cifrado que `uploadOrderEvidence` (024), usando en la fila `OrderEvidence`
// el `object_ref` DEVUELTO por `putStaged` (no un placeholder), con el blob escrito ANTES que la fila y las
// escrituras de BD en UNA transacción (interrupción ⇒ BD vacía para esa orden).
//
// `seedEvidenceBlobForOrder`/`EMBEDDED_EVIDENCE_IMAGE` AÚN NO EXISTEN en `backend/prisma/seed.ts` — los crea
// `dev-backend` (T007) con el contrato esperado:
//   export const EMBEDDED_EVIDENCE_IMAGE: Buffer; // JPEG válido, ≤2048 bytes, constante embebida
//   export interface SeedEvidenceBlobDeps { prisma: PrismaClient; storage: StoragePort; orderId: string; actorId: string }
//   export interface SeedEvidenceBlobResult { auditId: string; evidenceId: string; objectRef: string }
//   export async function seedEvidenceBlobForOrder(deps: SeedEvidenceBlobDeps): Promise<SeedEvidenceBlobResult>
// Hasta entonces el import falla y TODO el fichero es rojo por la razón correcta (la función no existe).
import { mkdtempSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { v7 as uuidv7 } from 'uuid';
import type { PrismaClient } from '@prisma/client';
import { SEED_USERS } from '../../prisma/seed-data';
import { EMBEDDED_EVIDENCE_IMAGE, seedEvidenceBlobForOrder } from '../../prisma/seed';
import { FsStorageAdapter } from '../../src/infra/storage/fs-storage-adapter';
import { makeOrder } from '../helpers/transition';
import { testConfig } from '../helpers/test-app';
import { buildContainer } from '../../src/infra/container';

const storageDir = mkdtempSync(join(tmpdir(), 'fieldops-seed-evidence-write-'));
const ENC_KEY = testConfig().evidenceEncKey;
const clock = { now: (): Date => new Date() };
const storage = new FsStorageAdapter({ baseDir: storageDir, encKey: ENC_KEY, clock });

let prisma: PrismaClient;
beforeAll(() => {
  ({ prisma } = buildContainer(testConfig({ evidenceStorageDir: storageDir })));
});
afterAll(async () => {
  await prisma.$disconnect();
  await rm(storageDir, { recursive: true, force: true });
});

describe('026 · seedEvidenceBlobForOrder — blob real + fila (FR-001/FR-007/FR-010)', () => {
  it('escribe el blob vía putStaged y se lee/descifra de vuelta con los mismos bytes embebidos', async () => {
    const o = await makeOrder(prisma, { status: 'in_progress', assignedTo: SEED_USERS.technician.id });
    const result = await seedEvidenceBlobForOrder({
      prisma,
      storage,
      orderId: o.id,
      actorId: SEED_USERS.technician.id,
    });

    const handle = await storage.signRead(result.objectRef, 300);
    const read = await storage.read(handle);
    expect(Buffer.isBuffer(read)).toBe(true);
    expect((read as Buffer).equals(EMBEDDED_EVIDENCE_IMAGE)).toBe(true);
  });

  it('la fila OrderEvidence usa el object_ref DEVUELTO por putStaged (no un placeholder fijo)', async () => {
    const o = await makeOrder(prisma, { status: 'in_progress', assignedTo: SEED_USERS.technician.id });
    const result = await seedEvidenceBlobForOrder({
      prisma,
      storage,
      orderId: o.id,
      actorId: SEED_USERS.technician.id,
    });

    const row = await prisma.orderEvidence.findUnique({ where: { id: result.evidenceId } });
    expect(row).not.toBeNull();
    expect(row?.objectRef).toBe(result.objectRef);
    expect(row?.objectRef).not.toMatch(/^018f2000-0000-7000-8000-0000000000a1-ev1$/); // no el placeholder legacy
    expect(row?.auditId).toBe(result.auditId);
  });

  it('atomicidad: interrupción a mitad de la escritura de BD deja la BD VACÍA para esa orden (blob puede quedar huérfano)', async () => {
    const o = await makeOrder(prisma, { status: 'in_progress', assignedTo: SEED_USERS.technician.id });
    const nonexistentActor = uuidv7(); // FK actorId→User inexistente ⇒ P2003 a mitad de la transacción

    await expect(
      seedEvidenceBlobForOrder({ prisma, storage, orderId: o.id, actorId: nonexistentActor }),
    ).rejects.toThrow();

    const audits = await prisma.orderAudit.count({ where: { orderId: o.id } });
    const evidence = await prisma.orderEvidence.count({ where: { orderId: o.id } });
    const notes = await prisma.orderExecutionNotes.count({ where: { orderId: o.id } });
    // «BD poblada ⟺ seed completo»: la transacción revierte, no queda fila parcial ni evidencia sin fila.
    expect(audits).toBe(0);
    expect(evidence).toBe(0);
    expect(notes).toBe(0);
  });
});
