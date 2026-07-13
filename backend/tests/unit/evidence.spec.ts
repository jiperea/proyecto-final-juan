import { describe, it, expect } from 'vitest';
import { validateEvidence, type EvidenceRefInput } from '../../src/domain/order/evidence';

// T010 (005) — reglas puras de validación de evidencia (dominio, sin BD).
// ≥1 y ≤10; content_type en allowlist; 0 < size_bytes ≤ 26214400; object_ref 1..512 code points sin
// control/whitespace de borde; sin duplicados (igualdad exacta). EVIDENCE_REQUIRED (0) vs INVALID_EVIDENCE (resto).

const valid = (over: Partial<EvidenceRefInput> = {}): EvidenceRefInput => ({
  objectRef: 'ref/opaco/abc-123',
  contentType: 'image/jpeg',
  sizeBytes: 1024,
  ...over,
});

describe('validateEvidence (005, dominio puro)', () => {
  it('acepta 1 evidencia válida', () => {
    const r = validateEvidence([valid()]);
    expect(r.ok).toBe(true);
  });

  it('acepta 10 evidencias válidas (borde superior)', () => {
    const list = Array.from({ length: 10 }, (_, i) => valid({ objectRef: `ref/${i}` }));
    expect(validateEvidence(list).ok).toBe(true);
  });

  it('acepta cada content_type de la allowlist', () => {
    for (const ct of ['image/jpeg', 'image/png', 'image/webp', 'image/heic']) {
      expect(validateEvidence([valid({ contentType: ct })]).ok).toBe(true);
    }
  });

  it('0 evidencias → EVIDENCE_REQUIRED', () => {
    const r = validateEvidence([]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('EVIDENCE_REQUIRED');
  });

  it('11 evidencias (> máximo) → INVALID_EVIDENCE', () => {
    const list = Array.from({ length: 11 }, (_, i) => valid({ objectRef: `ref/${i}` }));
    const r = validateEvidence(list);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('INVALID_EVIDENCE');
  });

  it('content_type fuera de la allowlist → INVALID_EVIDENCE', () => {
    const r = validateEvidence([valid({ contentType: 'image/gif' })]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('INVALID_EVIDENCE');
  });

  it('size_bytes = 0 → INVALID_EVIDENCE', () => {
    expect(validateEvidence([valid({ sizeBytes: 0 })]).ok).toBe(false);
  });

  it('size_bytes = 26214401 (> máximo) → INVALID_EVIDENCE', () => {
    const r = validateEvidence([valid({ sizeBytes: 26214401 })]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('INVALID_EVIDENCE');
  });

  it('size_bytes = 26214400 (borde) → válido', () => {
    expect(validateEvidence([valid({ sizeBytes: 26214400 })]).ok).toBe(true);
  });

  it('object_ref vacío → INVALID_EVIDENCE', () => {
    expect(validateEvidence([valid({ objectRef: '' })]).ok).toBe(false);
  });

  it('object_ref > 512 code points → INVALID_EVIDENCE', () => {
    const r = validateEvidence([valid({ objectRef: 'a'.repeat(513) })]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('INVALID_EVIDENCE');
  });

  it('object_ref con 512 code points (borde) → válido', () => {
    expect(validateEvidence([valid({ objectRef: 'a'.repeat(512) })]).ok).toBe(true);
  });

  it('object_ref con salto de línea (control) → INVALID_EVIDENCE', () => {
    expect(validateEvidence([valid({ objectRef: 'ref\nmalo' })]).ok).toBe(false);
  });

  it('object_ref con whitespace de borde → INVALID_EVIDENCE', () => {
    expect(validateEvidence([valid({ objectRef: ' ref-borde' })]).ok).toBe(false);
    expect(validateEvidence([valid({ objectRef: 'ref-borde ' })]).ok).toBe(false);
  });

  it('object_ref duplicados (igualdad exacta) → INVALID_EVIDENCE', () => {
    const r = validateEvidence([valid({ objectRef: 'igual' }), valid({ objectRef: 'igual' })]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('INVALID_EVIDENCE');
  });

  it('object_ref case-sensitive: "Ref" y "ref" NO son duplicados', () => {
    const r = validateEvidence([valid({ objectRef: 'Ref' }), valid({ objectRef: 'ref' })]);
    expect(r.ok).toBe(true);
  });
});
