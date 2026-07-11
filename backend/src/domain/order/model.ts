// Modelo de dominio Order (002a, read-side). status es DATO (transiciones en 002b).

export type OrderStatus = 'draft' | 'assigned' | 'in_progress' | 'pending_review' | 'closed';

export interface OrderRecord {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly status: OrderStatus;
  readonly assignedTo: string | null;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
