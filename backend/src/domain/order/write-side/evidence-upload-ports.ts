// Puertos de negocio de la subida de evidencia (024, `uploadOrderEvidence`). El dominio no depende de
// Prisma/fs; el handler recibe estos puertos por inyección (patrón 004/005).
import type { OrderStatus } from '../model';

/** Snapshot mínimo para decidir la autz-primero (FR-020): pertenencia + estado de origen. */
export interface UploadOrderLookup {
  readonly status: OrderStatus;
  readonly assignedTo: string | null;
}

export interface EvidenceUploadLookupPort {
  /** `null` si la orden no existe. */
  findOrderForUpload(orderId: string): Promise<UploadOrderLookup | null>;
  /** De la lista de `object_ref` dada, devuelve el subconjunto que YA tiene fila `OrderEvidence` (committeado). */
  filterCommittedRefs(refs: readonly string[]): Promise<ReadonlySet<string>>;
}
