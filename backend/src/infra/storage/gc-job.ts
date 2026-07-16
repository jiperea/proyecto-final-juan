import type { PrismaClient } from '@prisma/client';
import type { StoragePort } from '../../domain/ports/storage';

// Feature 024 (US3, FR-024) — GC de blobs de evidencia. Purga TODO blob sin fila `OrderEvidence` VIGENTE:
// (a) blobs SIN fila (staged abandonado con edad > TTL, o huérfano por rollback de un submit fallido,
// FR-011), y (b) blobs CON fila pero marcada SUPERADA por un reenvío (FR-017). Un blob de fila VIGENTE
// (la del `attempt`/`auditId` del último `submitOrderExecution` de esa orden) nunca se toca aquí — lo rige
// la retención de 90 días (`retention-job.ts`, FR-018). Como cada blob pertenece a exactamente UNA fila
// (FR-023.b: un reenvío re-sube blobs propios, sin reusar `object_ref` committeados), purgar el blob de
// una fila superada nunca puede afectar a la vigente. Idempotente: una segunda pasada no falla ni repite
// purgas (el blob ya no está en `storage.list()`).

export interface RunStagingGcDeps {
  readonly storage: StoragePort;
  readonly prisma: PrismaClient;
  readonly now: Date;
  readonly stagingTtlMs: number;
}

export interface RunStagingGcResult {
  readonly purgedRefs: string[];
}

// El ciclo VIGENTE de una orden = el del `submitOrderExecution` (evento `transition` con
// `toStatus='pending_review'`, `reason='execution_registered'`) más reciente — mismo criterio que
// `order-detail-reader.ts` para derivar el `attempt` que expone `getOrderDetail.items`/`getOrderEvidence`.
async function latestSubmitAuditId(prisma: PrismaClient, orderId: string): Promise<string | null> {
  const submit = await prisma.orderAudit.findFirst({
    where: { orderId, eventType: 'transition', toStatus: 'pending_review', reason: 'execution_registered' },
    orderBy: [{ at: 'desc' }, { id: 'desc' }],
    select: { id: true },
  });
  return submit?.id ?? null;
}

export async function runStagingGc(deps: RunStagingGcDeps): Promise<RunStagingGcResult> {
  const objects = await deps.storage.list();
  const purgedRefs: string[] = [];

  for (const obj of objects) {
    const row = await deps.prisma.orderEvidence.findFirst({
      where: { objectRef: obj.objectRef },
      select: { orderId: true, auditId: true },
    });

    if (row === null) {
      // (a) Sin fila: staged puro (aún no enviado) o huérfano por rollback (FR-011). Se purga solo por
      // edad > TTL (24 h) para no destruir un ciclo de subida en curso (< TTL, en-vuelo).
      const age = deps.now.getTime() - obj.createdAt.getTime();
      if (age > deps.stagingTtlMs) {
        await deps.storage.delete(obj.objectRef);
        purgedRefs.push(obj.objectRef);
      }
      continue;
    }

    // (b) Con fila: solo se purga si esa fila NO es la del ciclo vigente de su orden (superada por un
    // reenvío posterior, FR-017). La fila vigente y su blob nunca se tocan aquí (retención = FR-018).
    const vigenteAuditId = await latestSubmitAuditId(deps.prisma, row.orderId);
    const isVigente = vigenteAuditId !== null && vigenteAuditId === row.auditId;
    if (!isVigente) {
      await deps.storage.delete(obj.objectRef);
      purgedRefs.push(obj.objectRef);
    }
  }

  return { purgedRefs };
}
