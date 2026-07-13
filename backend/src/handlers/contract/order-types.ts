import type { OrderStatus } from '../../domain/order/model';

// DTOs de respuesta del contrato listOrders (snake_case externo). Derivados de orders.openapi.yaml.
export interface OrderDto {
  id: string;
  title: string;
  description: string;
  status: OrderStatus;
  assigned_to: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface OrderListResponseDto {
  orders: OrderDto[];
}

// 005 — DTOs del registro de ejecución (snake_case externo, derivados del contrato ExecutionRequest/EvidenceRef).
export interface EvidenceRefDto {
  object_ref: string;
  content_type: string;
  size_bytes: number;
}

export interface ExecutionRequestDto {
  notes: string;
  evidence: EvidenceRefDto[];
}

// 006 — DTO de la decisión de revisión (derivado del contrato ReviewRequest).
export interface ReviewRequestDto {
  decision: 'approve' | 'reject';
  reason?: string;
}
