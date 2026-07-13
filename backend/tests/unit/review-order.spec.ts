import { describe, expect, it, vi } from 'vitest';
import { ok, type Result } from '../../src/domain/result';
import type { OrderRecord } from '../../src/domain/order/model';
import {
  reviewOrder,
  validateReviewReason,
  type ReviewOrderDeps,
} from '../../src/domain/order/write-side/review-order';

const RECORD: OrderRecord = {
  id: '00000000-0000-0000-0000-000000000001',
  title: 't',
  description: 'd',
  status: 'closed',
  assignedTo: null,
  version: 1,
  createdAt: new Date(0),
  updatedAt: new Date(0),
};

function depsWithSpy(): { deps: ReviewOrderDeps; spy: ReturnType<typeof vi.fn> } {
  const spy = vi.fn((): Promise<Result<OrderRecord>> => Promise.resolve(ok(RECORD)));
  return { deps: { review: { review: spy } }, spy };
}

const ORDER = '00000000-0000-0000-0000-000000000001';
const ACTOR = '00000000-0000-0000-0000-0000000000aa';

describe('validateReviewReason (006, FR-008)', () => {
  it('approve sin reason → null (opcional)', () => {
    const r = validateReviewReason('approve', undefined);
    expect(r.ok && r.value === null).toBe(true);
  });

  it('approve con reason válido → saneado', () => {
    const r = validateReviewReason('approve', '  ok  ');
    expect(r.ok && r.value === 'ok').toBe(true);
  });

  it('approve con reason vacío-tras-saneo → INVALID_REASON', () => {
    const r = validateReviewReason('approve', '   ');
    expect(!r.ok && r.error.code === 'INVALID_REASON').toBe(true);
  });

  it('reject sin reason → INVALID_REASON (obligatorio)', () => {
    const r = validateReviewReason('reject', undefined);
    expect(!r.ok && r.error.code === 'INVALID_REASON').toBe(true);
  });

  it('reject con reason válido → saneado', () => {
    const r = validateReviewReason('reject', 'faltan fotos');
    expect(r.ok && r.value === 'faltan fotos').toBe(true);
  });

  it('reject con >1000 tras saneo → INVALID_REASON', () => {
    const r = validateReviewReason('reject', 'x'.repeat(1001));
    expect(!r.ok && r.error.code === 'INVALID_REASON').toBe(true);
  });
});

describe('reviewOrder (006) delega en el puerto con el motivo saneado', () => {
  it('approve → decision approve, reason null', async () => {
    const { deps, spy } = depsWithSpy();
    const r = await reviewOrder(deps, { orderId: ORDER, actorId: ACTOR, decision: 'approve' });
    expect(r.ok).toBe(true);
    expect(spy).toHaveBeenCalledWith({ orderId: ORDER, actorId: ACTOR, decision: 'approve', reason: null });
  });

  it('reject → decision reject, reason saneado', async () => {
    const { deps, spy } = depsWithSpy();
    const r = await reviewOrder(deps, {
      orderId: ORDER,
      actorId: ACTOR,
      decision: 'reject',
      reason: '  trabajo   incompleto ',
    });
    expect(r.ok).toBe(true);
    expect(spy).toHaveBeenCalledWith({
      orderId: ORDER,
      actorId: ACTOR,
      decision: 'reject',
      reason: 'trabajo incompleto',
    });
  });

  it('reject sin reason → no llama al puerto (422 INVALID_REASON)', async () => {
    const { deps, spy } = depsWithSpy();
    const r = await reviewOrder(deps, { orderId: ORDER, actorId: ACTOR, decision: 'reject' });
    expect(!r.ok && r.error.code === 'INVALID_REASON').toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });
});
