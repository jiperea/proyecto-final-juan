// Caso de uso de dominio: valida la FSM y delega la aplicación atómica en el puerto (FR-002/006/007).
// No escribe estado directamente (único punto de escritura = repo de transición, D6/FR-006).
import { err, type Result } from '../../result';
import { domainError } from '../../result';
import type { OrderRecord } from '../model';
import { legalOriginsFor } from '../transition-table';
import type { ApplyTransitionInput, OrderTransitionPort } from './transition-ports';

export interface ApplyTransitionDeps {
  readonly transition: OrderTransitionPort;
}

export async function applyTransition(
  deps: ApplyTransitionDeps,
  input: ApplyTransitionInput,
): Promise<Result<OrderRecord>> {
  // Fast-fail: si el destino no es alcanzable por NINGUNA transición legal (p.ej. `draft`/`assigned`),
  // es ilegal sin necesidad de tocar la BD. La legalidad origen→destino concreta se reafirma en el WHERE atómico.
  if (legalOriginsFor(input.toStatus).length === 0) {
    return err(domainError('INVALID_TRANSITION', 'Transición de estado no permitida.'));
  }
  return deps.transition.applyTransition(input);
}
