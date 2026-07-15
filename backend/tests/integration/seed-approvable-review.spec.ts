// 019 (SC-001/H-006) — verificación automatizada de que el seed produce una orden APROBABLE de origen:
// la ancla SEED_ORDERS.approvableReview nace en pending_review CON evidencia≥1 y su audit (precondición del
// guard de aprobar de 006: pending_review ⇒ evidenceCount≥1). No muta estado (el approve real está cubierto
// genéricamente por review-order-approve.spec.ts y por la demo en vivo); aquí se comprueba la precondición
// de forma determinista contra el dato semilla real, para que una regresión del seed la detecte CI.
import { afterAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { SEED_ORDERS, SEED_USERS } from '../../prisma/seed-data';

const prisma = new PrismaClient();
afterAll(async () => {
  await prisma.$disconnect();
});

describe('019 · seed de orden aprobable (SC-001)', () => {
  it('la ancla approvableReview está en pending_review, de technician1, version 1', async () => {
    const order = await prisma.order.findUnique({ where: { id: SEED_ORDERS.approvableReview } });
    expect(order).not.toBeNull();
    expect(order?.status).toBe('pending_review');
    expect(order?.assignedTo).toBe(SEED_USERS.technician.id);
    // H-002: version coherente con 1 transición auditada.
    expect(order?.version).toBe(1);
  });

  it('la ancla tiene ≥1 evidencia (precondición de aprobar, evita 409 EVIDENCE_MISSING)', async () => {
    const count = await prisma.orderEvidence.count({ where: { orderId: SEED_ORDERS.approvableReview } });
    expect(count).toBeGreaterThanOrEqual(1);
  });
});
