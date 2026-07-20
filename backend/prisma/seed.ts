import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import { v7 as uuidv7 } from 'uuid';
import { normalizeIdentifier } from '../src/domain/model';
import { isValidEvidenceEncKey } from '../src/infra/evidence-enc-key';
import { FsStorageAdapter } from '../src/infra/storage/fs-storage-adapter';
import type { StoragePort } from '../src/domain/ports/storage';
import {
  NONEXISTENT_PROBE_ID,
  SEED_ORDERS,
  SEED_PASSWORD,
  SEED_PROBES,
  SEED_USERS,
  TIE_CREATED_AT,
} from './seed-data';

const prisma = new PrismaClient();

// 026 (T002/FR-002) — imagen JPEG mínima VÁLIDA (1x1, magic bytes FFD8FF…FFD9), embebida como constante
// en el propio seed (sin añadir ficheros de asset nuevos al repo, FR-002/gobernanza). No es PII real.
export const EMBEDDED_EVIDENCE_IMAGE: Buffer = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=',
  'base64',
);

// 026 (T003/T004, US3, FR-003/FR-004) — guard dev-local POSITIVO: el seed aborta ANTES de escribir nada
// salvo que se confirme un destino de desarrollo local. Doble barrera: (a) NODE_ENV !== 'production'
// (pre/prod usan NODE_ENV=production, docs/16:45); (b) el hostname de DATABASE_URL (match EXACTO, no
// subcadena) ∈ {db, localhost, 127.0.0.1}. Además valida EVIDENCE_ENC_KEY con el helper COMPARTIDO
// (FR-013), sin invocar loadConfig() completo. El mensaje nombra la causa pero NUNCA interpola la
// DATABASE_URL completa (credenciales) ni el valor de la clave.
const DEV_LOCAL_HOSTS = new Set(['db', 'localhost', '127.0.0.1']);

export function assertDevLocalOrThrow(env: NodeJS.ProcessEnv): void {
  if (env.NODE_ENV === 'production') {
    throw new Error(
      'Seed abortado (026/FR-004): NODE_ENV=production no está permitido; el seed solo corre en desarrollo local.',
    );
  }
  let hostname: string;
  try {
    hostname = new URL(env.DATABASE_URL ?? '').hostname;
  } catch {
    throw new Error(
      'Seed abortado (026/FR-004): DATABASE_URL ausente o no es una URL válida (no se puede determinar el host).',
    );
  }
  if (!DEV_LOCAL_HOSTS.has(hostname)) {
    throw new Error(
      `Seed abortado (026/FR-004): el host de DATABASE_URL ('${hostname}') no es un destino de desarrollo ` +
        'local (db/localhost/127.0.0.1); rechazado por seguridad.',
    );
  }
  if (!isValidEvidenceEncKey(env.EVIDENCE_ENC_KEY)) {
    throw new Error(
      'Seed abortado (026/FR-003): EVIDENCE_ENC_KEY ausente o demasiado corta; ' +
        'define una clave de al menos 32 caracteres en backend/.env.',
    );
  }
}

export interface SeedEvidenceBlobDeps {
  readonly prisma: PrismaClient;
  readonly storage: StoragePort;
  readonly orderId: string;
  readonly actorId: string;
}

export interface SeedEvidenceBlobResult {
  readonly auditId: string;
  readonly evidenceId: string;
  readonly objectRef: string;
}

