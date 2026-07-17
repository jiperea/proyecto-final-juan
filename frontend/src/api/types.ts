// Tipos derivados del contrato (codegen). NO se redefinen formas de datos a mano (FR-016).
import type { components as AuthComponents } from './generated/auth';
import type { components as OrdersComponents, operations as OrdersOperations } from './generated/orders';

export type Role = AuthComponents['schemas']['Role'];
export type UserIdentity = AuthComponents['schemas']['UserIdentity'];

export type OrderStatus = OrdersComponents['schemas']['OrderStatus'];
export type Order = OrdersComponents['schemas']['Order'];
export type OrderListResponse = OrdersComponents['schemas']['OrderListResponse'];
export type OrderDetailResponse = OrdersComponents['schemas']['OrderDetailResponse'];
export type ErrorResponse = OrdersComponents['schemas']['ErrorResponse'];
export type EvidenceMeta = OrdersComponents['schemas']['EvidenceMeta'];
export type EvidenceRef = OrdersComponents['schemas']['EvidenceRef'];
export type ExecutionRequest = OrdersComponents['schemas']['ExecutionRequest'];
export type ReassignmentRequest = OrdersComponents['schemas']['ReassignmentRequest'];
export type ReviewRequest = OrdersComponents['schemas']['ReviewRequest'];
export type IncidentSummaryResponse = OrdersComponents['schemas']['IncidentSummaryResponse'];
// 024 · uploadOrderEvidence (multipart, T032): sin schema con nombre en components (respuesta inline);
// se deriva de la operación generada para no redefinir la forma a mano (FR-016).
export type UploadEvidenceResponse =
  OrdersOperations['uploadOrderEvidence']['responses'][201]['content']['application/json'];

// Vista de sesión (data-model.md §1): identidad en memoria.
export interface SessionUser {
  userId: string;
  name: string;
  role: Role;
}

export function toSessionUser(u: UserIdentity): SessionUser {
  return { userId: u.id, name: u.username, role: u.role };
}
