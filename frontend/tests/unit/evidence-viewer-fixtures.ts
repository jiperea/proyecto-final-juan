// 025 (T002) · Fixtures + helpers de mock reutilizables para el visor de evidencia (lightbox + carrusel).
// Sin backend real ni seed: `getOrderEvidence` se mockea vía MSW (mismo patrón que
// `order-detail-evidence-open.test.tsx` de 024), y `getOrderDetail` devuelve `evidence.items[]` fijos.
import { http, HttpResponse, delay } from 'msw';
import { server } from '../../mocks/server';

export const ORDER_A = 'evid0025-0000-0000-0000-00000000a0a0';
export const ORDER_B = 'evid0025-0000-0000-0000-00000000b0b0';

export const EVIDENCE_ID_1 = 'e5e5e5e5-0000-0000-0000-000000000001';
export const EVIDENCE_ID_2 = 'e5e5e5e5-0000-0000-0000-000000000002';
export const EVIDENCE_ID_3 = 'e5e5e5e5-0000-0000-0000-000000000003';
export const EVIDENCE_ID_B1 = 'b5b5b5b5-0000-0000-0000-000000000001';

// N=1 y N>=2 (spec: US1 se verifica con N=1; US2/carrusel con N>=2 — aquí N=3 para cubrir extremos+medio).
export const ITEMS_N1 = [{ evidence_id: EVIDENCE_ID_1, content_type: 'image/jpeg' }];
export const ITEMS_N3 = [
  { evidence_id: EVIDENCE_ID_1, content_type: 'image/jpeg' },
  { evidence_id: EVIDENCE_ID_2, content_type: 'image/png' },
  { evidence_id: EVIDENCE_ID_3, content_type: 'image/webp' },
];
export const ITEMS_B1 = [{ evidence_id: EVIDENCE_ID_B1, content_type: 'image/png' }];

export function bootAs(role: 'technician' | 'supervisor' | 'dispatcher'): void {
  server.use(
    http.get('/v1/auth/me', () =>
      HttpResponse.json({ user: { id: 'u1', email: 'u@fieldops.test', username: 'usuario', role } }),
    ),
  );
}

interface EvidenceItem {
  evidence_id: string;
  content_type: string;
}

// getOrderDetail con evidence.items[] (024/FR-014 assumption: orden de items === orden de tiles).
// `items: undefined` reproduce el fallback LEGACY (sin evidence_id, tile no interactivo — edge de 025).
export function orderDetailResponse(
  id: string,
  title: string,
  opts: { items?: EvidenceItem[]; legacyCount?: number } = {},
) {
  const { items, legacyCount } = opts;
  const count = items !== undefined ? items.length : (legacyCount ?? 0);
  const content_types = items !== undefined ? items.map((i) => i.content_type) : Array(count).fill('image/jpeg');
  return {
    order: {
      id,
      title,
      description: 'desc',
      status: 'pending_review',
      assigned_to: 'u1',
      version: 0,
      created_at: '2026-07-14T00:00:00Z',
      updated_at: '2026-07-14T00:00:00Z',
    },
    evidence: {
      count,
      content_types,
      ...(items !== undefined ? { items } : {}),
    },
  };
}

const PNG_BYTES = new Uint8Array([1, 2, 3]);

export function mockEvidence200(orderId: string, evidenceId: string, delayMs = 0): void {
  server.use(
    http.get(`/v1/orders/${orderId}/evidence/${evidenceId}`, async () => {
      if (delayMs > 0) await delay(delayMs);
      return HttpResponse.arrayBuffer(PNG_BYTES.buffer, {
        status: 200,
        headers: { 'Content-Type': 'image/jpeg' },
      });
    }),
  );
}

export function mockEvidence410(orderId: string, evidenceId: string): void {
  server.use(
    http.get(`/v1/orders/${orderId}/evidence/${evidenceId}`, () =>
      HttpResponse.json({ code: 'EVIDENCE_GONE', message: 'no disponible' }, { status: 410 }),
    ),
  );
}

export function mockEvidence404(orderId: string, evidenceId: string): void {
  server.use(
    http.get(`/v1/orders/${orderId}/evidence/${evidenceId}`, () =>
      HttpResponse.json({ code: 'NOT_FOUND', message: 'not found' }, { status: 404 }),
    ),
  );
}

export function mockEvidence500(orderId: string, evidenceId: string): void {
  server.use(
    http.get(`/v1/orders/${orderId}/evidence/${evidenceId}`, () =>
      HttpResponse.json({ code: 'INTERNAL', message: 'boom' }, { status: 500 }),
    ),
  );
}

// Sin respuesta HTTP (offline/timeout) — mismo mecanismo que `apiFetchBlob`/`apiFetch` mapean a OFFLINE_MESSAGE.
export function mockEvidenceNetworkError(orderId: string, evidenceId: string): void {
  server.use(http.get(`/v1/orders/${orderId}/evidence/${evidenceId}`, () => HttpResponse.error()));
}
