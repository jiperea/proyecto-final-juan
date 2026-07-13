// Reglas puras de validación de EvidenceRef (005, dominio — sin BD, sin frameworks).
// Parámetros derivados del contrato (research.md D1); no números mágicos dispersos por el código.
import { domainError, err, ok, type Result } from '../result';

/** Referencia/metadato de una evidencia (camelCase interno; el DTO externo es snake_case). */
export interface EvidenceRefInput {
  readonly objectRef: string;
  readonly contentType: string;
  readonly sizeBytes: number;
}

export const EVIDENCE_MIN = 1;
export const EVIDENCE_MAX = 10;
export const ALLOWED_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
] as const;
export const SIZE_BYTES_MAX = 26_214_400; // 25 MiB
export const OBJECT_REF_MAX = 512;

const ALLOWED = new Set<string>(ALLOWED_CONTENT_TYPES);

function invalidEvidence(): ReturnType<typeof domainError> {
  return domainError('INVALID_EVIDENCE', 'Alguna evidencia no es válida.', {
    agentAction:
      'Envía entre 1 y 10 evidencias de imagen (jpeg/png/webp/heic), tamaño 1..26214400 bytes, ' +
      'con object_ref bien formado y sin duplicados.',
  });
}

// object_ref: 1..512 code points, sin caracteres de control y sin whitespace de borde (formato opaco).
function objectRefWellFormed(ref: string): boolean {
  const codePoints = [...ref].length;
  if (codePoints < 1 || codePoints > OBJECT_REF_MAX) {
    return false;
  }
  if (/\p{Cc}/u.test(ref)) {
    return false; // caracteres de control (incluye \n, \t, \0, ...)
  }
  if (/^\s|\s$/u.test(ref)) {
    return false; // whitespace de borde
  }
  return true;
}

/**
 * Valida el array de evidencia por referencia (bloqueante, FR-004). No comprueba existencia del objeto
 * (transporte = #007). Devuelve la lista intacta si es válida.
 * - 0 elementos → EVIDENCE_REQUIRED (Brief "al menos una foto").
 * - resto de fallos (>máximo, tipo/tamaño/object_ref inválidos, duplicados exactos) → INVALID_EVIDENCE.
 */
export function validateEvidence(
  evidence: readonly EvidenceRefInput[],
): Result<readonly EvidenceRefInput[]> {
  if (evidence.length < EVIDENCE_MIN) {
    return err(
      domainError('EVIDENCE_REQUIRED', 'Se requiere al menos una evidencia.', {
        agentAction: 'Adjunta al menos una evidencia fotográfica válida.',
      }),
    );
  }
  if (evidence.length > EVIDENCE_MAX) {
    return err(invalidEvidence());
  }
  const seen = new Set<string>();
  for (const item of evidence) {
    if (!ALLOWED.has(item.contentType)) {
      return err(invalidEvidence());
    }
    if (!Number.isInteger(item.sizeBytes) || item.sizeBytes <= 0 || item.sizeBytes > SIZE_BYTES_MAX) {
      return err(invalidEvidence());
    }
    if (!objectRefWellFormed(item.objectRef)) {
      return err(invalidEvidence());
    }
    if (seen.has(item.objectRef)) {
      return err(invalidEvidence()); // duplicado exacto (byte a byte, case-sensitive, sin trim)
    }
    seen.add(item.objectRef);
  }
  return ok(evidence);
}
