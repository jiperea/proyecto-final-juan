import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { startOrderWork, submitOrderExecution } from '../../src/features/orders/write-api';
import { server } from '../../mocks/server';

const OID = '00000000-0000-7000-8000-0000000000aa';
const validExec = {
  notes: 'Trabajo realizado',
  evidence: [{ object_ref: crypto.randomUUID(), content_type: 'image/jpeg' as const, size_bytes: 1024 }],
};

describe('FE-2 · capa api write (mapeo de códigos reales del contrato, FR-006)', () => {
  it('startOrderWork éxito → Order en in_progress', async () => {
    const order = await startOrderWork(OID);
    expect(order.status).toBe('in_progress');
  });

  it('422 INVALID_TRANSITION → ApiError 422 con mensaje mapeado (no 409)', async () => {
    server.use(
      http.post(`/v1/orders/:id/start`, () =>
        HttpResponse.json({ code: 'INVALID_TRANSITION', message: 'x' }, { status: 422 }),
      ),
    );
    await expect(startOrderWork(OID)).rejects.toMatchObject({
      name: 'ApiError',
      status: 422,
      code: 'INVALID_TRANSITION',
    });
  });

  it('404 uniforme (orden ajena/inexistente) → ApiError 404', async () => {
    server.use(
      http.post(`/v1/orders/:id/start`, () =>
        HttpResponse.json({ code: 'NOT_FOUND', message: 'x' }, { status: 404 }),
      ),
    );
    await expect(startOrderWork(OID)).rejects.toMatchObject({ status: 404 });
  });

  it('403 FORBIDDEN_ROLE → ApiError 403', async () => {
    server.use(
      http.post(`/v1/orders/:id/start`, () =>
        HttpResponse.json({ code: 'FORBIDDEN_ROLE', message: 'x' }, { status: 403 }),
      ),
    );
    await expect(startOrderWork(OID)).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN_ROLE' });
  });

  it('submitOrderExecution éxito → Order en pending_review', async () => {
    const order = await submitOrderExecution(OID, validExec);
    expect(order.status).toBe('pending_review');
  });

  it('K-001 · orden ajena + payload inválido → 422 (payload primero, no 404)', async () => {
    server.use(
      http.post(`/v1/orders/:id/execution`, () =>
        HttpResponse.json({ code: 'VALIDATION_ERROR', message: 'x' }, { status: 422 }),
      ),
    );
    await expect(submitOrderExecution(OID, validExec)).rejects.toMatchObject({ status: 422 });
  });

  it('valida el body contra el contrato ANTES de enviar (SC-005): 0 evidencias no llega al backend', async () => {
    await expect(submitOrderExecution(OID, { notes: 'x', evidence: [] })).rejects.toBeInstanceOf(Error);
  });

  it('mapea EVIDENCE_REQUIRED e INVALID_EVIDENCE del backend (SC-003)', async () => {
    server.use(
      http.post(`/v1/orders/:id/execution`, () =>
        HttpResponse.json({ code: 'EVIDENCE_REQUIRED', message: 'x' }, { status: 422 }),
      ),
    );
    await expect(submitOrderExecution(OID, validExec)).rejects.toMatchObject({
      status: 422,
      code: 'EVIDENCE_REQUIRED',
    });
    server.use(
      http.post(`/v1/orders/:id/execution`, () =>
        HttpResponse.json({ code: 'INVALID_EVIDENCE', message: 'x' }, { status: 422 }),
      ),
    );
    await expect(submitOrderExecution(OID, validExec)).rejects.toMatchObject({ code: 'INVALID_EVIDENCE' });
  });
});
