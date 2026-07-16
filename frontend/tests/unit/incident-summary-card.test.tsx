// FE-8 (022) · T019b [Red] · US4 · FR-016 (S-003/S-006/H-007).
//
// La tarjeta de resumen IA usa el token morado `pending_review` (borde COMPLETO/cabecera/fondo
// `--status-pending_review-bg`) + nota de guardián; se renderiza SOLO para supervisor en
// `pending_review` — y ese gate por rol vive en el render del panel de detalle, NO se deriva del
// layout master-detail compartido entre roles (S-006): hoy `OrderDetailView` la esconde también en
// móvil (`canReview = isSupervisorPending && wide`), aunque el rol+estado ya la autorizan. Acepta el
// estado de runtime que ya provea el feature de resumen (006/018): texto / vacío ("insuficiente") /
// no disponible.
//
// Debe FALLAR ahora: (a) `.ai-summary` solo tiñe el borde IZQUIERDO de morado (el borde completo usa
// `--color-border` genérico) y (b) en viewport estrecho la tarjeta no se muestra ni para el supervisor
// en `pending_review`. T022 lo pone en verde.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { server } from '../../mocks/server';
import { renderApp } from '../test-utils';
import { AppRoutes } from '../../src/routes/AppRoutes';
import { setAccessToken } from '../../src/api/session-store';
import { setViewportWide } from '../viewport';

const COMPONENTS_CSS = readFileSync(resolve(process.cwd(), 'src/ui/components.css'), 'utf8');

function bootAs(role: 'technician' | 'dispatcher' | 'supervisor') {
  server.use(
    http.get('/v1/auth/me', () =>
      HttpResponse.json({ user: { id: 'u1', email: 'u@fieldops.test', username: 'u', role } }),
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

describe('FE-8 · tarjeta IA — estilo morado pending_review completo (FR-016)', () => {
  it('el borde COMPLETO (no solo `border-left`) usa el token pending_review', () => {
    const rule = COMPONENTS_CSS.match(/\.ai-summary\s*\{[^}]*\}/)?.[0] ?? '';
    expect(rule).toMatch(/border:\s*1px\s*solid\s*var\(--status-pending_review-fg\)/);
  });
});

describe('FE-8 · gate por rol independiente del layout master-detail (FR-016/S-006)', () => {
  beforeEach(() => setViewportWide(false)); // móvil: canReview hoy exige `wide`, la tarjeta NO debería depender de eso

  it('supervisor + pending_review, en MÓVIL: la tarjeta se muestra igualmente', async () => {
    bootAs('supervisor');
    server.use(
      http.get('/v1/orders/o1', () =>
        HttpResponse.json({ order: order('o1', 'Orden en revisión', 'pending_review'), evidence: { count: 1, content_types: ['image/jpeg'] } }),
      ),
    );
    renderApp(<AppRoutes />, '/orders/o1');
    expect(await screen.findByRole('heading', { name: 'Orden en revisión' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Resumen (IA)' })).toBeInTheDocument();
  });

  it('technician (no supervisor): NUNCA se muestra, ni en pending_review', async () => {
    bootAs('technician');
    server.use(
      http.get('/v1/orders/o1', () =>
        HttpResponse.json({ order: order('o1', 'Orden en revisión', 'pending_review') }),
      ),
    );
    renderApp(<AppRoutes />, '/orders/o1');
    await screen.findByRole('heading', { name: 'Orden en revisión' });
    expect(screen.queryByRole('heading', { name: 'Resumen (IA)' })).not.toBeInTheDocument();
  });

  it('supervisor en otro estado (`in_progress`): no se muestra', async () => {
    bootAs('supervisor');
    server.use(
      http.get('/v1/orders/o1', () =>
        HttpResponse.json({ order: order('o1', 'Orden en curso', 'in_progress') }),
      ),
    );
    renderApp(<AppRoutes />, '/orders/o1');
    await screen.findByRole('heading', { name: 'Orden en curso' });
    expect(screen.queryByRole('heading', { name: 'Resumen (IA)' })).not.toBeInTheDocument();
  });
});

describe('FE-8 · acepta el estado de runtime del resumen (texto/vacío/insuficiente) (H-007)', () => {
  beforeEach(() => setViewportWide(true));

  it('«evidencia insuficiente»: muestra el chrome de la tarjeta sin inventar texto', async () => {
    bootAs('supervisor');
    server.use(
      http.get('/v1/orders/o1', () => HttpResponse.json({ order: order('o1', 'Orden X', 'pending_review') })),
      http.post('/v1/orders/o1/ai-summary', () => HttpResponse.json({ sufficient: false, summary: null })),
    );
    renderApp(<AppRoutes />, '/orders/o1');
    await screen.findByRole('heading', { name: 'Orden X' });
    await screen.findByRole('heading', { name: 'Resumen (IA)' });
    await userEvent.click(await screen.findByRole('button', { name: 'Resumir con IA' }));
    expect(await screen.findByText(/no hay material suficiente/i)).toBeInTheDocument();
  });
});
