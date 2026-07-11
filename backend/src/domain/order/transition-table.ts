// FSM de Order como TABLA DE DATOS en el dominio (D1, FR-001). Sin lógica dispersa por feature.
// `draft` es estado semilla SIN transición saliente en el alcance del proyecto (G1:H-001): la creación
// de órdenes está fuera del proyecto, ninguna feature transiciona `draft→*`.
import type { OrderStatus } from './model';

// Pares legales origen→destino (única fuente de verdad de la FSM).
export const LEGAL_TRANSITIONS: readonly (readonly [OrderStatus, OrderStatus])[] = [
  ['assigned', 'in_progress'],
  ['in_progress', 'pending_review'],
  ['pending_review', 'closed'],
  ['pending_review', 'in_progress'], // rechazo de revisión
] as const;

const LEGAL_SET: ReadonlySet<string> = new Set(
  LEGAL_TRANSITIONS.map(([from, to]) => `${from}->${to}`),
);

/** ¿Es legal la transición `from`→`to`? Todo lo no listado (mismo estado, desde `closed`, `draft→*`) es ilegal. */
export function isLegalTransition(from: OrderStatus, to: OrderStatus): boolean {
  return LEGAL_SET.has(`${from}->${to}`);
}

/** Estados de origen desde los que `to` es alcanzable por una transición legal (vacío ⇒ destino inalcanzable). */
export function legalOriginsFor(to: OrderStatus): OrderStatus[] {
  return LEGAL_TRANSITIONS.filter(([, dst]) => dst === to).map(([src]) => src);
}
