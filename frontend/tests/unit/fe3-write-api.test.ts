import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { reassignOrder } from '../../src/features/orders/write-api';
import { server } from '../../mocks/server';

// FR-002/003/006/007/008/009/015/016 · capa api de reasignación (mapeo de códigos reales del contrato).
const OID = '00000000-0000-7000-8000-0000000000cc';
const DEST = '018f1000-0000-7000-8000-000000000006';
const body = { assignee_id: DEST, reason: 'Cambio de zona' };

describe('FE-3 · capa api reassign', () => {
  it('éxito → Order con nuevo assigned_to y version+1, status sin cambio', async () => {
    const order = await reassignOrder(OID, body);
    expect(order.assigned_to).toBe(DEST);
    expect(order.status).toBe('assigned');
    expect(order.version).toBe(1);
  });

  it('body inválido (assignee_id no-UUID) → NO llama al backend (Zod lanza antes)', async () => {
    let called = false;
    server.use(
      http.post(`/v1/orders/:id/reassignments`, () => {
        called = true;
        return HttpResponse.json({}, { status: 200 });
      }),
    );
    await expect(reassignOrder(OID, { assignee_id: 'no-uuid', reason: 'x' })).rejects.toBeTruthy();
    expect(called).toBe(false);
  });

  it.each([
    ['VALIDATION_ERROR', 422],
    ['INVALID_ASSIGNEE', 422],
    ['FORBIDDEN_ROLE', 403],
    ['NOT_FOUND', 404],
  ])('%s → ApiError %d con código mapeado', async (code, status) => {
    server.use(
      http.post(`/v1/orders/:id/reassignments`, () => HttpResponse.json({ code, message: 'x' }, { status })),
    );
    await expect(reassignOrder(OID, body)).rejects.toMatchObject({ name: 'ApiError', status, code });
  });

  it('500 INTERNAL → ApiError 500 (FR-015)', async () => {
    server.use(
      http.post(`/v1/orders/:id/reassignments`, () =>
        HttpResponse.json({ code: 'INTERNAL', message: 'x' }, { status: 500 }),
      ),
    );
    await expect(reassignOrder(OID, body)).rejects.toMatchObject({ status: 500 });
  });

  it('fallo de red → ApiError 0 con mensaje de conectividad (FR-016)', async () => {
    server.use(http.post(`/v1/orders/:id/reassignments`, () => HttpResponse.error()));
    await expect(reassignOrder(OID, body)).rejects.toMatchObject({ status: 0 });
  });
});
