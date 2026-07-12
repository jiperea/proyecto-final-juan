// Puerto de transición de estado (Constitution III). El dominio no depende de Prisma.
import type { OrderRecord, OrderStatus } from '../model';
import type { Result } from '../../result';

/** Guarda de pertenencia TIPADA (nunca SQL crudo del llamador). El repo la traduce a un WHERE parametrizado. */
export interface TransitionGuard {
  readonly assignedTo?: string;
}

export interface ApplyTransitionInput {
  readonly orderId: string;
  readonly toStatus: OrderStatus;
  /** Actor derivado server-side (contrato duro, G1:S-002); nunca de input del cliente. */
  readonly actorId: string;
  /** Pre-saneado por el llamador (sin PII cruda); nunca en logs/errores (FR-008). */
  readonly reason?: string;
  readonly expectedVersion: number;
  readonly guard?: TransitionGuard;
}

// Aplica la transición de forma atómica (UPDATE condicional + auditoría en la misma transacción, FR-004/007).
export interface OrderTransitionPort {
  applyTransition(input: ApplyTransitionInput): Promise<Result<OrderRecord>>;
}
