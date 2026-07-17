// Feature 005 — registro de ejecución (write-side propio de 005). 1 $transaction con orden ÚNICO (K-101):
// transición → auditoría (reason opaco) → evidencia[] → notas. applyTransition/classifyZeroRows de 002b NO
// se tocan. `status`/`version` sólo se mutan aquí. Extraído a fichero propio (024) para acotar el tamaño de
// `order-write-side-repository.ts` (arch test/lint `max-lines`); sigue siendo el ÚNICO punto de escritura de
// evidencia/notas de ejecución (arch test `write-side-boundary`).
import { Prisma, type PrismaClient } from '@prisma/client';
import { v7 as uuidv7 } from 'uuid';
import { domainError, err, ok, type Result } from '../../domain/result';
import type { OrderRecord, OrderStatus } from '../../domain/order/model';
import type { EvidenceRefInput } from '../../domain/order/evidence';
import { classifyExecutionGuard } from '../../domain/order/write-side/classify-execution-guard';
import type { OrderExecutionPort, SubmitExecutionCommand } from '../../domain/order/write-side/write-side-ports';
import type { StoragePort } from '../../domain/ports/storage';
import { storageFor } from '../storage/storage-registry';
import { toOrderRecord } from './order-record';

const EXEC_FROM: OrderStatus = 'in_progress';
const EXEC_TO: OrderStatus = 'pending_review';
const EXECUTION_REASON = 'execution_registered'; // marcador opaco constante (XI); NUNCA el texto de las notas.
const DEFAULT_STAGING_TTL_MS = 24 * 3_600_000;

// 024/FR-023 — la re-verificación de `object_ref` (dueño+orden, sin fila previa, blob vivo) puede rechazar
// DESPUÉS de que la transición ya haya escrito (dentro de la misma $transaction, dictado por FR-011/FR-023).
// Se lanza esta excepción PARA FORZAR el rollback completo de Postgres; el catch externo la traduce a Result
// sin filtrar detalle de BD (mismo patrón que ACTOR_INVALID en order-write-side-repository.ts).
class RefValidationError extends Error {
  constructor(public readonly domainErr: ReturnType<typeof domainError>) {
    super('evidence_ref_validation');
  }
}

interface VerifyRefsCtx {
  readonly orderId: string;
  readonly actorId: string;
  readonly evidence: readonly EvidenceRefInput[];
}

export class PrismaOrderExecutionRepository implements OrderExecutionPort {
  private readonly storage: StoragePort | undefined;
  private readonly stagingTtlMs: number;

  constructor(
    private readonly prisma: PrismaClient,
    storage?: StoragePort,
    stagingTtlMs: number = DEFAULT_STAGING_TTL_MS,
  ) {
    // Fallback (024): si no se inyecta storage explícitamente (patrón normal, container.ts), se resuelve
    // por el registro auxiliar asociado a este mismo PrismaClient (tests white-box, ver storage-registry).
    // Si tampoco hay entrada (p. ej. un Proxy de fault-injection sobre otro PrismaClient), la verificación
    // de refs basada en storage se OMITE con gracia (nunca en el flujo real, que siempre inyecta storage).
    this.storage = storage ?? storageFor(prisma);
    this.stagingTtlMs = stagingTtlMs;
  }

  async submitExecution(cmd: SubmitExecutionCommand): Promise<Result<OrderRecord>> {
    try {
      return await this.prisma.$transaction((tx) => this.attempt(tx, cmd));
    } catch (e) {
      if (e instanceof RefValidationError) {
        return err(e.domainErr);
      }
      throw e;
    }
  }

  private async attempt(
    tx: Prisma.TransactionClient,
    cmd: SubmitExecutionCommand,
  ): Promise<Result<OrderRecord>> {
    const { orderId, actorId, notes, evidence } = cmd;
    // UPDATE condicional (status=in_progress AND assigned_to=actor, SIN version → VERSION_CONFLICT no surge
    // de este UPDATE; el 409 de doble-submit se decide en la reclasificación de 0 filas, más abajo).
    const res = await tx.order.updateMany({
      where: { id: orderId, status: EXEC_FROM, assignedTo: actorId },
      data: { status: EXEC_TO, version: { increment: 1 } },
    });
    if (res.count !== 1) {
      return this.classifyZeroRows(tx, cmd);
    }
    // (024/FR-023) Re-verifica cada object_ref ANTES de crear filas; si alguno es inválido, lanza para
    // forzar el rollback de la transición ya aplicada (atomicidad: o todo, o nada).
    await this.verifyRefs(tx, { orderId, actorId, evidence });
    const auditId = uuidv7();
    await this.writeExecution(tx, { orderId, actorId, notes, evidence, auditId });
    return ok(toOrderRecord(await tx.order.findUniqueOrThrow({ where: { id: orderId } })));
  }

