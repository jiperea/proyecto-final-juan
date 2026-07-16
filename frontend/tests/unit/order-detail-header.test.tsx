import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { server } from '../../mocks/server';
import { renderApp } from '../test-utils';
import { AppRoutes } from '../../src/routes/AppRoutes';
import { setAccessToken } from '../../src/api/session-store';
import { setViewportWide } from '../viewport';

function bootAs(role: 'technician' | 'dispatcher' | 'supervisor') {
  server.use(
    http.get('/v1/auth/me', () =>
      HttpResponse.json({ user: { id: 'u1', email: 'u@x.test', username: 'usuario', role } }),
    ),
  );
}

function order(id: string, title: string, status = 'assigned') {
  return {
    id,
    title,
    description: `desc ${id}`,
    status,
    assigned_to: 'u1',
    version: 0,
    created_at: '2026-07-14T00:00:00Z',
    updated_at: '2026-07-14T00:00:00Z',
  };
}

afterEach(() => setAccessToken(null));
beforeEach(() => setViewportWide(false));

describe('Cabecera del detalle de orden (T005/FR-004)', () => {
  it('FR-004: la cabecera muestra código monoespaciado + nombre', async () => {
    bootAs('technician');
    const id = 'aaaa1111-bbbb-2222-cccc-333344445555';
    server.use(
      http.get(`/v1/orders/${id}`, () =>
        HttpResponse.json({ order: order(id, 'Reparar caldera', 'in_progress') }),
      ),
    );
    renderApp(<AppRoutes />, `/orders/${id}`);
    await screen.findByRole('heading', { name: 'Reparar caldera' });
    // FR-004: el código monoespaciado debe existir en la cabecera del detalle (hoy solo hay h2 con título).
    const codeEl = document.querySelector('.order-detail__code');
    expect(codeEl).not.toBeNull();
    expect(codeEl?.textContent).toBe(`#${id.slice(0, 8)}`);
  });

  it('FR-004: no se renderiza sub-línea de contexto (el contrato no expone cliente/ubicación)', async () => {
    bootAs('supervisor');
    const id = 'bbbb2222-cccc-3333-dddd-444455556666';
    server.use(
      http.get(`/v1/orders/${id}`, () =>
        HttpResponse.json({ order: order(id, 'Orden supervisada', 'pending_review') }),
      ),
    );
    renderApp(<AppRoutes />, `/orders/${id}`);
    await screen.findByRole('heading', { name: 'Orden supervisada' });
    // La cabecera del artifact SÍ lleva código mono (esto hoy falla: no existe `.order-detail__code`).
    expect(document.querySelector('.order-detail__code')?.textContent).toBe(`#${id.slice(0, 8)}`);
    // …pero nunca sub-línea de contexto (contrato sin cliente/ubicación).
    expect(document.querySelector('.order-detail__subline')).toBeNull();
    expect(screen.queryByText(/cliente/i)).not.toBeInTheDocument();
  });
});
