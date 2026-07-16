// FE-8 (022) · T007 [Red] · US2 · FR-005/FR-005a/FR-005b/FR-011b.
//
// Segmentado «Activas/Todas» (con «Activas» por defecto) + filtro por término, en cliente, sobre las
// órdenes YA CARGADAS (sin llamada adicional al backend). Contrato de accesibilidad elegido para el
// control (`Segmented`, T008): `role="radiogroup"` con nombre accesible y opciones `role="radio"`
// (`aria-checked`) — mismo espíritu que el patrón ya usado por `ThemeToggle` (grupo + `aria-pressed`),
// pero semántica de radio porque solo una opción puede estar activa a la vez.
//
// Debe FALLAR ahora: ni el segmentado ni el filtro por término existen (`OrderList`/`OrdersView`
// muestran hoy la lista sin ningún control de filtro) — T011/T012 lo ponen en verde.
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { server } from '../../mocks/server';
import { renderApp } from '../test-utils';
import { AppRoutes } from '../../src/routes/AppRoutes';
import { setAccessToken } from '../../src/api/session-store';
import { setViewportWide } from '../viewport';

function bootAsTechnician() {
  server.use(
    http.get('/v1/auth/me', () =>
      HttpResponse.json({
        user: { id: 'u1', email: 'tech@fieldops.test', username: 'ana', role: 'technician' },
      }),
    ),
  );
}

function order(id: string, title: string, status: string) {
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
beforeEach(() => setViewportWide(false));

describe('FE-8 · segmentado «Activas/Todas» (FR-005/FR-005a)', () => {
  it('«Activas» es el segmento por defecto y oculta las `closed`', async () => {
    bootAsTechnician();
    server.use(
      http.get('/v1/orders', () =>
        HttpResponse.json({
          orders: [
            order('o1', 'Reparar caldera', 'draft'),
            order('o2', 'Revisar cuadro', 'assigned'),
            order('o3', 'Instalación cerrada', 'closed'),
          ],
        }),
      ),
    );
    renderApp(<AppRoutes />, '/orders');

    const group = await screen.findByRole('radiogroup', { name: /Activas|Todas|filtro/i });
    const active = within(group).getByRole('radio', { name: 'Activas' });
    const all = within(group).getByRole('radio', { name: 'Todas' });
    expect(active).toHaveAttribute('aria-checked', 'true');
    expect(all).toHaveAttribute('aria-checked', 'false');

    expect(screen.getByText('Reparar caldera')).toBeInTheDocument();
    expect(screen.getByText('Revisar cuadro')).toBeInTheDocument();
    expect(screen.queryByText('Instalación cerrada')).not.toBeInTheDocument();
  });

  it('cambiar a «Todas» muestra también las `closed`', async () => {
    bootAsTechnician();
    server.use(
      http.get('/v1/orders', () =>
        HttpResponse.json({
          orders: [
            order('o1', 'Reparar caldera', 'draft'),
            order('o3', 'Instalación cerrada', 'closed'),
          ],
        }),
      ),
    );
    renderApp(<AppRoutes />, '/orders');
    const group = await screen.findByRole('radiogroup', { name: /Activas|Todas|filtro/i });
    await userEvent.click(within(group).getByRole('radio', { name: 'Todas' }));
    expect(screen.getByText('Instalación cerrada')).toBeInTheDocument();
    expect(within(group).getByRole('radio', { name: 'Todas' })).toHaveAttribute('aria-checked', 'true');
  });
});

describe('FE-8 · buscador en cliente y precedencia con el segmentado (FR-011b)', () => {
  it('escribir un término cambia el segmento a «Todas» y filtra por substring insensible a mayúsculas/acentos', async () => {
    bootAsTechnician();
    setViewportWide(true); // FR-011: el buscador vive en el topbar de master-detail (≥1024px), cualquier rol
    server.use(
      http.get('/v1/orders', () =>
        HttpResponse.json({
          orders: [
            order('o1', 'Reparación de caldera', 'draft'),
            order('o2', 'Revisión de cuadro', 'assigned'),
            order('o3', 'Instalación cerrada', 'closed'),
          ],
        }),
      ),
    );
    renderApp(<AppRoutes />, '/orders');
    const group = await screen.findByRole('radiogroup', { name: /Activas|Todas|filtro/i });
    expect(within(group).getByRole('radio', { name: 'Activas' })).toHaveAttribute('aria-checked', 'true');

    const search = screen.getByRole('searchbox', { name: /buscar/i });
    await userEvent.type(search, 'reparacion'); // sin tilde, minúsculas

    // Precedencia (FR-011b): el segmento pasa a «Todas» automáticamente.
    expect(within(group).getByRole('radio', { name: 'Todas' })).toHaveAttribute('aria-checked', 'true');
    // Filtra por substring insensible a mayúsculas/acentos, incluso entre `closed` (ya en «Todas»).
    expect(screen.getByText('Reparación de caldera')).toBeInTheDocument();
    expect(screen.queryByText('Revisión de cuadro')).not.toBeInTheDocument();
    expect(screen.queryByText('Instalación cerrada')).not.toBeInTheDocument();
  });
});

describe('FE-8 · tres estados vacíos con precedencia (FR-005b/FR-011b)', () => {
  it('sin órdenes en absoluto: mensaje de ámbito del rol (ya existente)', async () => {
    bootAsTechnician();
    server.use(http.get('/v1/orders', () => HttpResponse.json({ orders: [] })));
    renderApp(<AppRoutes />, '/orders');
    expect(await screen.findByText('No tienes órdenes asignadas.')).toBeInTheDocument();
  });

  it('hay órdenes pero todas `closed`: «sin órdenes activas» sugiere «Todas»', async () => {
    bootAsTechnician();
    server.use(
      http.get('/v1/orders', () =>
        HttpResponse.json({ orders: [order('o1', 'Instalación cerrada', 'closed')] }),
      ),
    );
    renderApp(<AppRoutes />, '/orders');
    expect(await screen.findByText(/sin órdenes activas/i)).toBeInTheDocument();
    expect(screen.getByText(/todas/i)).toBeInTheDocument();
  });

  it('hay término de búsqueda sin coincidencias: precede a «sin órdenes activas» y sugiere limpiar', async () => {
    bootAsTechnician();
    setViewportWide(true);
    server.use(
      http.get('/v1/orders', () =>
        HttpResponse.json({ orders: [order('o1', 'Reparar caldera', 'draft')] }),
      ),
    );
    renderApp(<AppRoutes />, '/orders');
    const search = await screen.findByRole('searchbox', { name: /buscar/i });
    await userEvent.type(search, 'inexistente-xyz');
    expect(await screen.findByText(/sin coincidencias/i)).toBeInTheDocument();
    expect(screen.queryByText(/sin órdenes activas/i)).not.toBeInTheDocument();
  });
});
