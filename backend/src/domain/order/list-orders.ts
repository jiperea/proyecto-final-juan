import type { Role } from '../model';
import type { OrderRecord } from './model';
import type { OrderRepositoryPort } from './ports';
import { orderScopeFor } from './scope-policy';

export interface ListOrdersDeps {
  readonly orders: OrderRepositoryPort;
}

export interface ListOrdersInput {
  readonly role: Role;
  readonly userId: string;
}

// Caso de uso: aplica la política única de alcance (FR-016) y delega en el repositorio.
export async function listOrders(deps: ListOrdersDeps, input: ListOrdersInput): Promise<OrderRecord[]> {
  return deps.orders.listForScope(orderScopeFor(input.role, input.userId));
}
