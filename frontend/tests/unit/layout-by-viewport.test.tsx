// FE-8 (022) · T015 [Red] · US3 · FR-011/FR-011a.
//
// El layout se elige por VIEWPORT, no por rol: <1024px → apilado; ≥1024px → master-detail — para
// CUALQUIER rol (hoy `OrdersView` fuerza `role !== 'technician'`, así que un técnico en escritorio NO
// ve master-detail; este test falla hasta que T016 elimine esa condición de rol).
//
// El criterio operable de «sin scroll horizontal» (`scrollWidth <= clientWidth`, FR-011a) requiere un
// motor de layout real (jsdom no calcula cajas/flex/grid) — se verifica con Playwright MCP en T026;
// aquí se deja constancia de ese traspaso y se cubre lo que SÍ es determinista en jsdom: el layout
// (apilado/master-detail) depende del ancho y no del rol.
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { server } from '../../mocks/server';
import { renderApp } from '../test-utils';
import { AppRoutes } from '../../src/routes/AppRoutes';
import { setAccessToken } from '../../src/api/session-store';
import { setViewportWide } from '../viewport';

function bootAs(role: 'technician' | 'supervisor' | 'dispatcher') {
  server.use(
    http.get('/v1/auth/me', () =>
      HttpResponse.json({ user: { id: 'u1', email: 'u@fieldops.test', username: 'u', role } }),
    ),
  );
}

function order(id: string, title: string, status = 'assigned') {
  return {
    id,
    title,
    description: `desc ${id}`,
    status,
    assigned_to: null,
    version: 0,
    created_at: '2026-07-14T00:00:00Z',
    updated_at: '2026-07-14T00:00:00Z',
  };
}

afterEach(() => setAccessToken(null));

describe.each(['technician', 'dispatcher', 'supervisor'] as const)(
  'FE-8 · layout por viewport, INDEPENDIENTE del rol — %s (FR-011)',
  (role) => {
    it(`≥1024px: master-detail (lista + detalle simultáneos) para ${role}`, async () => {
      setViewportWide(true);
      bootAs(role);
      server.use(
        http.get('/v1/orders', () => HttpResponse.json({ orders: [order('o1', 'Orden A')] })),
        http.get('/v1/orders/o1', () => HttpResponse.json({ order: order('o1', 'Orden A') })),
      );
      renderApp(<AppRoutes />, '/orders/o1');
      expect(await screen.findByRole('heading', { name: 'Orden A' })).toBeInTheDocument();
      // lista simultánea: el botón «Actualizar» del listado sigue visible junto al detalle.
      expect(screen.getByRole('button', { name: 'Actualizar' })).toBeInTheDocument();
    });

    it(`<1024px: apilado (detalle colapsa la lista, con retorno) para ${role}`, async () => {
      setViewportWide(false);
      bootAs(role);
      server.use(
        http.get('/v1/orders', () => HttpResponse.json({ orders: [order('o1', 'Orden A')] })),
        http.get('/v1/orders/o1', () => HttpResponse.json({ order: order('o1', 'Orden A') })),
      );
      renderApp(<AppRoutes />, '/orders/o1');
      expect(await screen.findByRole('heading', { name: 'Orden A' })).toBeInTheDocument();
      // apilado: SIN lista simultánea (sin «Actualizar»); en su lugar, retorno a la lista.
      expect(screen.queryByRole('button', { name: 'Actualizar' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Volver a la lista/ })).toBeInTheDocument();
    });
  },
);
