// Tipos derivados del contrato (codegen). NO se redefinen formas de datos a mano (FR-016).
import type { components as AuthComponents } from './generated/auth';
import type { components as OrdersComponents } from './generated/orders';

export type Role = AuthComponents['schemas']['Role'];
export type UserIdentity = AuthComponents['schemas']['UserIdentity'];

export type OrderStatus = OrdersComponents['schemas']['OrderStatus'];
export type Order = OrdersComponents['schemas']['Order'];
export type OrderListResponse = OrdersComponents['schemas']['OrderListResponse'];
export type OrderDetailResponse = OrdersComponents['schemas']['OrderDetailResponse'];
export type ErrorResponse = OrdersComponents['schemas']['ErrorResponse'];
export type EvidenceRef = OrdersComponents['schemas']['EvidenceRef'];
export type ExecutionRequest = OrdersComponents['schemas']['ExecutionRequest'];

// Vista de sesión (data-model.md §1): identidad en memoria.
export interface SessionUser {
  userId: string;
  name: string;
  role: Role;
}

export function toSessionUser(u: UserIdentity): SessionUser {
  return { userId: u.id, name: u.username, role: u.role };
}
