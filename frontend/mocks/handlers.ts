import { http, HttpResponse } from 'msw';

// Handlers MSW derivados de los contratos congelados (auth + orders). Scaffold de Phase 1;
// los casos por código (401/403/404/500/503) y por rol se completan en los tests de cada historia.
const BASE = '/v1';

const TECH_USER = {
  id: '00000000-0000-7000-8000-000000000001',
  email: 'ana@fieldops.test',
  username: 'ana',
  role: 'technician' as const,
};

export const handlers = [
  http.post(`${BASE}/auth/login`, () =>
    HttpResponse.json({ access_token: 'test.access.token', user: TECH_USER }, { status: 200 }),
  ),
  http.get(`${BASE}/auth/me`, () => HttpResponse.json({ user: TECH_USER }, { status: 200 })),
  http.post(`${BASE}/auth/refresh`, () =>
    HttpResponse.json({ access_token: 'test.access.token.2', user: TECH_USER }, { status: 200 }),
  ),
  http.post(`${BASE}/auth/logout`, () => new HttpResponse(null, { status: 204 })),
  http.get(`${BASE}/orders`, () => HttpResponse.json({ orders: [] }, { status: 200 })),
  // FE-2 write-ops (por defecto éxito → Order actualizada; los tests sobreescriben con server.use).
  http.post(`${BASE}/orders/:orderId/start`, ({ params }) =>
    HttpResponse.json(
      {
        id: String(params.orderId),
        title: 'Orden',
        description: 'desc',
        status: 'in_progress',
        assigned_to: TECH_USER.id,
        version: 1,
        created_at: '2026-07-14T00:00:00Z',
        updated_at: '2026-07-14T00:01:00Z',
      },
      { status: 200 },
    ),
  ),
  // 024 (T032) · uploadOrderEvidence (por defecto éxito → object_ref staged; los tests sobreescriben).
  http.post(`${BASE}/orders/:orderId/evidence`, () =>
    HttpResponse.json({ object_ref: crypto.randomUUID() }, { status: 201 }),
  ),
  http.post(`${BASE}/orders/:orderId/execution`, ({ params }) =>
    HttpResponse.json(
      {
        id: String(params.orderId),
        title: 'Orden',
        description: 'desc',
        status: 'pending_review',
        assigned_to: TECH_USER.id,
        version: 2,
        created_at: '2026-07-14T00:00:00Z',
        updated_at: '2026-07-14T00:02:00Z',
      },
      { status: 200 },
    ),
  ),
  // FE-3 reassign (por defecto éxito → Order con el nuevo assigned_to del cuerpo; los tests sobreescriben).
  http.post(`${BASE}/orders/:orderId/reassignments`, async ({ params, request }) => {
    const body = (await request.json().catch(() => ({}))) as { assignee_id?: string };
    return HttpResponse.json(
      {
        id: String(params.orderId),
        title: 'Orden',
        description: 'desc',
        status: 'assigned',
        assigned_to: body.assignee_id ?? null,
        version: 1,
        created_at: '2026-07-14T00:00:00Z',
        updated_at: '2026-07-14T00:03:00Z',
      },
      { status: 200 },
    );
  }),
  // FE-4 review (por defecto approve→closed; los tests sobreescriben con server.use).
  http.post(`${BASE}/orders/:orderId/review`, async ({ params, request }) => {
    const body = (await request.json().catch(() => ({}))) as { decision?: string };
    return HttpResponse.json(
      {
        id: String(params.orderId),
        title: 'Orden',
        description: 'desc',
        status: body.decision === 'reject' ? 'in_progress' : 'closed',
        assigned_to: TECH_USER.id,
        version: 3,
        created_at: '2026-07-14T00:00:00Z',
        updated_at: '2026-07-14T00:04:00Z',
      },
      { status: 200 },
    );
  }),
  // FE-4 resumen IA (por defecto sufficient=true).
  http.post(`${BASE}/orders/:orderId/ai-summary`, () =>
    HttpResponse.json({ sufficient: true, summary: 'Resumen de la incidencia.' }, { status: 200 }),
  ),
  http.get(`${BASE}/orders/:orderId`, ({ params }) =>
    HttpResponse.json(
      {
        order: {
          id: String(params.orderId),
          title: 'Orden de prueba',
          description: 'desc',
          status: 'assigned',
          assigned_to: null,
          version: 0,
          created_at: '2026-07-14T00:00:00Z',
          updated_at: '2026-07-14T00:00:00Z',
        },
      },
      { status: 200 },
    ),
  ),
];
