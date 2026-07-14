import { StrictMode } from 'react';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { server } from '../../mocks/server';
import { renderApp } from '../test-utils';
import { AppRoutes } from '../../src/routes/AppRoutes';
import { makeQueryClient } from '../../src/app/queryClient';
import { SessionProvider } from '../../src/features/auth/session';
import { setAccessToken } from '../../src/api/session-store';

const TECH = { id: 'u1', email: 'a@x.test', username: 'ana', role: 'technician' };
const DISPATCHER = { id: 'u2', email: 'd@x.test', username: 'diego', role: 'dispatcher' };

afterEach(() => setAccessToken(null));

describe('Flujos de sesión (G3 remediación)', () => {
  it('I-001/FR-004: 401 mid-navegación con refresh fallido → redirige a login (no error inline)', async () => {
    let refreshCalls = 0;
    server.use(
      // bootstrap: primer refresh OK (autenticado); refresh posterior falla.
      http.post('/v1/auth/refresh', () => {
        refreshCalls += 1;
        return refreshCalls === 1
          ? HttpResponse.json({ access_token: 't', user: TECH })
          : new HttpResponse(null, { status: 401 });
      }),
      http.get('/v1/orders', () => new HttpResponse(null, { status: 401 })),
    );
    renderApp(<AppRoutes />, '/orders');
    // La sesión caduca a mitad → la app lleva al login (no deja error reintentable en la vista).
    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
  });

  it('I-002/FR-029: un refresh que devuelve otro rol re-monta el shell bajo el rol nuevo', async () => {
    let refreshCalls = 0;
    let ordersCalls = 0;
    server.use(
      http.post('/v1/auth/refresh', () => {
        refreshCalls += 1;
        // boot → technician; el segundo refresh (por el 401) devuelve dispatcher (rol releído de BD).
        return HttpResponse.json({
          access_token: 't',
          user: refreshCalls === 1 ? TECH : DISPATCHER,
        });
      }),
      http.get('/v1/auth/me', () =>
        HttpResponse.json({ user: refreshCalls >= 2 ? DISPATCHER : TECH }),
      ),
      http.get('/v1/orders', () => {
        ordersCalls += 1;
        return ordersCalls === 1
          ? new HttpResponse(null, { status: 401 }) // fuerza refresh → cambio de rol
          : HttpResponse.json({ orders: [] });
      }),
    );
    renderApp(<AppRoutes />, '/orders');
    expect(await screen.findByText(/diego · Despachador/)).toBeInTheDocument();
  });

  it('bootstrap resuelve bajo StrictMode (no se queda en «Cargando…»)', async () => {
    // Regresión: StrictMode invoca los efectos 2 veces; el bootstrap debe resolver igual (no colgarse).
    server.use(http.post('/v1/auth/refresh', () => new HttpResponse(null, { status: 401 })));
    render(
      <StrictMode>
        <QueryClientProvider client={makeQueryClient()}>
          <MemoryRouter initialEntries={['/orders']}>
            <SessionProvider>
              <AppRoutes />
            </SessionProvider>
          </MemoryRouter>
        </QueryClientProvider>
      </StrictMode>,
    );
    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
  });

  it('I-004/FR-005: logout con 500 igualmente vuelve al login (best-effort)', async () => {
    server.use(http.post('/v1/auth/logout', () => new HttpResponse(null, { status: 500 })));
    renderApp(<AppRoutes />, '/orders'); // boot por defecto → technician
    await screen.findByText(/ana · Técnico/);
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument(),
    );
  });
});
