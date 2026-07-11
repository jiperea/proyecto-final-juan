import { describe, it, expect } from 'vitest';
import { listOrders } from '../../src/domain/order/list-orders';
import { orderScopeFor } from '../../src/domain/order/scope-policy';
import type { OrderScope } from '../../src/domain/order/scope-policy';

describe('listOrders use case (FR-001/016) — usa la política única', () => {
  it('pasa al repo EXACTAMENTE el scope de orderScopeFor(role,userId)', async () => {
    let captured: OrderScope | null = null;
    const orders = {
      listForScope: async (scope: OrderScope) => {
        captured = scope;
        return [];
      },
    };
    await listOrders({ orders }, { role: 'technician', userId: 'u1' });
    expect(captured).toEqual(orderScopeFor('technician', 'u1'));
  });

  it('devuelve lo que devuelve el repo (sin filtrar de más)', async () => {
    const orders = { listForScope: async () => [{ id: 'o1' }] as never };
    const result = await listOrders({ orders }, { role: 'supervisor', userId: 'u9' });
    expect(result).toHaveLength(1);
  });
});
