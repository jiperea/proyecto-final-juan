import { describe, expect, it } from 'vitest';
import {
  classifyReviewGuard,
  type ReviewGuardSnapshot,
} from '../../src/domain/order/write-side/classify-review-guard';

describe('classifyReviewGuard (006, FR-007/FR-013, G2/K1/H-003)', () => {
  it('inexistente → GUARD_UNMET (404)', () => {
    expect(classifyReviewGuard(null, { decision: 'approve' }).code).toBe('GUARD_UNMET');
    expect(classifyReviewGuard(null, { decision: 'reject' }).code).toBe('GUARD_UNMET');
  });

  it('estado ≠ pending_review (sin evidencia) → 404, NUNCA 409 (no-enumeración precede al guard)', () => {
    const snap: ReviewGuardSnapshot = { status: 'assigned', evidenceCount: 0 };
    expect(classifyReviewGuard(snap, { decision: 'approve' }).code).toBe('GUARD_UNMET');
  });

  it('estados no-pending varios → 404', () => {
    for (const status of ['assigned', 'in_progress', 'closed', 'draft'] as const) {
      expect(classifyReviewGuard({ status, evidenceCount: 0 }, { decision: 'approve' }).code).toBe(
        'GUARD_UNMET',
      );
    }
  });

  it('pending_review + 0 evidencia + approve → EVIDENCE_MISSING (409)', () => {
    const snap: ReviewGuardSnapshot = { status: 'pending_review', evidenceCount: 0 };
    expect(classifyReviewGuard(snap, { decision: 'approve' }).code).toBe('EVIDENCE_MISSING');
  });

  it('pending_review + 0 evidencia + reject → 404 (reject no tiene guard; 0-filas sólo por no-visibilidad)', () => {
    const snap: ReviewGuardSnapshot = { status: 'pending_review', evidenceCount: 0 };
    expect(classifyReviewGuard(snap, { decision: 'reject' }).code).toBe('GUARD_UNMET');
  });

  it('rama por-defecto fail-safe: pending_review + evidencia (carrera) → 404, nunca 500 (G2/H-003)', () => {
    const snap: ReviewGuardSnapshot = { status: 'pending_review', evidenceCount: 3 };
    expect(classifyReviewGuard(snap, { decision: 'approve' }).code).toBe('GUARD_UNMET');
    expect(classifyReviewGuard(snap, { decision: 'reject' }).code).toBe('GUARD_UNMET');
  });
});