// 026 (T007/T008, US1, FR-001/FR-007/FR-010/FR-014) — escribe un blob de evidencia REAL a través del
// MISMO StoragePort/adaptador cifrado que uploadOrderEvidence (024), y crea la fila `OrderEvidence`
// correspondiente usando el `object_ref` DEVUELTO por `putStaged` (no un placeholder). El blob se
// escribe ANTES que la fila (FR-010): si `putStaged` falla (almacén no escribible/inalcanzable, FR-009),
// se aborta sin dejar fila huérfana. Las escrituras de BD (auditoría + evidencia) van en UNA transacción
// (interrupción ⇒ BD vacía para esa orden). El `OrderAudit` usa `reason:'execution_registered'` (no
// null) para que el GC de staging (`gc-job.ts::latestSubmitAuditId`) lo reconozca como CICLO VIGENTE y
// no purgue su blob (FR-014).
export async function seedEvidenceBlobForOrder(deps: SeedEvidenceBlobDeps): Promise<SeedEvidenceBlobResult> {
  const { prisma: db, storage, orderId, actorId } = deps;
  let objectRef: string;
  try {
    objectRef = await storage.putStaged({
      bytes: EMBEDDED_EVIDENCE_IMAGE,
      contentType: 'image/jpeg',
      ownerId: actorId,
      orderId,
    });
  } catch (e) {
    throw new Error(
      `Seed: no se pudo escribir el blob de evidencia (almacén de EVIDENCE_STORAGE_DIR no escribible/inalcanzable): ${(e as Error).message}`,
    );
  }
  return db.$transaction(async (tx) => {
    // Coherente con el evento auditado (in_progress→pending_review, como el `submitOrderExecution` real):
    // si la orden sigue `in_progress`, la transición se refleja también en su `status`/`version`. Para la
    // orden ancla (ya creada en `pending_review` por el seed), este UPDATE no coincide con 0 filas (sin
    // efecto); su `version` la fija aparte `seedApprovableReviewArtifacts` (H-002).
    await tx.order.updateMany({
      where: { id: orderId, status: 'in_progress' },
      data: { status: 'pending_review', version: { increment: 1 } },
    });
    const auditId = uuidv7();
    await tx.orderAudit.create({
      data: {
        id: auditId,
        orderId,
        actorId,
        eventType: 'transition',
        fromStatus: 'in_progress',
        toStatus: 'pending_review',
        reason: 'execution_registered',
      },
    });
    const evidenceId = uuidv7();
    await tx.orderEvidence.create({
      data: {
        id: evidenceId,
        orderId,
        auditId,
        objectRef,
        contentType: 'image/jpeg',
        sizeBytes: EMBEDDED_EVIDENCE_IMAGE.length,
        uploadedBy: actorId,
        attempt: 1,
      },
    });
    return { auditId, evidenceId, objectRef };
  });
}

// 002a — genera las órdenes semilla (≥30) con las anclas deterministas de tests.
async function seedOrders(storage: StoragePort): Promise<void> {
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
  await seedApprovableReviewArtifacts(storage, t1);
}

// 019/026 — audit de la transición (in_progress→pending_review) + notas + evidencia (con blob REAL,
// FR-001) para la orden APROBABLE. OrderEvidence/Notes exigen un OrderAudit (FK). Sin esto, aprobar da
// 409 EVIDENCE_MISSING (guard de 006). El blob+fila los escribe `seedEvidenceBlobForOrder` (mismo
// StoragePort cifrado que uploadOrderEvidence, `object_ref` DEVUELTO por `putStaged`, audit con
// `reason:'execution_registered'` para que el GC de staging no lo purgue, FR-014).
async function seedApprovableReviewArtifacts(storage: StoragePort, actorId: string): Promise<void> {
  const orderId = SEED_ORDERS.approvableReview;
  const { auditId } = await seedEvidenceBlobForOrder({ prisma, storage, orderId, actorId });
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
  // 019/H-002 — coherencia con el invariante «version == nº de transiciones auditadas»: la orden ancla
  // tiene 1 transición auditada (in_progress→pending_review), luego su version es 1 (no 0 del createMany).
  await prisma.order.update({ where: { id: orderId }, data: { version: 1 } });
}

export const RESEED_HINT =
  'BD no vacía (datos append-only de un seed previo). Re-siembra con: make reset ' +
  '(limpia BD y EVIDENCE_STORAGE_DIR y re-siembra, todo en el contenedor backend).';

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

// 026/FR-005 — construye el StoragePort exactamente como container.ts:75 (mismo baseDir/encKey del
// entorno), de modo que el blob sembrado quede en el MISMO almacén que lee el backend navegado.
function buildSeedStorage(env: NodeJS.ProcessEnv): StoragePort {
  const clock = { now: (): Date => new Date() };
  return new FsStorageAdapter({
    baseDir: env.EVIDENCE_STORAGE_DIR ?? './data/evidence',
    encKey: env.EVIDENCE_ENC_KEY ?? '',
    clock,
  });
}

async function main(): Promise<void> {
  assertDevLocalOrThrow(process.env); // 026/FR-004 — ANTES de escribir nada.
  const storage = buildSeedStorage(process.env);
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

  await seedOrders(storage);
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
