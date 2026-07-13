import type { OrderStatus } from '../api/types';

// Mapa exhaustivo status → etiqueta español (FR-007 / SC-008c). `satisfies Record<OrderStatus,…>`
// hace que la compilación FALLE si el contrato añade un estado sin badge.
const LABELS = {
  draft: 'Borrador',
  assigned: 'Asignada',
  in_progress: 'En curso',
  pending_review: 'En revisión',
  closed: 'Cerrada',
} satisfies Record<OrderStatus, string>;

export function StatusBadge({ status }: { status: OrderStatus }) {
  // color + texto: el color nunca es el único portador (WCAG 1.4.1).
  return <span className={`badge badge--${status}`}>{LABELS[status]}</span>;
}
