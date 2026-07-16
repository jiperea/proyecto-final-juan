// FE-8 (022) · T014 [Red] · US3 · FR-007a/FR-007c/FR-011b.
//
// Buscador del topbar de oficina: filtra en cliente por substring insensible a mayúsculas/acentos
// sobre los campos presentes; al estrechar a <1024px el término se limpia (FR-011b); si el filtro
// excluye la orden SELECCIONADA, el panel de detalle la mantiene con una nota discreta (FR-007c), en
// vez de vaciarse abruptamente.
//
// Debe FALLAR ahora: no existe ningún `searchbox` en el topbar (no existe aún el *chrome* de oficina).
// T016/T017 lo ponen en verde.
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { server } from '../../mocks/server';
import { renderApp } from '../test-utils';
import { AppRoutes } from '../../src/routes/AppRoutes';
import { setAccessToken } from '../../src/api/session-store';
import { setViewportWide } from '../viewport';

function bootAsSupervisor() {
  server.use(
    http.get('/v1/auth/me', () =>
      HttpResponse.json({
        user: { id: 'u1', email: 'sup@fieldops.test', username: 'sup', role: 'supervisor' },
      }),
    ),
  );
}

function order(id: string, title: string, status = 'pending_review') {
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

describe('FE-8 · buscador de oficina — filtro por substring (FR-007a)', () => {
  beforeEach(() => setViewportWide(true));

  it('filtra insensible a mayúsculas y acentos sobre los campos presentes', async () => {
    bootAsSupervisor();
    server.use(
      http.get('/v1/orders', () =>
        HttpResponse.json({
          orders: [order('o1', 'Revisión eléctrica'), order('o2', 'Cambio de bomba')],
        }),
      ),
    );
    renderApp(<AppRoutes />, '/orders');
    const search = await screen.findByRole('searchbox', { name: /buscar/i });
    await userEvent.type(search, 'ELECTRICA'); // mayúsculas, sin tilde
    expect(screen.getByText('Revisión eléctrica')).toBeInTheDocument();
    expect(screen.queryByText('Cambio de bomba')).not.toBeInTheDocument();
  });
});

describe('FE-8 · selección persistente fuera del filtro (FR-007c)', () => {
  beforeEach(() => setViewportWide(true));

  it('si el filtro excluye la orden seleccionada, el detalle la mantiene con una nota discreta', async () => {
    bootAsSupervisor();
    server.use(
      http.get('/v1/orders', () =>
        HttpResponse.json({
          orders: [order('o1', 'Orden Uno'), order('o2', 'Orden Dos')],
        }),
      ),
      http.get('/v1/orders/o1', () => HttpResponse.json({ order: order('o1', 'Orden Uno') })),
    );
    renderApp(<AppRoutes />, '/orders/o1');
    expect(await screen.findByRole('heading', { name: 'Orden Uno' })).toBeInTheDocument();

    const search = await screen.findByRole('searchbox', { name: /buscar/i });
    await userEvent.type(search, 'Dos'); // excluye la orden o1, que sigue seleccionada

    // El detalle NO se vacía: sigue mostrando la orden seleccionada…
    expect(screen.getByRole('heading', { name: 'Orden Uno' })).toBeInTheDocument();
    // …con una nota discreta de que queda fuera del filtro actual.
    expect(screen.getByText(/fuera del filtro/i)).toBeInTheDocument();
  });
});

describe('FE-8 · el término se limpia al ocultarse el buscador (FR-011b)', () => {
  it('al estrechar a <1024px, el buscador desaparece y su término no persiste', async () => {
    bootAsSupervisor();
    server.use(
      http.get('/v1/orders', () =>
        HttpResponse.json({ orders: [order('o1', 'Revisión eléctrica'), order('o2', 'Cambio de bomba')] }),
      ),
    );
    setViewportWide(true);
    renderApp(<AppRoutes />, '/orders');
    const search = await screen.findByRole('searchbox', { name: /buscar/i });
    await userEvent.type(search, 'electrica');
    expect(screen.queryByText('Cambio de bomba')).not.toBeInTheDocument();

    await act(async () => setViewportWide(false));
    // El buscador (topbar de oficina) desaparece bajo 1024px…
    expect(screen.queryByRole('searchbox', { name: /buscar/i })).not.toBeInTheDocument();

    // …y el término no sigue filtrando: al volver a ensanchar, «Cambio de bomba» reaparece sin término.
    await act(async () => setViewportWide(true));
    expect(await screen.findByText('Cambio de bomba')).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: /buscar/i })).toHaveValue('');
  });
});
