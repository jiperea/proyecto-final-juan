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
