import { describe, it, expect, vi } from 'vitest';
import { reassignOrder } from '../../src/domain/order/write-side/reassign-order';
import type {
  OrderReassignmentPort,
  ReassignmentSnapshot,
  UserLookupPort,
} from '../../src/domain/order/write-side/write-side-ports';
import { ok, err, domainError } from '../../src/domain/result';
import type { OrderRecord } from '../../src/domain/order/model';

const T1 = '018f1000-0000-7000-8000-000000000002';
const T2 = '018f1000-0000-7000-8000-000000000006';

const snapshot: ReassignmentSnapshot = { id: 'o1', status: 'assigned', assignedTo: T1, version: 0 };

const record: OrderRecord = {
  id: 'o1',
  title: 't',
  description: 'd',
  status: 'assigned',
  assignedTo: T2,
  version: 1,
  createdAt: new Date(0),
  updatedAt: new Date(0),
};

function deps(over: {
  tech?: UserLookupPort['findAssignableTechnician'];
  reassign?: OrderReassignmentPort['reassign'];
} = {}) {
  return {
    users: { findAssignableTechnician: vi.fn(over.tech ?? (async () => ({ id: T2 }))) },
    reassignment: { reassign: vi.fn(over.reassign ?? (async () => ok(record))) },
  };
}

describe('reassignOrder (use case, FR-005/007)', () => {
  it('happy path: valida destino y delega en el puerto atómico', async () => {
    const d = deps();
    const res = await reassignOrder(d, { snapshot, assigneeId: T2, reason: 'motivo', actorId: 'disp' });
    expect(res.ok).toBe(true);
    expect(d.reassignment.reassign).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: 'o1', assigneeId: T2, actorId: 'disp' }),
    );
  });

  it('destino = asignatario actual → 422 INVALID_ASSIGNEE, sin tocar el puerto atómico', async () => {
    const d = deps();
    const res = await reassignOrder(d, { snapshot, assigneeId: T1, reason: 'm', actorId: 'disp' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('INVALID_ASSIGNEE');
    expect(d.reassignment.reassign).not.toHaveBeenCalled();
  });

  it('destino inexistente/no-technician/deshabilitado → 422 INVALID_ASSIGNEE (cuerpo genérico)', async () => {
    const d = deps({ tech: async () => null });
    const res = await reassignOrder(d, { snapshot, assigneeId: T2, reason: 'm', actorId: 'disp' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('INVALID_ASSIGNEE');
    expect(d.reassignment.reassign).not.toHaveBeenCalled();
  });

  it('propaga la clasificación de 0-filas del puerto (404 no-visible)', async () => {
    const d = deps({ reassign: async () => err(domainError('ORDER_NOT_FOUND', 'La orden no existe.')) });
    const res = await reassignOrder(d, { snapshot, assigneeId: T2, reason: 'm', actorId: 'disp' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('ORDER_NOT_FOUND');
  });
});
