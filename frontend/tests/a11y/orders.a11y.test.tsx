import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import * as axeMatchers from 'vitest-axe/matchers';

expect.extend(axeMatchers);
import { screen } from '@testing-library/react';
import { server } from '../../mocks/server';
import { renderApp } from '../test-utils';
import { AppRoutes } from '../../src/routes/AppRoutes';
import { setAccessToken } from '../../src/api/session-store';

afterEach(() => setAccessToken(null));

const order = {
  id: 'o1',
  title: 'Orden A',
  description: 'desc',
  status: 'assigned',
  assigned_to: null,
  version: 0,
  created_at: '2026-07-14T00:00:00Z',
  updated_at: '2026-07-14T00:00:00Z',
};

// SC-003: 0 violaciones serias/críticas de axe en las pantallas de FE-1.
describe('a11y (axe) · listado y detalle (SC-003)', () => {
  it('listado sin violaciones', async () => {
    server.use(http.get('/v1/orders', () => HttpResponse.json({ orders: [order] })));
    const { container } = renderApp(<AppRoutes />, '/orders');
    await screen.findByText('Orden A');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('detalle sin violaciones', async () => {
    server.use(http.get('/v1/orders/o1', () => HttpResponse.json({ order })));
    const { container } = renderApp(<AppRoutes />, '/orders/o1');
    await screen.findByRole('heading', { name: 'Orden A' });
    expect(await axe(container)).toHaveNoViolations();
  });
});
