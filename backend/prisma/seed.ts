import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import { v7 as uuidv7 } from 'uuid';
import { normalizeIdentifier } from '../src/domain/model';
import {
  NONEXISTENT_PROBE_ID,
  SEED_ORDERS,
  SEED_PASSWORD,
  SEED_PROBES,
  SEED_USERS,
  TIE_CREATED_AT,
} from './seed-data';

const prisma = new PrismaClient();

// 002a — genera las órdenes semilla (≥30) con las anclas deterministas de tests.
async function seedOrders(): Promise<void> {
  const t1 = SEED_USERS.technician.id;
  const t2 = SEED_USERS.technician2.id;
  const t3 = SEED_USERS.technician3.id;
  const base = Date.UTC(2026, 0, 15, 9, 0, 0);
  const rows: {
    id: string;
    title: string;
    description: string;
    status: 'draft' | 'assigned' | 'in_progress' | 'pending_review' | 'closed';
    assignedTo: string | null;
    createdAt: Date;
  }[] = [];
  let n = 0;
  const at = (): Date => new Date(base - n * 60_000);
  const push = (
    status: (typeof rows)[number]['status'],
    assignedTo: string | null,
    id = uuidv7(),
    createdAt?: Date,
  ): void => {
    n += 1;
    rows.push({
      id,
      title: `Orden ${n} — cliente (PII: no loguear)`,
      description: `Detalle de la orden ${n} con dirección y teléfono del cliente`,
      status,
      assignedTo,
      createdAt: createdAt ?? at(),
    });
  };

  // technician1: activas (visibles a él y al dispatcher) + 1 pending_review + 1 closed (no visible a él)
  for (let i = 0; i < 12; i++) push(i % 2 === 0 ? 'assigned' : 'in_progress', t1);
  push('pending_review', t1);
  push('closed', t1);
  // Par de tiebreak: mismo created_at, assigned a t1, in_progress
  push('in_progress', t1, SEED_ORDERS.tiePairLo, TIE_CREATED_AT);
  push('in_progress', t1, SEED_ORDERS.tiePairHi, TIE_CREATED_AT);

  // technician2: activas + pending_review ancla (IDOR: supervisor la ve, technician1 no)
  for (let i = 0; i < 10; i++) push(i % 2 === 0 ? 'assigned' : 'in_progress', t2);
  push('pending_review', t2, SEED_ORDERS.tech2PendingReview);

  // 019 — pending_review de technician1 CON evidencia (ancla approvableReview): aprobable desde arranque limpio.
  push('pending_review', t1, SEED_ORDERS.approvableReview);

  // technician3: solo closed → alcance activo VACÍO (lista vacía → 200)
  push('closed', t3);

  // draft con assigned_to null → invisibles a todos
  push('draft', null);
  push('draft', null);

  await prisma.order.createMany({ data: rows });
  await seedApprovableReviewArtifacts(t1);
}

// 019 — audit de la transición (in_progress→pending_review) + notas + evidencia para la orden APROBABLE.
// OrderEvidence/Notes exigen un OrderAudit (FK). Sin esto, aprobar da 409 EVIDENCE_MISSING (guard de 006).
async function seedApprovableReviewArtifacts(actorId: string): Promise<void> {
  const orderId = SEED_ORDERS.approvableReview;
  const auditId = uuidv7();
  await prisma.orderAudit.create({
    data: {
      id: auditId,
      orderId,
      actorId,
      eventType: 'transition',
      fromStatus: 'in_progress',
      toStatus: 'pending_review',
      reason: null, // marcador opaco de ejecución; las notas van en OrderExecutionNotes (no aquí)
    },
  });
  await prisma.orderExecutionNotes.create({
    data: {
      id: uuidv7(),
      orderId,
      auditId,
      notes: 'Sustituida la polea de tracción y engrasado el guiado. Cabina nivela correctamente.',
      attempt: 1,
      createdBy: actorId,
    },
  });
  await prisma.orderEvidence.create({
    data: {
      id: uuidv7(),
      orderId,
      auditId,
      objectRef: '018f2000-0000-7000-8000-0000000000a1-ev1',
      contentType: 'image/jpeg',
      sizeBytes: 204800,
      uploadedBy: actorId,
      attempt: 1,
    },
  });
  // 019/H-002 — coherencia con el invariante «version == nº de transiciones auditadas»: la orden ancla
  // tiene 1 transición auditada (in_progress→pending_review), luego su version es 1 (no 0 del createMany).
  await prisma.order.update({ where: { id: orderId }, data: { version: 1 } });
}

