import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { reviewOrder, summarizeIncident } from '../../src/features/orders/write-api';
import { server } from '../../mocks/server';

// FE-4 · capa api review + resumen IA (mapeo de códigos reales del contrato 006/007).
const OID = '018f2000-0000-7000-8000-0000000000f2';

describe('FE-4 · reviewOrder', () => {
  it('approve → Order closed; reject → in_progress', async () => {
    const a = await reviewOrder(OID, { decision: 'approve' });
    expect(a.status).toBe('closed');
    const r = await reviewOrder(OID, { decision: 'reject', reason: 'Faltan fotos' });
    expect(r.status).toBe('in_progress');
  });

  it.each([
    ['VALIDATION_ERROR', 422],
    ['INVALID_REASON', 422],
    ['EVIDENCE_MISSING', 409],
    ['GUARD_UNMET', 404],
    ['FORBIDDEN_ROLE', 403],
    ['INTERNAL', 500],
    ['SERVICE_UNAVAILABLE', 503],
  ])('%s → ApiError %d', async (code, status) => {
    server.use(http.post(`/v1/orders/:id/review`, () => HttpResponse.json({ code, message: 'x' }, { status })));
    await expect(reviewOrder(OID, { decision: 'approve' })).rejects.toMatchObject({ name: 'ApiError', status, code });
  });
});

describe('FE-4 · summarizeIncident', () => {
  it('200 sufficient=true → {sufficient, summary}', async () => {
    const s = await summarizeIncident(OID);
    expect(s.sufficient).toBe(true);
    expect(typeof s.summary).toBe('string');
  });

  it('200 sufficient=false → summary null', async () => {
    server.use(http.post(`/v1/orders/:id/ai-summary`, () => HttpResponse.json({ sufficient: false, summary: null })));
    const s = await summarizeIncident(OID);
    expect(s.sufficient).toBe(false);
    expect(s.summary).toBeNull();
  });

  it.each([
    ['RATE_LIMITED', 429],
    ['SERVICE_UNAVAILABLE', 503],
    ['INTERNAL', 500],
  ])('%s → ApiError %d', async (code, status) => {
    server.use(http.post(`/v1/orders/:id/ai-summary`, () => HttpResponse.json({ code, message: 'x' }, { status })));
    await expect(summarizeIncident(OID)).rejects.toMatchObject({ status });
  });

  it('429 expone retryAfterSeconds de la cabecera Retry-After', async () => {
    server.use(
      http.post(`/v1/orders/:id/ai-summary`, () =>
        HttpResponse.json({ code: 'RATE_LIMITED', message: 'x' }, { status: 429, headers: { 'Retry-After': '42' } }),
      ),
    );
    await expect(summarizeIncident(OID)).rejects.toMatchObject({ status: 429, retryAfterSeconds: 42 });
  });
});
