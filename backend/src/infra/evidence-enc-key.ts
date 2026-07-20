// Feature 026 (FR-013) — validador COMPARTIDO de `EVIDENCE_ENC_KEY`, única fuente de verdad reutilizada
// por `config.ts` (13 campos, arranque del backend) y por el seed de desarrollo (que NO debe invocar
// `loadConfig()` completo, FR-003). Evita que la regla ("presente y ≥32 caracteres") diverja entre ambos.

export const EVIDENCE_ENC_KEY_MIN_LENGTH = 32;

export function isValidEvidenceEncKey(value: unknown): value is string {
  return typeof value === 'string' && value.length >= EVIDENCE_ENC_KEY_MIN_LENGTH;
}
