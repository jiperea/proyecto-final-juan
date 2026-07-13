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

// 008/#010 — siembra una orden RECHAZADA SIN atender (in_progress tras rechazo): un submit (ciclo vigente,
// con notas + evidencia) seguido de una transición de rechazo (pending_review→in_progress) con `reason`
// POSTERIOR al submit. Es el caso central de US1 (el technician debe ver el motivo). Si `resubmit` es true,
// añade un segundo submit posterior al reject (orden ya reenviada → el motivo debe omitirse).
export async function makeRejectedOrder(
  prisma: PrismaClient,
  opts: {
    assignedTo: string;
    reason?: string;
    notes?: string;
    evidenceCount?: number;
    contentTypes?: readonly string[];
    resubmit?: boolean;
    rejects?: number; // nº de ciclos rechazo-reenvío previos (multi-ciclo). El último rechazo es el vigente.
  },
): Promise<{ id: string; auditId: string; reason: string }> {
  const reason = opts.reason ?? 'Faltan fotos del cuadro eléctrico.';
  const base = Date.parse('2026-07-05T09:00:00.000Z');
  const o = await prisma.order.create({
    data: {
      id: uuidv7(),
      title: 'orden rechazada',
      description: 'descripción de prueba',
      status: opts.resubmit ? 'pending_review' : 'in_progress',
      assignedTo: opts.assignedTo,
      version: 4,
    },
  });

  // Ciclos previos (multi-ciclo): submit viejo + reject viejo, con timestamps anteriores.
  const previous = Math.max(0, (opts.rejects ?? 1) - 1);
  for (let k = 0; k < previous; k++) {
    const t = base + k * 3_600_000;
    const oldSubmit = uuidv7();
    await prisma.orderAudit.create({
      data: {
        id: oldSubmit,
        orderId: o.id,
        actorId: opts.assignedTo,
        eventType: 'transition',
        fromStatus: 'in_progress',
        toStatus: 'pending_review',
        reason: 'execution_registered',
        at: new Date(t),
      },
    });
    await prisma.orderAudit.create({
      data: {
        id: uuidv7(),
        orderId: o.id,
        actorId: opts.assignedTo,
        eventType: 'transition',
        fromStatus: 'pending_review',
        toStatus: 'in_progress',
        reason: `rechazo previo ${k + 1}`,
        at: new Date(t + 1_800_000),
      },
    });
  }

  // Ciclo vigente: submit (notas + evidencia) con auditId.
  const auditId = uuidv7();
  const submitAt = base + (previous + 1) * 3_600_000;
  await prisma.orderAudit.create({
    data: {
      id: auditId,
      orderId: o.id,
      actorId: opts.assignedTo,
      eventType: 'transition',
      fromStatus: 'in_progress',
      toStatus: 'pending_review',
      reason: 'execution_registered',
      at: new Date(submitAt),
    },
  });
  const contentTypes = opts.contentTypes ?? Array.from({ length: opts.evidenceCount ?? 2 }, () => 'image/jpeg');
  for (let i = 0; i < contentTypes.length; i++) {
    await prisma.orderEvidence.create({
      data: {
        id: uuidv7(),
        orderId: o.id,
        auditId,
        objectRef: `s3://bucket/${o.id}/${i}.jpg`,
        contentType: contentTypes[i]!,
        sizeBytes: 1000 + i,
        uploadedBy: opts.assignedTo,
        at: new Date(submitAt + i * 1000),
      },
    });
  }
  await prisma.orderExecutionNotes.create({
    data: {
      id: uuidv7(),
      orderId: o.id,
      auditId,
      notes: opts.notes ?? 'Se reemplazó el fusible principal.',
      createdBy: opts.assignedTo,
      at: new Date(submitAt),
    },
  });

  // Rechazo vigente (posterior al submit).
  await prisma.orderAudit.create({
    data: {
      id: uuidv7(),
      orderId: o.id,
      actorId: opts.assignedTo,
      eventType: 'transition',
      fromStatus: 'pending_review',
      toStatus: 'in_progress',
      reason,
      at: new Date(submitAt + 1_800_000),
    },
  });

  // Reenvío opcional (orden vuelve a pending_review, posterior al rechazo → motivo ya atendido). Lleva su
  // propio ciclo (notas + evidencia) para que el detalle muestre el ciclo vigente sin el motivo.
  if (opts.resubmit) {
    const reAudit = uuidv7();
    const reAt = submitAt + 3_600_000;
    await prisma.orderAudit.create({
      data: {
        id: reAudit,
        orderId: o.id,
        actorId: opts.assignedTo,
        eventType: 'transition',
        fromStatus: 'in_progress',
        toStatus: 'pending_review',
        reason: 'execution_registered',
        at: new Date(reAt),
      },
    });
    await prisma.orderEvidence.create({
      data: {
        id: uuidv7(),
        orderId: o.id,
        auditId: reAudit,
        objectRef: `s3://bucket/${o.id}/re.jpg`,
        contentType: 'image/png',
        sizeBytes: 2048,
        uploadedBy: opts.assignedTo,
        at: new Date(reAt),
      },
    });
    await prisma.orderExecutionNotes.create({
      data: {
        id: uuidv7(),
        orderId: o.id,
        auditId: reAudit,
        notes: 'Corregido y reenviado.',
        createdBy: opts.assignedTo,
        at: new Date(reAt),
      },
    });
  }

  return { id: o.id, auditId, reason };
}
