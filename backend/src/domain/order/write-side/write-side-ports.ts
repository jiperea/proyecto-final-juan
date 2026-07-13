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

// ---------------------------------------------------------------------------------------------------
// Feature 005 — registro de ejecución. Puertos PROPIOS de 005 (patrón 004 `reassign`): NO reutilizan
// applyTransition/classifyZeroRows de 002b para clasificar (precedencia pertenencia-antes-que-estado).

/** Comando de inicio de trabajo. `actorId` server-side (del token, FR-007); nunca del body. */
export interface StartOrderWorkCommand {
  readonly orderId: string;
  readonly actorId: string;
}

/**
 * Inicia el trabajo (`assigned→in_progress`) de forma atómica: UPDATE condicional
 * (`status='assigned' AND assigned_to=actor`, SIN predicado de version) + auditoría `transition`
 * (`reason` NULL) en la misma `$transaction`. 0 filas → clasificador 005 (pertenencia 404 / estado 422).
 */
export interface StartOrderWorkPort {
  startWork(cmd: StartOrderWorkCommand): Promise<Result<OrderRecord>>;
}

