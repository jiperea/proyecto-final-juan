import { describe, it, expect } from 'vitest';
import {
  classifyExecutionGuard,
  type OrderGuardSnapshot,
} from '../../src/domain/order/write-side/classify-execution-guard';

// T010b (005) — clasificador PROPIO de 005 (compartido start/execution). Recibe el snapshot re-leído tras un
// UPDATE de 0 filas y clasifica con precedencia PERTENENCIA(404) → ESTADO(422). No reutiliza classifyZeroRows
// de 002b (que es NOT_FOUND→VERSION→TRANSITION→GUARD). Sin rama de versión (el UPDATE de 005 no keyea version).

const ACTOR = '018f1000-0000-7000-8000-000000000002';
const OTHER = '018f1000-0000-7000-8000-000000000006';
const CTX = { actorId: ACTOR, fromStatus: 'assigned' as const, toStatus: 'in_progress' as const };

describe('classifyExecutionGuard (005)', () => {
  it('orden inexistente (null) → ORDER_NOT_FOUND (404)', () => {
    const e = classifyExecutionGuard(null, CTX);
    expect(e.code).toBe('ORDER_NOT_FOUND');
  });

  it('orden AJENA en estado legal → GUARD_UNMET (404, pertenencia antes que estado)', () => {
    const snap: OrderGuardSnapshot = { status: 'assigned', assignedTo: OTHER };
    expect(classifyExecutionGuard(snap, CTX).code).toBe('GUARD_UNMET');
  });

  it('orden AJENA en estado NO legal (incl. closed) → GUARD_UNMET (404, NUNCA 422)', () => {
    const snap: OrderGuardSnapshot = { status: 'closed', assignedTo: OTHER };
    const e = classifyExecutionGuard(snap, CTX);
    expect(e.code).toBe('GUARD_UNMET');
    expect(e.code).not.toBe('INVALID_TRANSITION');
  });

  it('orden AJENA sin asignatario (null) → GUARD_UNMET (404)', () => {
    const snap: OrderGuardSnapshot = { status: 'assigned', assignedTo: null };
    expect(classifyExecutionGuard(snap, CTX).code).toBe('GUARD_UNMET');
  });

  it('orden PROPIA en estado NO legal → INVALID_TRANSITION (422)', () => {
    const snap: OrderGuardSnapshot = { status: 'in_progress', assignedTo: ACTOR };
    expect(classifyExecutionGuard(snap, CTX).code).toBe('INVALID_TRANSITION');
  });

  it('nunca emite VERSION_CONFLICT (005 no usa predicado de versión)', () => {
    const snaps: (OrderGuardSnapshot | null)[] = [
      null,
      { status: 'assigned', assignedTo: OTHER },
      { status: 'closed', assignedTo: ACTOR },
    ];
    for (const s of snaps) {
      expect(classifyExecutionGuard(s, CTX).code).not.toBe('VERSION_CONFLICT');
    }
  });
});