export const RESEED_HINT =
  'BD no vacía (datos append-only de un seed previo). Re-siembra con: ' +
  'npx prisma migrate reset --force --skip-seed && npx tsx prisma/seed.ts';

// 019/H-001 — re-seed sobre BD con datos append-only: order_evidence/audit/notes prohíben DELETE (trigger)
// y su FK a Order es Restrict, así que `order.deleteMany()` fallaría con un P2003 críptico en la 2ª
// ejecución. Se detecta ANTES (cualquiera de las 3 tablas append-only con filas, H-101) y se falla con un
// mensaje ACCIONABLE (no un stack trace de Prisma).
export async function ensureSeedableOrThrow(db: PrismaClient): Promise<void> {
  const [audits, evidence, notes] = await Promise.all([
    db.orderAudit.count(),
    db.orderEvidence.count(),
    db.orderExecutionNotes.count(),
  ]);
  if (audits + evidence + notes > 0) throw new Error(RESEED_HINT);
}

async function main(): Promise<void> {
  await ensureSeedableOrThrow(prisma);
  // Orden inverso de FK para el borrado. NOTA (019): order_evidence/audit/notes son APPEND-ONLY (DELETE
  // prohibido); este seed asume BD fresca en esas tablas (así corre db-test, efímera). Cinturón y tirantes
  // (H-101): si aun así deleteMany fallara por FK Restrict, se traduce a un mensaje accionable.
  try {
    await prisma.order.deleteMany();
  } catch {
    throw new Error(RESEED_HINT);
  }
  await prisma.refreshToken.deleteMany();
  await prisma.session.deleteMany();
  await prisma.identifier.deleteMany();
  await prisma.user.deleteMany();
  await prisma.probeResource.deleteMany();

  const passwordHash = await argon2.hash(SEED_PASSWORD, { type: argon2.argon2id });
  const now = Date.now();

  for (const u of Object.values(SEED_USERS)) {
    const lockedUntil =
      'lockedMinutes' in u && u.lockedMinutes ? new Date(now + u.lockedMinutes * 60_000) : null;
    const disabledAt = 'disabled' in u && u.disabled ? new Date(now) : null;
    await prisma.user.create({
      data: {
        id: u.id,
        email: u.email,
        username: u.username,
        passwordHash,
        role: u.role,
        lockedUntil,
        disabledAt,
        identifiers: {
          create: [
            { id: uuidv7(), norm: normalizeIdentifier(u.email), kind: 'email' },
            { id: uuidv7(), norm: normalizeIdentifier(u.username), kind: 'username' },
          ],
        },
      },
    });
  }

  for (const p of Object.values(SEED_PROBES)) {
    await prisma.probeResource.create({
      data: { id: p.id, inScopeRoles: [...p.inScopeRoles] },
    });
  }

  // NONEXISTENT_PROBE_ID se deja SIN crear a propósito (404-por-inexistencia).
  void NONEXISTENT_PROBE_ID;

  await seedOrders();
  console.log('Seed OK: usuarios + probes + órdenes creados.');
}

// Solo auto-ejecuta si este módulo ES el entrypoint (permite importar ensureSeedableOrThrow desde tests
// sin disparar el seed real).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main()
    .catch((e: unknown) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => {
      void prisma.$disconnect();
    });
}
