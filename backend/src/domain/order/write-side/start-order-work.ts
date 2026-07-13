// Caso de uso de dominio: iniciar el trabajo de una orden propia (005, US1, FR-001). Módulo write-side
// PROPIO de 005 (no reutiliza applyTransition de 002b). No escribe estado directamente: delega la mutación
// atómica (UPDATE condicional + auditoría) en el puerto propio de 005, que además clasifica el 0-filas con
// classify-execution-guard (pertenencia 404 → estado 422). El actor viene server-side (del token, FR-007).
import type { Result } from '../../result';
import type { OrderRecord } from '../model';
import type { StartOrderWorkPort } from './write-side-ports';

export interface StartOrderWorkDeps {
  readonly start: StartOrderWorkPort;
}

export interface StartOrderWorkInput {
  readonly orderId: string;
  /** Actor server-side (del token). */
  readonly actorId: string;
}

export async function startOrderWork(
  deps: StartOrderWorkDeps,
  input: StartOrderWorkInput,
): Promise<Result<OrderRecord>> {
  return deps.start.startWork({ orderId: input.orderId, actorId: input.actorId });
}
