// Caso de uso de dominio: reasignar una orden (004, FR-001/005/007). No escribe estado directamente
// (único punto de escritura = order-write-side-repository). Recibe el snapshot de visibilidad (lectura única,
// N7) y el actorId del contexto de auth (FR-008); valida el destino y delega la mutación atómica en el puerto.
import { err, type Result } from '../../result';
import { domainError } from '../../result';
import type { OrderRecord } from '../model';
import type {
  OrderReassignmentPort,
  ReassignmentSnapshot,
  UserLookupPort,
} from './write-side-ports';

export interface ReassignOrderDeps {
  readonly users: UserLookupPort;
  readonly reassignment: OrderReassignmentPort;
}

export interface ReassignOrderInput {
  /** Snapshot de la consulta de visibilidad (FR-004); el handler garantiza que no es null (si no, 404). */
  readonly snapshot: ReassignmentSnapshot;
  readonly assigneeId: string;
  readonly reason: string;
  /** Actor server-side (del token). */
  readonly actorId: string;
}

// Cuerpo genérico e idéntico para las 4 causas de destino inválido (FR-005, no oráculo de enumeración).
function invalidAssignee(): ReturnType<typeof domainError> {
  return domainError('INVALID_ASSIGNEE', 'El técnico destino no es válido.', {
    agentAction: 'Elige un técnico distinto, activo y con rol technician.',
  });
}

export async function reassignOrder(
  deps: ReassignOrderDeps,
  input: ReassignOrderInput,
): Promise<Result<OrderRecord>> {
  const { snapshot, assigneeId, reason, actorId } = input;

  // (a) "distinto del asignatario actual" — rechazo temprano contra el snapshot (la guarda atómica del repo
  //     lo reafirma bajo concurrencia). Mismo cuerpo genérico que el resto de causas.
  if (snapshot.assignedTo === assigneeId) {
    return err(invalidAssignee());
  }

  // (b) existe ∧ role='technician' ∧ activo (disabledAt IS NULL). Cualquier fallo → 422 genérico.
  const tech = await deps.users.findAssignableTechnician(assigneeId);
  if (tech === null) {
    return err(invalidAssignee());
  }

  // (c) mutación atómica + auditoría; el repo clasifica el 0-filas (404 no-visible / 422 mismo destino).
  return deps.reassignment.reassign({ orderId: snapshot.id, assigneeId, reason, actorId });
}
