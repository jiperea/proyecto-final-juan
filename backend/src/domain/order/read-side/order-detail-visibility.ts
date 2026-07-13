// Visibilidad del detalle por rol (#010, FR-001/FR-004). PURO. Reutiliza la ÚNICA fuente rol→alcance
// (orderScopeFor de 002a) para NO duplicar literales de estado. Un rol no reconocido (claim corrupto,
// rol nuevo) → alcance vacío → no visible (fail-secure, default-deny, coherente con el allowlist de 002a).
import type { Role } from '../../model';
import type { OrderStatus } from '../model';
import { orderScopeFor } from '../scope-policy';

const KNOWN_ROLES: readonly Role[] = ['dispatcher', 'technician', 'supervisor'];

function isKnownRole(role: string): role is Role {
  return (KNOWN_ROLES as readonly string[]).includes(role);
}

export interface VisibilityOrder {
  readonly status: OrderStatus;
  readonly assignedTo: string | null;
}

// ¿Es la orden visible para (role, userId)? technician = sus órdenes activas (assigned/in_progress/
// pending_review); supervisor = pending_review; dispatcher = assigned/in_progress. draft/closed fuera de
// todo alcance → 404. Rol desconocido → false (404). `role` se tipa como string para poder validar claims
// corruptos (default-deny) sin ampliar la visibilidad.
export function isOrderVisible(role: string, userId: string, order: VisibilityOrder): boolean {
  if (!isKnownRole(role)) {
    return false; // fail-secure: rol no reconocido → alcance vacío → 404
  }
  const scope = orderScopeFor(role, userId);
  if (!scope.statuses.includes(order.status)) {
    return false;
  }
  // technician filtra por pertenencia (assignedTo != null); supervisor/dispatcher no (null).
  if (scope.assignedTo !== null && scope.assignedTo !== order.assignedTo) {
    return false;
  }
  return true;
}
