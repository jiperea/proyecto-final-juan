import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { server } from '../../mocks/server';
import { renderApp } from '../test-utils';
import { AppRoutes } from '../../src/routes/AppRoutes';
import { setAccessToken } from '../../src/api/session-store';

const anonBoot = () =>
  server.use(http.post('/v1/auth/refresh', () => new HttpResponse(null, { status: 401 })));

afterEach(() => setAccessToken(null));

describe('US1 · acceso y sesión', () => {
  it('sin sesión, una ruta protegida lleva al login (FR-021/023)', async () => {
    anonBoot();
    renderApp(<AppRoutes />, '/orders');
    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
  });

  it('login con credenciales válidas entra al shell con nombre y rol (FR-001)', async () => {
    anonBoot();
    renderApp(<AppRoutes />, '/orders');
    await screen.findByRole('heading', { name: 'Iniciar sesión' });
    await userEvent.type(screen.getByLabelText('Usuario o email'), 'ana');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'secret');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByRole('heading', { name: 'Mis órdenes' })).toBeInTheDocument();
    expect(screen.getByText(/ana · Técnico/)).toBeInTheDocument();
  });

  it('credenciales inválidas → mensaje genérico y permanece en login (FR-002)', async () => {
    anonBoot();
    server.use(
      http.post('/v1/auth/login', () =>
        HttpResponse.json({ code: 'INVALID_CREDENTIALS' }, { status: 401 }),
      ),
    );
    renderApp(<AppRoutes />, '/orders');
    await screen.findByRole('heading', { name: 'Iniciar sesión' });
    await userEvent.type(screen.getByLabelText('Usuario o email'), 'ana');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'bad');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Credenciales no válidas');
    expect(screen.getByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
  });

  it('logout vuelve al login y purga la identidad del shell (FR-005)', async () => {
    // Bootstrap autenticado (refresh por defecto 200 → me technician).
    renderApp(<AppRoutes />, '/orders');
    expect(await screen.findByText(/ana · Técnico/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument(),
    );
    expect(screen.queryByText(/ana · Técnico/)).not.toBeInTheDocument();
  });
});
