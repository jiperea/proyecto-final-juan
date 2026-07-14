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
