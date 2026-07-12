// Puertos de negocio del write-side de reasignación (004). El dominio no depende de Prisma.
import type { OrderRecord, OrderStatus } from '../model';
import type { Result } from '../../result';

/** Snapshot de visibilidad (FR-004): decide el 404 y alimenta la validación/atomicidad. */
export interface ReassignmentSnapshot {
  readonly id: string;
  readonly status: OrderStatus;
  readonly assignedTo: string | null;
  readonly version: number;
}

/** Resuelve la visibilidad del dispatcher: orden reasignable (status ∈ {assigned,in_progress}) o null. */
export interface OrderVisibilityPort {
  findReassignable(orderId: string): Promise<ReassignmentSnapshot | null>;
}

/** Técnico destino elegible: existe ∧ role='technician' ∧ disabledAt IS NULL. */
export interface AssignableTechnician {
  readonly id: string;
}
export interface UserLookupPort {
  findAssignableTechnician(userId: string): Promise<AssignableTechnician | null>;
}

/** Comando de reasignación. `actorId` server-side (del token, FR-008); nunca del body. */
export interface ReassignCommand {
  readonly orderId: string;
  readonly assigneeId: string;
  readonly reason: string;
  readonly actorId: string;
}

/**
 * Aplica la reasignación de forma atómica (SELECT FOR UPDATE + UPDATE condicional + auditoría en la misma
 * `$transaction`, FR-007). Devuelve la orden actualizada o clasifica el 0-filas:
 * ORDER_NOT_FOUND (404, no visible/no existe, precede) o INVALID_ASSIGNEE (422, mismo destino bajo carrera).
 */
export interface OrderReassignmentPort {
  reassign(cmd: ReassignCommand): Promise<Result<OrderRecord>>;
}
