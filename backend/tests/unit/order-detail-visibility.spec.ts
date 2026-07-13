// T007 (008/#010, US1) — visibilidad del technician (FR-001/FR-004). Puro, sin BD.
import { describe, it, expect } from 'vitest';
import { isOrderVisible } from '../../src/domain/order/read-side/order-detail-visibility';
import type { OrderStatus } from '../../src/domain/order/model';

const T1 = 'tech-1';
const T2 = 'tech-2';

function order(status: OrderStatus, assignedTo: string | null) {
  return { status, assignedTo };
}

describe('isOrderVisible — technician (FR-001/FR-004)', () => {
  it('dueño ve assigned/in_progress/pending_review de SUS órdenes', () => {
    for (const s of ['assigned', 'in_progress', 'pending_review'] as OrderStatus[]) {
      expect(isOrderVisible('technician', T1, order(s, T1))).toBe(true);
    }
  });

  it('orden ajena (otro técnico) → no visible en cualquier estado', () => {
    for (const s of ['assigned', 'in_progress', 'pending_review'] as OrderStatus[]) {
      expect(isOrderVisible('technician', T1, order(s, T2))).toBe(false);
    }
  });

  it('draft y closed fuera de alcance → no visible aunque sea propia', () => {
    expect(isOrderVisible('technician', T1, order('draft', T1))).toBe(false);
    expect(isOrderVisible('technician', T1, order('closed', T1))).toBe(false);
  });

  it('orden sin asignar (assigned_to null) → no visible para el technician', () => {
    expect(isOrderVisible('technician', T1, order('assigned', null))).toBe(false);
  });
});
