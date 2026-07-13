// DTOs de salida del contrato getOrderDetail (snake_case externo). Derivados de orders.openapi.yaml v1.5.0
// (OrderDetailResponse + EvidenceMeta). Sin lógica. Los tres campos de trabajo son OPCIONALES/omitibles
// (convención uniforme: se omite la clave, nunca `null`). Los tipos internos camelCase viven en el dominio
// (domain/order/read-side/ports.ts: OrderDetailSnapshot/EvidenceMeta) para no invertir capas (III).
import type { OrderDto } from '../contract/order-types';

export interface EvidenceMetaDto {
  count: number;
  content_types: string[];
}

export interface OrderDetailResponseDto {
  order: OrderDto;
  notes?: string;
  evidence?: EvidenceMetaDto;
  last_rejection_reason?: string;
}
