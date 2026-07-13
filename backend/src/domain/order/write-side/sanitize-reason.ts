// 006 — saneo y validación del MOTIVO de revisión (dominio puro, FR-003/FR-008). El motivo es payload PII:
// el mensaje de error NUNCA lo interpola (FR-008). La longitud efectiva 1..1000 se mide SOBRE EL VALOR SANEADO
// (G2/K2), no sobre el crudo (la cota cruda ≤4000 la impone el schema Zod → VALIDATION_ERROR).
import { domainError, err, ok, type Result } from '../../result';

export const REASON_MIN = 1;
export const REASON_MAX = 1000;

// Definición operativa determinista (FR-003, aclaración A1):
//   (1) normalización Unicode NFC;
//   (2) eliminación de caracteres de control Cc (U+0000–U+001F, U+007F) SALVO el salto de línea `\n` (U+000A);
//   (3) colapso de runs de whitespace horizontal (espacios/tabs/…, excepto `\n`) a un único espacio;
//   (4) trim de los extremos.
// "Vacío tras saneo" = longitud 0 del resultado. Idempotente.
export function sanitizeReason(input: string): string {
  const nfc = input.normalize('NFC');
  const noControl = nfc.replace(/[\u0000-\u0009\u000B-\u001F\u007F]/gu, ''); // Cc salvo \n (U+000A)
  const collapsed = noControl.replace(/[^\S\n]+/gu, ' '); // colapsa whitespace horizontal, conserva \n
  return collapsed.trim();
}

// Cuenta CODE POINTS (no UTF-16), como el resto del proyecto (005 notas, 004 reason).
function codePointLength(s: string): number {
  return [...s].length;
}

/**
 * Valida un motivo YA presente (rechazo: obligatorio; aprobación: sólo si se aporta). Saneo → 1..1000 code
 * points tras saneo → ≥1 imprimible. Devuelve el motivo SANEADO (lo que se persistirá en `OrderAudit.reason`).
 * Cualquier fallo → INVALID_REASON (422), sin interpolar el texto.
 */
export function validateReason(raw: string): Result<string> {
  const sanitized = sanitizeReason(raw);
  const len = codePointLength(sanitized);
  if (len < REASON_MIN || len > REASON_MAX) {
    return err(domainError('INVALID_REASON', 'Motivo inválido.', { details: { fields: ['reason'] } }));
  }
  // Tras el saneo (que ya quitó control y colapsó whitespace), exige ≥1 carácter imprimible.
  if (!/[^\s\p{Cc}\p{Cf}]/u.test(sanitized)) {
    return err(domainError('INVALID_REASON', 'Motivo inválido.', { details: { fields: ['reason'] } }));
  }
  return ok(sanitized);
}
