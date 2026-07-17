import type { PrismaClient } from '@prisma/client';
import type { StoragePort } from '../../domain/ports/storage';

// Feature 024 (US3, FR-018/FR-009/SC-006) — purga por RETENCIÓN. Ciclo de almacenamiento puro: para toda
// orden `closed` con antigüedad > `retentionDays` (90, fijo — Assumptions de spec.md, no configurable) se
// purga FÍSICAMENTE el binario de su evidencia; la fila `OrderEvidence` (metadatos/auditoría) permanece,
// inmutable (XI). Independiente del GC de ciclos superados (`gc-job.ts`, FR-024): este job no mira
// `attempt`/vigencia, solo antigüedad del cierre. La antigüedad se mide desde el evento de cierre en
// `OrderAudit` (única marca de tiempo append-only fiable — `Order.updatedAt` se sobreescribe con cualquier
// escritura posterior), NUNCA desde `Order.updatedAt`. `closed` está fuera de alcance de todo rol en
// `getOrderDetail`/`getOrderEvidence` (FR-003/FR-007) → el acceso sigue siendo 404, nunca 410, con
// independencia de si el blob fue purgado.

export interface RunRetentionPurgeDeps {
  readonly storage: StoragePort;
  readonly prisma: PrismaClient;
  readonly now: Date;
  readonly retentionDays: number;
}

export interface RunRetentionPurgeResult {
  readonly purgedRefs: string[];
}

const DAY_MS = 86_400_000;

// Instante de cierre de una orden: el evento `transition` más reciente con `toStatus='closed'`.
async function closedAt(prisma: PrismaClient, orderId: string): Promise<Date | null> {
  const closeEvent = await prisma.orderAudit.findFirst({
    where: { orderId, eventType: 'transition', toStatus: 'closed' },
    orderBy: [{ at: 'desc' }, { id: 'desc' }],
    select: { at: true },
  });
  return closeEvent?.at ?? null;
}

export async function runRetentionPurge(deps: RunRetentionPurgeDeps): Promise<RunRetentionPurgeResult> {
  const retentionMs = deps.retentionDays * DAY_MS;
  const rows = await deps.prisma.orderEvidence.findMany({
    select: { objectRef: true, orderId: true },
  });

  // Evita recalcular `closedAt` por orden repetidas veces cuando hay varias evidencias de la misma orden.
  const closedAtByOrder = new Map<string, Date | null>();
  const purgedRefs: string[] = [];

  for (const row of rows) {
    let close = closedAtByOrder.get(row.orderId);
    if (close === undefined) {
      close = await closedAt(deps.prisma, row.orderId);
      closedAtByOrder.set(row.orderId, close);
    }
    if (close === null) {
      continue; // orden no cerrada: fuera de alcance de este job (nunca se purga por retención)
    }
    const age = deps.now.getTime() - close.getTime();
    if (age <= retentionMs) {
      continue; // dentro del plazo de retención: blob intacto
    }
    try {
      await deps.storage.delete(row.objectRef);
    } catch {
      // Idempotente: si ya fue purgado (p. ej. por una pasada anterior), delete() es un no-op silencioso.
    }
    purgedRefs.push(row.objectRef);
  }

  return { purgedRefs };
}
