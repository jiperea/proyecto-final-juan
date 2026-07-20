// 026 (T009 · US1 · FR-009/FR-010) — Fase RED. Si `EVIDENCE_STORAGE_DIR` no existe o no es escribible AL
// ESCRIBIR el blob, el seed debe fallar con un mensaje ACCIONABLE que NOMBRA LA RUTA, y NO debe dejar una
// fila `OrderEvidence` sin su blob correspondiente (FR-010: blob antes que fila; si el blob falla, la fila
// nunca se crea).
//
// `seedEvidenceBlobForOrder` AÚN NO EXISTE (mismo contrato que en seed-evidence-blob-write.spec.ts) — hasta
// que `dev-backend` lo implemente, el import falla y TODO el fichero es rojo por la razón correcta.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { SEED_USERS } from '../../prisma/seed-data';
import { seedEvidenceBlobForOrder } from '../../prisma/seed';
import { FsStorageAdapter } from '../../src/infra/storage/fs-storage-adapter';
import { makeOrder } from '../helpers/transition';
import { testConfig } from '../helpers/test-app';
import { buildContainer } from '../../src/infra/container';

const ENC_KEY = testConfig().evidenceEncKey;
const clock = { now: (): Date => new Date() };

let prisma: PrismaClient;
let workDir: string;
beforeAll(() => {
  workDir = mkdtempSync(join(tmpdir(), 'fieldops-seed-evidence-badstore-'));
  ({ prisma } = buildContainer(testConfig({ evidenceStorageDir: workDir })));
});
afterAll(async () => {
  await prisma.$disconnect();
  await rm(workDir, { recursive: true, force: true });
});

describe('026 · almacén no escribible al escribir el blob (FR-009/FR-010)', () => {
  it('EVIDENCE_STORAGE_DIR inalcanzable (segmento padre es un fichero, no un directorio) → aborta nombrando la ruta, sin fila huérfana', async () => {
    // Fuerza que `mkdir(baseDir, {recursive:true})` falle: un segmento intermedio del path es un FICHERO,
    // no un directorio (ENOTDIR), simulando "no escribible/inalcanzable" de forma determinista y portable.
    const blockerFile = join(workDir, 'not-a-directory');
    writeFileSync(blockerFile, 'bloqueo');
    const unwritableBaseDir = join(blockerFile, 'evidence');

    const storage = new FsStorageAdapter({ baseDir: unwritableBaseDir, encKey: ENC_KEY, clock });
    const o = await makeOrder(prisma, { status: 'in_progress', assignedTo: SEED_USERS.technician.id });

    let thrown: Error | undefined;
    try {
      await seedEvidenceBlobForOrder({ prisma, storage, orderId: o.id, actorId: SEED_USERS.technician.id });
    } catch (e) {
      thrown = e as Error;
    }
    expect(thrown).toBeDefined();
    expect(thrown?.message).toContain(unwritableBaseDir); // nombra la ruta (FR-009)

    // Sin fila huérfana: el fallo de blob ocurre ANTES de insertar OrderEvidence (FR-010).
    const evidence = await prisma.orderEvidence.count({ where: { orderId: o.id } });
    expect(evidence).toBe(0);
  });
});
