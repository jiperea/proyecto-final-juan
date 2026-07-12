import { describe, it, expect, vi } from 'vitest';
import type { Request, Response } from 'express';
import { reassignOrderHandler, type ReassignHandlerDeps } from '../../src/handlers/orders/reassign';
import { ok } from '../../src/domain/result';
import type { OrderRecord } from '../../src/domain/order/model';

const VALID_UUID = '018f2000-0000-7000-8000-0000000000aa';

function fakeRes(): { res: Response; status: () => number; body: () => unknown } {
  let code = 0;
  let payload: unknown = null;
  const res = {
    status(c: number) {
      code = c;
      return res;
    },
    json(b: unknown) {
      payload = b;
      return res;
    },
    setHeader() {
      return res;
    },
  } as unknown as Response;
  return { res, status: () => code, body: () => payload };
}

function req(over: Partial<Request> = {}): Request {
  return {
    auth: { userId: 'disp', sessionId: 's', role: 'dispatcher' },
    params: { orderId: VALID_UUID },
    body: { assignee_id: '018f2000-0000-7000-8000-0000000000bb', reason: 'motivo' },
    ...over,
  } as unknown as Request;
}

const okRecord: OrderRecord = {
  id: 'o',
  title: 't',
  description: 'd',
  status: 'assigned',
  assignedTo: 'x',
  version: 1,
  createdAt: new Date(0),
  updatedAt: new Date(0),
};

describe('reassignOrderHandler — catch-all 500 (SC-009, FR-009)', () => {
  it('si un puerto lanza (error de BD), responde 500 genérico sin filtrar detalle', async () => {
    const deps: ReassignHandlerDeps = {
      visibility: {
        findReassignable: vi.fn(async () => {
          throw new Error('P2003 duplicate key constraint "orders_pkey" SQLSTATE 23505'); // detalle crudo
        }),
      },
      users: { findAssignableTechnician: vi.fn(async () => ({ id: 'x' })) },
      reassignment: { reassign: vi.fn(async () => ok(okRecord)) },
    };
    const { res, status, body } = fakeRes();
    await reassignOrderHandler(deps)(req(), res, vi.fn());
    expect(status()).toBe(500);
    const b = body() as Record<string, unknown>;
    expect(b.code).toBe('INTERNAL');
    expect(typeof b.agent_action).toBe('string');
    // No filtra detalle de Postgres (SQLSTATE/constraint/query) en el cuerpo.
    expect(JSON.stringify(b)).not.toMatch(/P2003|SQLSTATE|orders_pkey|23505/);
  });

  it('rol ≠ dispatcher → 403 FORBIDDEN_ROLE antes de tocar la orden', async () => {
    const deps: ReassignHandlerDeps = {
      visibility: { findReassignable: vi.fn(async () => null) },
      users: { findAssignableTechnician: vi.fn(async () => null) },
      reassignment: { reassign: vi.fn() },
    };
    const { res, status, body } = fakeRes();
    await reassignOrderHandler(deps)(
      req({ auth: { userId: 't', sessionId: 's', role: 'technician' } } as Partial<Request>),
      res,
      vi.fn(),
    );
    expect(status()).toBe(403);
    expect((body() as Record<string, unknown>).code).toBe('FORBIDDEN_ROLE');
    expect(deps.visibility.findReassignable).not.toHaveBeenCalled();
  });
});
