import { describe, it, expect, vi } from 'vitest';
import { applyTransition } from '../../src/domain/order/apply-transition';
import { ok } from '../../src/domain/result';
import type {
  ApplyTransitionInput,
  OrderTransitionPort,
} from '../../src/domain/order/transition-ports';
import type { OrderRecord, OrderStatus } from '../../src/domain/order/model';

function fakePort(): { port: OrderTransitionPort; calls: ApplyTransitionInput[] } {
  const calls: ApplyTransitionInput[] = [];
  const port: OrderTransitionPort = {
    applyTransition: vi.fn(async (input: ApplyTransitionInput) => {
      calls.push(input);
      const value: OrderRecord = {
        id: input.orderId,
        title: 't',
        description: 'd',
        status: input.toStatus,
        assignedTo: null,
        version: input.expectedVersion + 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      return ok(value);
    }),
  };
  return { port, calls };
}

const base = { orderId: 'o1', actorId: 'a1', expectedVersion: 0 } as const;

describe('applyTransition (use case, FR-002/007)', () => {
  it('destino alcanzable → delega en el puerto con el input íntegro', async () => {
    const { port, calls } = fakePort();
    const res = await applyTransition(
      { transition: port },
      { ...base, toStatus: 'in_progress', reason: 'ok' },
    );
    expect(res.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ orderId: 'o1', toStatus: 'in_progress', reason: 'ok' });
  });

  it('destino inalcanzable (assigned/draft) → INVALID_TRANSITION sin tocar el puerto', async () => {
    for (const toStatus of ['assigned', 'draft'] as OrderStatus[]) {
      const { port, calls } = fakePort();
      const res = await applyTransition({ transition: port }, { ...base, toStatus });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error.code).toBe('INVALID_TRANSITION');
      expect(calls).toHaveLength(0);
      expect(port.applyTransition).not.toHaveBeenCalled();
    }
  });
});
