import { describe, it, expect } from 'vitest';
import { orderScopeFor } from '../../src/domain/order/scope-policy';
import type { Role } from '../../src/domain/model';

describe('orderScopeFor (FR-002/003/004/016, política única)', () => {
  it('technician → solo sus activas (assigned/in_progress/pending_review)', () => {
    expect(orderScopeFor('technician', 'u1')).toEqual({
      statuses: ['assigned', 'in_progress', 'pending_review'],
      assignedTo: 'u1',
    });
  });

  it('supervisor → solo pending_review, sin filtro de pertenencia', () => {
    expect(orderScopeFor('supervisor', 'u1')).toEqual({
      statuses: ['pending_review'],
      assignedTo: null,
    });
  });

  it('dispatcher → assigned/in_progress, sin filtro de pertenencia', () => {
    expect(orderScopeFor('dispatcher', 'u1')).toEqual({
      statuses: ['assigned', 'in_progress'],
      assignedTo: null,
    });
  });

  it('closed y draft NUNCA están en el alcance de ningún rol', () => {
    for (const role of ['technician', 'supervisor', 'dispatcher'] as Role[]) {
      const scope = orderScopeFor(role, 'u1');
      expect(scope.statuses).not.toContain('closed');
      expect(scope.statuses).not.toContain('draft');
    }
  });
});
