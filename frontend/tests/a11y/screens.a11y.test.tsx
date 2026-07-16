import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';
import { axe } from './axe-fieldops'; // FR-010: excepción AA acotada centralizada
import * as axeMatchers from 'vitest-axe/matchers';
import { screen } from '@testing-library/react';
import { server } from '../../mocks/server';
import { renderApp } from '../test-utils';
import { AppRoutes } from '../../src/routes/AppRoutes';
import { setAccessToken } from '../../src/api/session-store';

expect.extend(axeMatchers);
afterEach(() => setAccessToken(null));

// SC-003: barrido axe de las pantallas/estados restantes de FE-1 (login, vacío, error).
describe('a11y (axe) · barrido de pantallas (SC-003)', () => {
  it('login sin violaciones', async () => {
    server.use(http.post('/v1/auth/refresh', () => new HttpResponse(null, { status: 401 })));
    const { container } = renderApp(<AppRoutes />, '/orders');
    await screen.findByRole('heading', { name: 'Iniciar sesión' });
    expect(await axe(container)).toHaveNoViolations();
  });

  it('estado vacío sin violaciones', async () => {
    server.use(http.get('/v1/orders', () => HttpResponse.json({ orders: [] })));
    const { container } = renderApp(<AppRoutes />, '/orders');
    await screen.findByText(/No tienes órdenes/);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('estado de error sin violaciones', async () => {
    server.use(
      http.get('/v1/orders', () =>
        HttpResponse.json({ code: 'SERVICE_UNAVAILABLE' }, { status: 503 }),
      ),
    );
    const { container } = renderApp(<AppRoutes />, '/orders');
    await screen.findByRole('alert');
    expect(await axe(container)).toHaveNoViolations();
  });
});
