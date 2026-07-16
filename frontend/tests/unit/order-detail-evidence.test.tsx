import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
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

describe('Evidencia del detalle en tiles (T009/FR-006)', () => {
  it('FR-006: count = 3 → 3 tiles «Imagen 1»..«Imagen 3» (1-based)', async () => {
    bootAs('technician');
    const id = 'evid0001-0000-0000-0000-000000000001';
    server.use(
      http.get(`/v1/orders/${id}`, () =>
        HttpResponse.json({
          order: order(id, 'Orden con evidencia'),
          evidence: { count: 3, content_types: ['image/jpeg', 'image/png', 'image/webp'] },
        }),
      ),
    );
    renderApp(<AppRoutes />, `/orders/${id}`);
    await screen.findByRole('heading', { name: 'Orden con evidencia' });
    expect(screen.getByText('Imagen 1')).toBeInTheDocument();
    expect(screen.getByText('Imagen 2')).toBeInTheDocument();
    expect(screen.getByText('Imagen 3')).toBeInTheDocument();
    expect(screen.queryByText('Imagen 4')).not.toBeInTheDocument();
    // 3 tiles, no el texto plano actual «3 archivo(s)».
    expect(screen.queryByText(/archivo\(s\)/)).not.toBeInTheDocument();
    const tiles = document.querySelectorAll('.order-detail__evidence-tile');
    expect(tiles.length).toBe(3);
  });

  it('FR-006: count = 1 → 1 tile «Imagen 1»', async () => {
    bootAs('technician');
    const id = 'evid0002-0000-0000-0000-000000000002';
    server.use(
      http.get(`/v1/orders/${id}`, () =>
        HttpResponse.json({
          order: order(id, 'Orden con una evidencia'),
          evidence: { count: 1, content_types: ['image/heic'] },
        }),
      ),
    );
    renderApp(<AppRoutes />, `/orders/${id}`);
    await screen.findByRole('heading', { name: 'Orden con una evidencia' });
    expect(screen.getByText('Imagen 1')).toBeInTheDocument();
    const tiles = document.querySelectorAll('.order-detail__evidence-tile');
    expect(tiles.length).toBe(1);
  });

  it('FR-006 (edge): count = 0 → estado «sin evidencia» y 0 tiles', async () => {
    bootAs('technician');
    const id = 'evid0003-0000-0000-0000-000000000003';
    server.use(
      http.get(`/v1/orders/${id}`, () =>
        HttpResponse.json({
          order: order(id, 'Orden todavia sin ciclo'),
          evidence: { count: 0, content_types: [] },
        }),
      ),
    );
    renderApp(<AppRoutes />, `/orders/${id}`);
    const heading = await screen.findByRole('heading', { name: 'Orden todavia sin ciclo' });
    const detail = heading.closest('article') as HTMLElement;
    const evidenceSection = within(detail).getByLabelText('Evidencia');
    expect(within(evidenceSection).getByText(/sin evidencia/i)).toBeInTheDocument();
    const tiles = evidenceSection.querySelectorAll('.order-detail__evidence-tile');
    expect(tiles.length).toBe(0);
  });
});
