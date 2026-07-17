// Reader del snapshot atómico del detalle (#010, FR-003/FR-005, D4). READ-ONLY: solo SELECTs, nunca muta
// status/version/notas/auditoría. Todas las lecturas (fila `order` completa + guard de propiedad + última
// reject + último submit + notas/evidencia del ciclo vigente) se resuelven en UNA $transaction en
// REPEATABLE READ (snapshot consistente), de modo que un submit/reasignación concurrente no produzca estados
// híbridos ni deje al ex-dueño leer el motivo. BD no disponible → SERVICE_UNAVAILABLE (503); otro error → 500.
import { Prisma, type PrismaClient, type Order as PrismaOrder } from '@prisma/client';
import type { OrderRecord, OrderStatus } from '../../domain/order/model';
import type {
  OrderDetailReaderPort,
  OrderDetailSnapshot,
} from '../../domain/order/read-side/ports';
import { domainError } from '../../domain/result';

// Códigos de conexión/indisponibilidad de Prisma → 503 (convención transversal 001/006), distintos de un
// error no transitorio → 500.
const PG_CONNECTION_ERRORS = new Set(['P1000', 'P1001', 'P1002', 'P1008', 'P1017']);

function isDbUnavailable(e: unknown): boolean {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    return PG_CONNECTION_ERRORS.has(e.code);
  }
  return (
    e instanceof Prisma.PrismaClientInitializationError ||
    e instanceof Prisma.PrismaClientRustPanicError
  );
}

function toRecord(o: PrismaOrder): OrderRecord {
  return {
    id: o.id,
    title: o.title,
    description: o.description,
    status: o.status as OrderStatus,
    assignedTo: o.assignedTo,
    version: o.version,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

export class PrismaOrderDetailReader implements OrderDetailReaderPort {
  constructor(private readonly prisma: PrismaClient) {}

  async read(orderId: string): Promise<OrderDetailSnapshot | null> {
    try {
      return await this.prisma.$transaction(
        (tx) => this.snapshot(tx, orderId),
        { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
      );
    } catch (e) {
      if (isDbUnavailable(e)) {
        throw domainError('SERVICE_UNAVAILABLE', 'El servicio no está disponible.');
      }
      throw e; // error no transitorio → catch-all del handler → 500
    }
  }

  private async snapshot(
    tx: Prisma.TransactionClient,
    orderId: string,
  ): Promise<OrderDetailSnapshot | null> {
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (order === null) {
      return null; // no existe → 404
    }

    // Último submitOrderExecution (reason='execution_registered') → auditId del ciclo vigente.
    const submit = await tx.orderAudit.findFirst({
      where: { orderId, toStatus: 'pending_review', reason: 'execution_registered' },
      orderBy: [{ at: 'desc' }, { id: 'desc' }],
      select: { id: true, at: true },
    });

    // Última transición de rechazo (fromStatus=pending_review, toStatus=in_progress). reason obligatorio (006);
    // si por robustez viniera NULL, se ignora (no hay motivo servible).
    const rejectRow = await tx.orderAudit.findFirst({
      where: { orderId, fromStatus: 'pending_review', toStatus: 'in_progress' },
      orderBy: [{ at: 'desc' }, { id: 'desc' }],
      select: { id: true, at: true, reason: true },
    });

    let notes: string | null = null;
    let evidenceContentTypes: string[] = [];
    let evidenceItems: { id: string; contentType: string }[] = [];
    if (submit !== null) {
      // Defensa en profundidad: filtra por auditId Y orderId (un auditId desalineado nunca sirve contenido
      // de otra orden). content_types/items ordenados por `at` asc (id tiebreak) → invariante count == length.
      const notesRow = await tx.orderExecutionNotes.findFirst({
        where: { auditId: submit.id, orderId },
        orderBy: [{ at: 'desc' }, { id: 'desc' }],
        select: { notes: true },
      });
      notes = notesRow?.notes ?? null;
      const evidence = await tx.orderEvidence.findMany({
        where: { auditId: submit.id, orderId },
        orderBy: [{ at: 'asc' }, { id: 'asc' }],
        select: { id: true, contentType: true },
      });
      evidenceContentTypes = evidence.map((e) => e.contentType);
      evidenceItems = evidence.map((e) => ({ id: e.id, contentType: e.contentType }));
    }

    return {
      order: toRecord(order),
      lastSubmit: submit === null ? null : { id: submit.id, at: submit.at },
      lastReject:
        rejectRow === null || rejectRow.reason === null
          ? null
          : { id: rejectRow.id, at: rejectRow.at, reason: rejectRow.reason },
      notes,
      evidenceContentTypes,
      evidenceItems,
    };
  }
}
