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

function order(id: string, title: string, status = 'in_progress') {
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

describe('Notas del detalle en tarjeta etiquetada (T007/FR-005)', () => {
  it('FR-005: notas con contenido → tarjeta «Notas del técnico» con texto escapado', async () => {
    bootAs('technician');
    const id = 'note0001-0000-0000-0000-000000000001';
    const xss = '<img src=x onerror="alert(1)">';
    server.use(
      http.get(`/v1/orders/${id}`, () =>
        HttpResponse.json({
          order: order(id, 'Orden con notas'),
          notes: `nota real ${xss}`,
        }),
      ),
    );
    const { container } = renderApp(<AppRoutes />, `/orders/${id}`);
    await screen.findByRole('heading', { name: 'Orden con notas' });
    // FR-005: la tarjeta etiquetada «Notas del técnico» (hoy solo hay <h3>Notas</h3> + <p>).
    expect(screen.getByText('Notas del técnico')).toBeInTheDocument();
    const card = screen.getByText('Notas del técnico').closest('section');
    expect(card).not.toBeNull();
    expect(card?.className).toMatch(/order-detail__notes/);
    expect(card).toHaveTextContent(/nota real/);
    // Escapado: nunca HTML crudo desde el contenido del usuario.
    expect(container.querySelector('img[src="x"]')).toBeNull();
  });

  it('FR-005 (edge): notas ausentes → no se renderiza la tarjeta', async () => {
    bootAs('technician');
    const id = 'note0002-0000-0000-0000-000000000002';
    server.use(
      http.get(`/v1/orders/${id}`, () => HttpResponse.json({ order: order(id, 'Sin notas') })),
    );
    renderApp(<AppRoutes />, `/orders/${id}`);
    await screen.findByRole('heading', { name: 'Sin notas' });
    expect(screen.queryByText('Notas del técnico')).not.toBeInTheDocument();
  });

  it('FR-005 (edge): notas solo-espacios se tratan como ausentes → no hay tarjeta', async () => {
    bootAs('technician');
    const id = 'note0003-0000-0000-0000-000000000003';
    server.use(
      http.get(`/v1/orders/${id}`, () =>
        HttpResponse.json({ order: order(id, 'Notas en blanco'), notes: '   ' }),
      ),
    );
    renderApp(<AppRoutes />, `/orders/${id}`);
    await screen.findByRole('heading', { name: 'Notas en blanco' });
    expect(screen.queryByText('Notas del técnico')).not.toBeInTheDocument();
  });
});
