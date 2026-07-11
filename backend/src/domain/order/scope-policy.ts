import type { Role } from '../model';
import type { OrderStatus } from './model';

// Alcance de listado por rol. `assignedTo != null` → filtra por pertenencia (technician).
export interface OrderScope {
  readonly statuses: readonly OrderStatus[];
  readonly assignedTo: string | null;
}

// ÚNICA fuente de la regla rol→alcance (FR-016). Reutilizable por 003/004/005.
// `closed` y `draft` quedan fuera de todos los alcances (FR-002/003/004).
export function orderScopeFor(role: Role, userId: string): OrderScope {
  switch (role) {
    case 'technician':
      return { statuses: ['assigned', 'in_progress', 'pending_review'], assignedTo: userId };
    case 'supervisor':
      return { statuses: ['pending_review'], assignedTo: null };
    case 'dispatcher':
      return { statuses: ['assigned', 'in_progress'], assignedTo: null };
  }
}
