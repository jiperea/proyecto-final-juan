import { describe, it, expect, afterAll } from 'vitest';
import { v7 as uuidv7 } from 'uuid';
import { SEED_USERS } from '../../prisma/seed-data';
import { makeTestApp } from '../helpers/test-app';
import { makeOrder } from '../helpers/transition';

// T006 (005) — verificación post-migración de la migración aditiva:
//  · order_evidence es APPEND-ONLY (rechaza UPDATE/DELETE, mismo patrón que order_audit).
//  · order_execution_notes es MUTABLE/purgable (permite UPDATE/DELETE, Constitution IX).
//  · FKs onDelete RESTRICT presentes en ambas tablas.
const { prisma } = makeTestApp();
afterAll(async () => {
  await prisma.$disconnect();
});

// Crea una orden + una auditoría de transición (FK destino de evidence/notes) y devuelve sus ids.
async function makeOrderWithAudit(): Promise<{ orderId: string; auditId: string }> {
  const o = await makeOrder(prisma, {
    status: 'in_progress',
    assignedTo: SEED_USERS.technician.id,
    version: 1,
  });
  const auditId = uuidv7();
  await prisma.orderAudit.create({
    data: {
      id: auditId,
      orderId: o.id,
      actorId: SEED_USERS.technician.id,
      eventType: 'transition',
      fromStatus: 'in_progress',
      toStatus: 'pending_review',
      reason: 'execution_registered',
    },
  });
  return { orderId: o.id, auditId };
}

describe('migración OrderEvidence/OrderExecutionNotes (005) — append-only vs purgable, FKs (T006)', () => {
  it('order_evidence rechaza UPDATE y DELETE (append-only, trigger de BD)', async () => {
    const { orderId, auditId } = await makeOrderWithAudit();
    const evId = uuidv7();
    await prisma.orderEvidence.create({
      data: {
        id: evId,
        orderId,
        auditId,
        objectRef: 'ref/opaco/001',
        contentType: 'image/jpeg',
        sizeBytes: 1024,
        uploadedBy: SEED_USERS.technician.id,
      },
    });
    await expect(
      prisma.orderEvidence.update({ where: { id: evId }, data: { sizeBytes: 2048 } }),
    ).rejects.toThrow();
    await expect(prisma.orderEvidence.delete({ where: { id: evId } })).rejects.toThrow();
  });

  it('order_execution_notes PERMITE UPDATE y DELETE (mutable/purgable, IX)', async () => {
    const { orderId, auditId } = await makeOrderWithAudit();
    const notesId = uuidv7();
    await prisma.orderExecutionNotes.create({
      data: {
        id: notesId,
        orderId,
        auditId,
        notes: 'notas de ejecución iniciales',
        createdBy: SEED_USERS.technician.id,
      },
    });
    // Purga/anonimización: UPDATE permitido.
    const updated = await prisma.orderExecutionNotes.update({
      where: { id: notesId },
      data: { notes: '[purged]' },
    });
    expect(updated.notes).toBe('[purged]');
    // DELETE permitido.
    await prisma.orderExecutionNotes.delete({ where: { id: notesId } });
    const gone = await prisma.orderExecutionNotes.findUnique({ where: { id: notesId } });
    expect(gone).toBeNull();
  });

  it('FKs onDelete RESTRICT presentes en order_evidence y order_execution_notes', async () => {
    const rows = await prisma.$queryRawUnsafe<Array<{ table_name: string; delete_rule: string }>>(
      `SELECT tc.table_name, rc.delete_rule
         FROM information_schema.table_constraints tc
         JOIN information_schema.referential_constraints rc
           ON tc.constraint_name = rc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_name IN ('order_evidence','order_execution_notes')`,
    );
    // 3 FKs por tabla (order/audit + users), todas RESTRICT.
    expect(rows.length).toBe(6);
    expect(rows.every((r) => r.delete_rule === 'RESTRICT')).toBe(true);
  });
});
