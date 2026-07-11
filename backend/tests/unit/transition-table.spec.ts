import { describe, it, expect } from 'vitest';
import { isLegalTransition, legalOriginsFor } from '../../src/domain/order/transition-table';
import type { OrderStatus } from '../../src/domain/order/model';

const STATUSES: OrderStatus[] = ['draft', 'assigned', 'in_progress', 'pending_review', 'closed'];
const LEGAL = new Set([
  'assigned->in_progress',
  'in_progress->pending_review',
  'pending_review->closed',
  'pending_review->in_progress',
]);

describe('isLegalTransition — tabla FSM exhaustiva (FR-001/002, D1)', () => {
  for (const from of STATUSES) {
    for (const to of STATUSES) {
      const key = `${from}->${to}`;
      const expected = LEGAL.has(key);
      it(`${key} → ${expected}`, () => {
        expect(isLegalTransition(from, to)).toBe(expected);
      });
    }
  }

  it('ningún mismo-estado es legal', () => {
    for (const s of STATUSES) expect(isLegalTransition(s, s)).toBe(false);
  });

  it('desde closed (terminal) no hay transición saliente', () => {
    for (const to of STATUSES) expect(isLegalTransition('closed', to)).toBe(false);
  });

  it('draft es semilla sin transición saliente (G1:H-001)', () => {
    for (const to of STATUSES) expect(isLegalTransition('draft', to)).toBe(false);
  });
});

describe('legalOriginsFor — orígenes legales por destino', () => {
  it('in_progress se alcanza desde assigned y pending_review (rechazo)', () => {
    expect([...legalOriginsFor('in_progress')].sort()).toEqual(['assigned', 'pending_review']);
  });
  it('pending_review desde in_progress; closed desde pending_review', () => {
    expect(legalOriginsFor('pending_review')).toEqual(['in_progress']);
    expect(legalOriginsFor('closed')).toEqual(['pending_review']);
  });
  it('assigned y draft son inalcanzables (destino sin origen legal)', () => {
    expect(legalOriginsFor('assigned')).toEqual([]);
    expect(legalOriginsFor('draft')).toEqual([]);
  });
});
