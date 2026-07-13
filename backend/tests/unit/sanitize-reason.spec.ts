import { describe, expect, it } from 'vitest';
import {
  REASON_MAX,
  sanitizeReason,
  validateReason,
} from '../../src/domain/order/write-side/sanitize-reason';

describe('sanitizeReason (006, FR-003/FR-008)', () => {
  it('trims outer whitespace', () => {
    expect(sanitizeReason('   hola   ')).toBe('hola');
  });

  it('collapses internal horizontal whitespace runs to a single space', () => {
    expect(sanitizeReason('a\t\t  b   c')).toBe('a b c');
  });

  it('preserves newlines (Cc salvo \\n)', () => {
    expect(sanitizeReason('a\nb')).toBe('a\nb');
  });

  it('strips control chars Cc except newline', () => {
    // U+0000, U+0007 (bell), U+001F, U+007F stripped; letters kept
    expect(sanitizeReason('a\u0000\u0007b\u001Fc\u007Fd')).toBe('abcd');
  });

  it('normaliza a NFC (é compuesto == é descompuesto)', () => {
    const composed = 'caf\u00e9'; // é = U+00E9
    const decomposed = 'cafe\u0301'; // e + combining acute U+0301
    expect(sanitizeReason(decomposed)).toBe(sanitizeReason(composed));
    expect([...sanitizeReason(decomposed)].length).toBe(4);
  });

  it('is idempotent', () => {
    const once = sanitizeReason('  a\t b c  ');
    expect(sanitizeReason(once)).toBe(once);
  });

  it('deja vacío un motivo sólo-whitespace o sólo-control', () => {
    expect(sanitizeReason('   \t  ')).toBe('');
    expect(sanitizeReason(' ')).toBe('');
    expect(sanitizeReason('\n\n')).toBe(''); // trim quita \n de los extremos
    expect(sanitizeReason('')).toBe('');
  });
});

describe('validateReason (006)', () => {
  it('acepta un motivo válido y devuelve el saneado', () => {
    const r = validateReason('  Trabajo   incompleto  ');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe('Trabajo incompleto');
  });

  it('rechaza vacío tras saneo → INVALID_REASON (no interpola el texto)', () => {
    const r = validateReason('   \t  ');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('INVALID_REASON');
      expect(r.error.message).not.toContain('\t');
    }
  });

  it('acepta un motivo con mucho whitespace que colapsa a ≤1000 (G2/K2)', () => {
    const raw = 'a' + ' '.repeat(1200) + 'b'; // ~1202 crudo → "a b" tras saneo
    const r = validateReason(raw);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe('a b');
  });

  it('rechaza >1000 code points TRAS saneo → INVALID_REASON', () => {
    const r = validateReason('x'.repeat(REASON_MAX + 1));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('INVALID_REASON');
  });

  it('acepta exactamente 1000 tras saneo', () => {
    const r = validateReason('x'.repeat(REASON_MAX));
    expect(r.ok).toBe(true);
  });
});
