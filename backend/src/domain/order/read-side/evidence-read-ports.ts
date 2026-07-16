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
