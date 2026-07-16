// Puertos de negocio de la lectura de evidencia (024, `getOrderEvidence`). El dominio no depende de
// Prisma; el handler recibe estos puertos por inyección (mismo patrón que `evidence-upload-ports.ts`).
import type { OrderStatus } from '../model';

/** Snapshot mínimo para reutilizar `isOrderVisible` (autz heredada EXACTA de `getOrderDetail`, FR-003). */
export interface EvidenceOrderLookup {
  readonly status: OrderStatus;
  readonly assignedTo: string | null;
}

/** Fila `OrderEvidence` mínima necesaria para leer el blob (el `object_ref` NUNCA sale de este puerto). */
export interface EvidenceRowLookup {
  readonly objectRef: string;
}

export interface EvidenceReaderPort {
  /** `null` si la orden no existe. */
  findOrderForEvidence(orderId: string): Promise<EvidenceOrderLookup | null>;
  /** `null` si no existe fila `OrderEvidence` con ese `id` PARA ESE `orderId` (verifica pertenencia, FR-015). */
  findEvidenceRow(orderId: string, evidenceId: string): Promise<EvidenceRowLookup | null>;
}

/** Evento de LECTURA autorizada de evidencia (FR-021): sin `objectRef`/binario, solo identificadores opacos. */
export interface EvidenceReadEvent {
  readonly actorId: string;
  readonly orderId: string;
  readonly evidenceId: string;
}

/**
 * Sink de auditoría de lectura, APPEND-ONLY (FR-021, XI). Tabla propia `EvidenceReadAudit`, separada de
 * `OrderAudit` a propósito: no contamina la semántica FSM que `OrderAudit` sostiene hoy (derivación de
 * `last_rejection_reason` por transición más reciente). Solo se invoca en un `getOrderEvidence` autorizado
 * (200); los accesos denegados (401/404) NO pasan por aquí (heredan la señal best-effort existente).
 */
export interface EvidenceReadAuditPort {
  record(event: EvidenceReadEvent): Promise<void>;
}
