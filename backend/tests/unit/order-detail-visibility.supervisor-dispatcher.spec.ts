// T019 (008/#010, US2) — visibilidad supervisor/dispatcher + rol no reconocido (FR-001/FR-004). Puro.
import { describe, it, expect } from 'vitest';
import { isOrderVisible } from '../../src/domain/order/read-side/order-detail-visibility';
import type { OrderStatus } from '../../src/domain/order/model';

const U = 'user-x';
const ALL: OrderStatus[] = ['draft', 'assigned', 'in_progress', 'pending_review', 'closed'];

describe('isOrderVisible — supervisor/dispatcher + rol raro (FR-001/FR-004)', () => {
  it('supervisor: solo pending_review (de cualquier técnico de la org)', () => {
    expect(isOrderVisible('supervisor', U, { status: 'pending_review', assignedTo: 'otro' })).toBe(true);
    for (const s of ALL.filter((x) => x !== 'pending_review')) {
      expect(isOrderVisible('supervisor', U, { status: s, assignedTo: 'otro' })).toBe(false);
    }
  });

  it('dispatcher: solo assigned/in_progress', () => {
    expect(isOrderVisible('dispatcher', U, { status: 'assigned', assignedTo: 'otro' })).toBe(true);
    expect(isOrderVisible('dispatcher', U, { status: 'in_progress', assignedTo: null })).toBe(true);
    for (const s of ['draft', 'pending_review', 'closed'] as OrderStatus[]) {
      expect(isOrderVisible('dispatcher', U, { status: s, assignedTo: 'otro' })).toBe(false);
    }
  });

  it('rol no reconocido (claim corrupto) → alcance vacío → nunca visible (fail-secure)', () => {
    for (const s of ALL) {
      expect(isOrderVisible('auditor', U, { status: s, assignedTo: U })).toBe(false);
      expect(isOrderVisible('', U, { status: s, assignedTo: U })).toBe(false);
    }
  });
});
