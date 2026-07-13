import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { server } from '../../mocks/server';
import { renderApp } from '../test-utils';
import { AppRoutes } from '../../src/routes/AppRoutes';
import { setAccessToken } from '../../src/api/session-store';
import { setViewportWide } from '../viewport';

type Role = 'technician' | 'dispatcher' | 'supervisor';
function bootAs(role: Role) {
  server.use(
    http.get('/v1/auth/me', () =>
      HttpResponse.json({
        user: { id: 'u1', email: 'u@x.test', username: 'usuario', role },
      }),
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
beforeEach(() => setViewportWide(false));

describe('US2 · listado por rol', () => {
  it('FR-006/007: muestra las órdenes del backend con su badge', async () => {
    bootAs('technician');
    server.use(
      http.get('/v1/orders', () =>
        HttpResponse.json({ orders: [order('o1', 'Reparar caldera', 'in_progress')] }),
      ),
    );
    renderApp(<AppRoutes />, '/orders');
    expect(await screen.findByText('Reparar caldera')).toBeInTheDocument();
    expect(screen.getByText('En curso')).toBeInTheDocument();
  });

  it('FR-008: vacío → mensaje de ámbito del rol', async () => {
    bootAs('supervisor');
    server.use(http.get('/v1/orders', () => HttpResponse.json({ orders: [] })));
    renderApp(<AppRoutes />, '/orders');
    expect(await screen.findByText('No hay órdenes en revisión.')).toBeInTheDocument();
  });

  it('FR-009: 503 → estado de error con reintento (role=alert)', async () => {
    bootAs('technician');
    server.use(
      http.get('/v1/orders', () =>
        HttpResponse.json({ code: 'SERVICE_UNAVAILABLE' }, { status: 503 }),
      ),
    );
    renderApp(<AppRoutes />, '/orders');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/no disponible/i);
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });

  it('FR-014 (K-003): 403 → «sin-permiso» distinguible del error', async () => {
    bootAs('technician');
    server.use(
      http.get('/v1/orders', () => HttpResponse.json({ code: 'FORBIDDEN_ROLE' }, { status: 403 })),
    );
    renderApp(<AppRoutes />, '/orders');
    expect(await screen.findByText(/No tienes permiso para ver este listado/)).toBeInTheDocument();
  });

  it('FR-009b: «Actualizar» vuelve a pedir el listado', async () => {
    bootAs('technician');
    let calls = 0;
    server.use(
      http.get('/v1/orders', () => {
        calls += 1;
        return HttpResponse.json({ orders: calls === 1 ? [] : [order('o9', 'Nueva')] });
      }),
    );
    renderApp(<AppRoutes />, '/orders');
    await screen.findByText('No tienes órdenes asignadas.');
    await userEvent.click(screen.getByRole('button', { name: 'Actualizar' }));
    expect(await screen.findByText('Nueva')).toBeInTheDocument();
  });
});

describe('US2/US3 · RBAC espejo y layout (F-002)', () => {
  it('FR-019: technician a ≥1024px usa UNA columna (no master-detail) en el detalle', async () => {
    setViewportWide(true);
    bootAs('technician');
    server.use(
      http.get('/v1/orders', () => HttpResponse.json({ orders: [order('o1', 'Orden A')] })),
      http.get('/v1/orders/o1', () => HttpResponse.json({ order: order('o1', 'Orden A') })),
    );
    renderApp(<AppRoutes />, '/orders/o1');
    // detalle visible…
    expect(await screen.findByRole('heading', { name: 'Orden A' })).toBeInTheDocument();
    // …y la lista NO simultánea (single column): sin toolbar «Actualizar» del listado.
    expect(screen.queryByRole('button', { name: 'Actualizar' })).not.toBeInTheDocument();
  });

  it('FR-019: dispatcher a ≥1024px usa master-detail (lista + detalle simultáneos)', async () => {
    setViewportWide(true);
    bootAs('dispatcher');
    server.use(
      http.get('/v1/orders', () => HttpResponse.json({ orders: [order('o1', 'Orden A', 'assigned')] })),
      http.get('/v1/orders/o1', () => HttpResponse.json({ order: order('o1', 'Orden A', 'assigned') })),
    );
    renderApp(<AppRoutes />, '/orders/o1');
    expect(await screen.findByRole('heading', { name: 'Orden A' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Actualizar' })).toBeInTheDocument(); // lista visible a la vez
  });
});

describe('US3 · detalle read-only', () => {
  it('FR-012: technician dueño con rechazo sin atender ve el motivo (escapado)', async () => {
    bootAs('technician');
    server.use(
      http.get('/v1/orders/o1', () =>
        HttpResponse.json({
          order: order('o1', 'Orden con rechazo', 'in_progress'),
          notes: 'notas de ejecución',
          last_rejection_reason: 'Falta la foto del cuadro eléctrico',
        }),
      ),
    );
    renderApp(<AppRoutes />, '/orders/o1');
    expect(await screen.findByText('Falta la foto del cuadro eléctrico')).toBeInTheDocument();
    expect(screen.getByText('notas de ejecución')).toBeInTheDocument();
  });

  it('FR-011: dispatcher no ve notas/evidencia (omitidas por el backend, sin error)', async () => {
    bootAs('dispatcher');
    server.use(
      http.get('/v1/orders/o1', () => HttpResponse.json({ order: order('o1', 'Orden D') })),
    );
    renderApp(<AppRoutes />, '/orders/o1');
    expect(await screen.findByRole('heading', { name: 'Orden D' })).toBeInTheDocument();
    expect(screen.queryByText('Notas')).not.toBeInTheDocument();
    expect(screen.queryByText('Evidencia')).not.toBeInTheDocument();
  });

  it('FR-013: 404 → mensaje uniforme «no disponible»', async () => {
    bootAs('technician');
    server.use(
      http.get('/v1/orders/x', () => HttpResponse.json({ code: 'NOT_FOUND' }, { status: 404 })),
    );
    renderApp(<AppRoutes />, '/orders/x');
    expect(
      await screen.findByText(/Esta orden no existe o no está disponible para ti/),
    ).toBeInTheDocument();
  });

  it('FR-011b: notes/motivo con payload XSS se renderizan como texto literal (no se ejecutan)', async () => {
    bootAs('technician');
    const xss = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
    server.use(
      http.get('/v1/orders/o1', () =>
        HttpResponse.json({
          order: order('o1', 'Orden XSS', 'in_progress'),
          notes: `nota ${xss}`,
          last_rejection_reason: `motivo ${xss}`,
        }),
      ),
    );
    const { container } = renderApp(<AppRoutes />, '/orders/o1');
    await screen.findByRole('heading', { name: 'Orden XSS' });
    // El texto aparece literal (escapado)…
    expect(screen.getByText(/nota <img src=x/)).toBeInTheDocument();
    // …y NO se inyectó ningún <script>/<img> desde el contenido del usuario.
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img[src="x"]')).toBeNull();
  });

  it('FR-013b: 500 → error con reintento (no «vacío»)', async () => {
    bootAs('technician');
    server.use(
      http.get('/v1/orders/o1', () => HttpResponse.json({ code: 'INTERNAL' }, { status: 500 })),
    );
    renderApp(<AppRoutes />, '/orders/o1');
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(/Ha ocurrido un error/)).toBeInTheDocument();
  });
});