  // (1) Auditoría transition (reason opaco) → (2) evidencia[] append-only → (3) notas (tabla aparte, PII).
  private async writeExecution(
    tx: Prisma.TransactionClient,
    input: SubmitExecutionCommand & { auditId: string },
  ): Promise<void> {
    const { orderId, actorId, notes, evidence, auditId } = input;
    await tx.orderAudit.create({
      data: {
        id: auditId,
        orderId,
        actorId,
        eventType: 'transition',
        fromStatus: EXEC_FROM,
        toStatus: EXEC_TO,
        reason: EXECUTION_REASON,
      },
    });
    await tx.orderEvidence.createMany({
      data: evidence.map((e) => ({
        id: uuidv7(),
        orderId,
        auditId,
        objectRef: e.objectRef,
        contentType: e.contentType,
        sizeBytes: e.sizeBytes,
        uploadedBy: actorId,
      })),
    });
    await tx.orderExecutionNotes.create({
      data: { id: uuidv7(), orderId, auditId, notes, createdBy: actorId },
    });
  }

  // 0 filas: re-lectura DENTRO de la tx (sin SELECT previo → sin TOCTOU) + clasificador propio de 005,
  // endurecido (024/FR-023) con el caso de doble-submit (concurrencia optimista → 409).
  private async classifyZeroRows(
    tx: Prisma.TransactionClient,
    cmd: SubmitExecutionCommand,
  ): Promise<Result<OrderRecord>> {
    const { orderId, actorId } = cmd;
    const current = await tx.order.findUnique({ where: { id: orderId }, select: { status: true, assignedTo: true } });
    const snapshot =
      current === null ? null : { status: current.status as OrderStatus, assignedTo: current.assignedTo };
    if (snapshot !== null && snapshot.assignedTo === actorId) {
      // Mismo dueño, pero el UPDATE no afectó filas: si YA existe una auditoría de ejecución previa para
      // esta orden, este intento es un REENVÍO/DOBLE-SUBMIT sobre una versión obsoleta → 409 (no 422), sin
      // crear un segundo `attempt`. Sin esa auditoría previa (p. ej. estado fijado directamente, nunca pasó
      // por submitExecution), es un estado de origen genuinamente no legal → 422 (sin cambios de 005).
      const priorSubmit = await tx.orderAudit.findFirst({
        where: { orderId, eventType: 'transition', reason: EXECUTION_REASON },
        select: { id: true },
      });
      if (priorSubmit !== null) {
        return err(domainError('VERSION_CONFLICT', 'La versión de la orden es obsoleta.'));
      }
    }
    return err(classifyExecutionGuard(snapshot, { actorId, fromStatus: EXEC_FROM, toStatus: EXEC_TO }));
  }

  // 024/FR-023 — re-verifica cada `object_ref` del `evidence[]` DENTRO de la transacción: (a) fue staged
  // por el actor para ESTA orden (si no, ajeno/otra-orden/otro-actor → 404 uniforme); (b) no tiene fila
  // `OrderEvidence` previa (si no, reuso de evidencia committeada → 422 "vuelve a subir"); (c) su edad de
  // staging no supera el TTL (si no, expirado → 422); (d) su blob existe físicamente (si no, purgado → 422).
  // Formato/duplicados dentro del array ya los valida `validateEvidence` (dominio, ANTES de llegar aquí).
  private async verifyRefs(tx: Prisma.TransactionClient, ctx: VerifyRefsCtx): Promise<void> {
    for (const item of ctx.evidence) {
      await this.verifyOneRef(tx, ctx, item.objectRef);
    }
    if (!this.storage) {
      return;
    }
    const listed = await this.storage.list();
    const existingRefs = new Set(listed.map((s) => s.objectRef));
    for (const item of ctx.evidence) {
      if (!existingRefs.has(item.objectRef)) {
        throw new RefValidationError(domainError('INVALID_EVIDENCE', 'La evidencia ya no está disponible.'));
      }
    }
  }

  private async verifyOneRef(tx: Prisma.TransactionClient, ctx: VerifyRefsCtx, objectRef: string): Promise<void> {
    const existingRow = await tx.orderEvidence.findFirst({ where: { objectRef }, select: { id: true } });
    if (existingRow !== null) {
      throw new RefValidationError(domainError('INVALID_EVIDENCE', 'Esa evidencia ya fue enviada; vuelve a subirla.'));
    }
    if (!this.storage) {
      return; // sin storage resoluble (patrón white-box de test); el resto de checks se omite con gracia
    }
    const parsed = this.storage.parseRef(objectRef);
    if (!parsed.ok) {
      throw new RefValidationError(domainError('INVALID_EVIDENCE', 'La evidencia tiene un formato inválido.'));
    }
    if (parsed.value.ownerId !== ctx.actorId || parsed.value.orderId !== ctx.orderId) {
      throw new RefValidationError(domainError('GUARD_UNMET', 'La orden no existe.'));
    }
    const ageMs = Date.now() - parsed.value.createdAt.getTime();
    if (ageMs > this.stagingTtlMs) {
      throw new RefValidationError(domainError('INVALID_EVIDENCE', 'La evidencia expiró; vuelve a subirla.'));
    }
  }
}
