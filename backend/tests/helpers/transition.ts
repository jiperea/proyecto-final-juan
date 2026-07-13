import type { PrismaClient } from '@prisma/client';
import { v7 as uuidv7 } from 'uuid';
import type { OrderStatus } from '../../src/domain/order/model';

// Crea una orden aislada para tests de transición (ids únicos → sin colisión entre archivos/paralelo).
export async function makeOrder(
  prisma: PrismaClient,
  opts: { status: OrderStatus; assignedTo?: string | null; version?: number },
): Promise<{ id: string; version: number; status: OrderStatus; assignedTo: string | null }> {
  const o = await prisma.order.create({
    data: {
      id: uuidv7(),
      title: 'orden de prueba',
      description: 'descripción de prueba',
      status: opts.status,
      assignedTo: opts.assignedTo ?? null,
      version: opts.version ?? 0,
    },
  });
  return {
    id: o.id,
    version: o.version,
    status: o.status as OrderStatus,
    assignedTo: o.assignedTo,
  };
}

// 006 — siembra una orden en pending_review para tests de revisión, con o sin evidencia. La evidencia requiere
// una OrderAudit previa (FK audit_id RESTRICT); se crea una auditoría transition in_progress→pending_review y,
// si withEvidence, `evidenceCount` filas de OrderEvidence enlazadas. `assignedTo`/`uploadedBy` = un technician.
export async function makePendingReviewOrder(
  prisma: PrismaClient,
  opts: {
    assignedTo: string;
    withEvidence?: boolean;
    evidenceCount?: number;
    version?: number;
    notes?: string; // 007: permite notas ≥30 chars para superar el umbral FR-015 (o texto con PII para tests)
  },
): Promise<{ id: string; version: number }> {
  const o = await prisma.order.create({
    data: {
      id: uuidv7(),
      title: 'orden en revisión',
      description: 'descripción de prueba',
      status: 'pending_review',
      assignedTo: opts.assignedTo,
      version: opts.version ?? 2,
    },
  });
  const auditId = uuidv7();
  await prisma.orderAudit.create({
    data: {
      id: auditId,
      orderId: o.id,
      actorId: opts.assignedTo,
      eventType: 'transition',
      fromStatus: 'in_progress',
      toStatus: 'pending_review',
      reason: 'execution_registered',
    },
  });
  const n = opts.withEvidence === false ? 0 : (opts.evidenceCount ?? 1);
  for (let i = 0; i < n; i++) {
    await prisma.orderEvidence.create({
      data: {
        id: uuidv7(),
        orderId: o.id,
        auditId,
        objectRef: `s3://bucket/${o.id}/${i}.jpg`,
        contentType: 'image/jpeg',
        sizeBytes: 1000 + i,
        uploadedBy: opts.assignedTo,
      },
    });
  }
  // Notas de ejecución (payload PII de 005), enlazadas a la misma auditoría — para tests de conservación.
  await prisma.orderExecutionNotes.create({
    data: {
      id: uuidv7(),
      orderId: o.id,
      auditId,
      notes: opts.notes ?? 'notas del técnico',
      createdBy: opts.assignedTo,
    },
  });
  return { id: o.id, version: o.version };
}
