// Caso de uso de dominio: registrar la ejecución de una orden propia (005, US2, FR-002). Módulo write-side
// PROPIO de 005 (no reutiliza applyTransition de 002b). Puro: valida el payload (evidencia ANTES que notas,
// FR-003/005) y delega la mutación atómica (transición→auditoría→evidencia→notas) en el puerto propio de 005.
// El actor viene server-side (del token, FR-007); nunca del body.
import { domainError, err, ok, type Result } from '../../result';
import type { OrderRecord } from '../model';
import { validateEvidence, type EvidenceRefInput } from '../evidence';
import type { OrderExecutionPort } from './write-side-ports';

export const NOTES_MAX = 2000;

export interface SubmitExecutionDeps {
  readonly execution: OrderExecutionPort;
}

export interface ExecutionPayload {
  readonly notes: string;
  readonly evidence: readonly EvidenceRefInput[];
}

export interface SubmitExecutionInput extends ExecutionPayload {
  readonly orderId: string;
  /** Actor server-side (del token). */
  readonly actorId: string;
}

// Notas: 1..2000 code points, con ≥1 carácter imprimible (rechaza vacío/whitespace/sólo control). El texto es
// payload PII; el mensaje de error NUNCA lo interpola (FR-005).
function validateNotes(notes: string): Result<string> {
  const codePoints = [...notes].length;
  if (codePoints < 1 || codePoints > NOTES_MAX) {
    return err(domainError('VALIDATION_ERROR', 'Notas inválidas.', { details: { fields: ['notes'] } }));
  }
  if (!/[^\s\p{Cc}\p{Cf}]/u.test(notes)) {
    return err(domainError('VALIDATION_ERROR', 'Notas inválidas.', { details: { fields: ['notes'] } }));
  }
  return { ok: true, value: notes };
}

/**
 * Valida SÓLO el payload (evidencia PRIMERO, luego notas — FR-003/005), sin tocar el recurso. El handler la
 * invoca ANTES del chequeo de formato de `orderId` para garantizar la precedencia "payload primero"
 * (orderId malformado + payload inválido → 422 payload, no 404).
 */
export function validateExecutionPayload(payload: ExecutionPayload): Result<ExecutionPayload> {
  // (1) Evidencia PRIMERO (FR-005): EVIDENCE_REQUIRED (0) / INVALID_EVIDENCE (resto).
  const evidence = validateEvidence(payload.evidence);
  if (!evidence.ok) {
    return err(evidence.error);
  }
  // (2) Notas después: VALIDATION_ERROR.
  const notes = validateNotes(payload.notes);
  if (!notes.ok) {
    return err(notes.error);
  }
  return ok({ notes: notes.value, evidence: evidence.value });
}

export async function submitExecution(
  deps: SubmitExecutionDeps,
  input: SubmitExecutionInput,
): Promise<Result<OrderRecord>> {
  const payload = validateExecutionPayload({ notes: input.notes, evidence: input.evidence });
  if (!payload.ok) {
    return err(payload.error);
  }
  // Mutación atómica + auditoría/evidencia/notas; el puerto clasifica el 0-filas (404/422).
  return deps.execution.submitExecution({
    orderId: input.orderId,
    actorId: input.actorId,
    notes: payload.value.notes,
    evidence: payload.value.evidence,
  });
}
