import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { server } from '../../mocks/server';
import { renderApp } from '../test-utils';
import { AppRoutes } from '../../src/routes/AppRoutes';
import { setAccessToken } from '../../src/api/session-store';
import { setViewportWide } from '../viewport';
// T002/FR-001/002/003 (023): helper de resolución del técnico en la fila de meta de la tarjeta.
// Objetivo aún NO existe (fase Red) → este import falla hasta T003.
import { resolveAssignee } from '../../src/features/orders/resolveAssignee';

const TECHNICIAN_ID = 'u1';
const OTHER_UUID = 'ab12cd34-ef56-7890-abcd-ef1234567890';

function bootAs(role: 'technician' | 'dispatcher' | 'supervisor') {
  server.use(
    http.get('/v1/auth/me', () =>
      HttpResponse.json({
        user: { id: TECHNICIAN_ID, email: 'u@x.test', username: 'usuario', role },
      }),
    ),
  );
}

function order(id: string, title: string, assignedTo: string | null, status = 'assigned') {
  return {
    id,
    title,
    description: `desc ${id}`,
    status,
    assigned_to: assignedTo,
    version: 0,
    created_at: '2026-07-14T00:00:00Z',
    updated_at: '2026-07-14T00:00:00Z',
  };
}

afterEach(() => setAccessToken(null));
beforeEach(() => setViewportWide(false));

describe('resolveAssignee (helper puro, T003/FR-002)', () => {
  it('devuelve «Tú» cuando assigned_to coincide con el userId de sesión', () => {
    expect(resolveAssignee(TECHNICIAN_ID, TECHNICIAN_ID)).toBe('Tú');
  });

  it('devuelve el UUID truncado a 8 chars cuando assigned_to está presente y NO coincide', () => {
    expect(resolveAssignee(OTHER_UUID, TECHNICIAN_ID)).toBe(OTHER_UUID.slice(0, 8));
  });

  it('devuelve «Sin asignar» cuando assigned_to es null', () => {
    expect(resolveAssignee(null, TECHNICIAN_ID)).toBe('Sin asignar');
  });

  it('devuelve «Sin asignar» cuando el sessionUserId aún no está resuelto (sesión cargando), NUNCA «Tú»', () => {
    expect(resolveAssignee(TECHNICIAN_ID, undefined)).toBe('Sin asignar');
    expect(resolveAssignee(null, undefined)).toBe('Sin asignar');
  });
});

describe('Tarjeta de la lista del técnico (T002/FR-001/002/003)', () => {
  it('FR-001: la tarjeta muestra fila superior (código mono + chip), nombre y fila de meta', async () => {
    bootAs('technician');
    server.use(
      http.get('/v1/orders', () =>
        HttpResponse.json({
          orders: [order('11112222-3333-4444-5555-666677778888', 'Reparar caldera', TECHNICIAN_ID)],
        }),
      ),
    );
    renderApp(<AppRoutes />, '/orders');
    const title = await screen.findByText('Reparar caldera');
    const card = title.closest('li') as HTMLElement;
    expect(within(card).getByText('#11112222')).toBeInTheDocument();
    expect(within(card).getByText('Asignada')).toBeInTheDocument();
    // FR-002: fila de meta — cliente «—» (contrato sin cliente) y técnico «Tú» (assigned_to == userId).
    const meta = card.querySelector('.order-item__meta');
    expect(meta).not.toBeNull();
    expect(within(meta as HTMLElement).getByText('—')).toBeInTheDocument();
    expect(within(meta as HTMLElement).getByText('Tú')).toBeInTheDocument();
  });

  it('FR-002 (guarda defensiva): assigned_to distinto del userId → UUID truncado (nunca «Tú»)', async () => {
    bootAs('technician');
    server.use(
      http.get('/v1/orders', () =>
        HttpResponse.json({ orders: [order('o2', 'Orden ajena', OTHER_UUID)] }),
      ),
    );
    renderApp(<AppRoutes />, '/orders');
    const title = await screen.findByText('Orden ajena');
    const card = title.closest('li') as HTMLElement;
    const meta = card.querySelector('.order-item__meta') as HTMLElement;
    expect(within(meta).getByText(OTHER_UUID.slice(0, 8))).toBeInTheDocument();
    expect(within(meta).queryByText('Tú')).not.toBeInTheDocument();
  });

  it('FR-002 (edge): assigned_to null → «Sin asignar»', async () => {
    bootAs('technician');
    server.use(http.get('/v1/orders', () => HttpResponse.json({ orders: [order('o3', 'Sin dueño', null)] })));
    renderApp(<AppRoutes />, '/orders');
    const title = await screen.findByText('Sin dueño');
    const card = title.closest('li') as HTMLElement;
    const meta = card.querySelector('.order-item__meta') as HTMLElement;
    expect(within(meta).getByText('Sin asignar')).toBeInTheDocument();
  });

  it('FR-002 (fila de oficina, wide): assigned_to distinto del usuario → UUID, nunca «Tú»', async () => {
    setViewportWide(true);
    bootAs('dispatcher');
    server.use(
      http.get('/v1/orders', () => HttpResponse.json({ orders: [order('o4', 'Orden de oficina', OTHER_UUID)] })),
    );
    renderApp(<AppRoutes />, '/orders');
    const title = await screen.findByText('Orden de oficina');
    const card = title.closest('li') as HTMLElement;
    expect(card.querySelector('.order-item--row')).not.toBeNull();
    const meta = card.querySelector('.order-item__meta') as HTMLElement;
    expect(within(meta).getByText(OTHER_UUID.slice(0, 8))).toBeInTheDocument();
    expect(within(meta).queryByText('Tú')).not.toBeInTheDocument();
    // FR-003: cliente sigue sin inventarse — «—».
    expect(within(meta).getByText('—')).toBeInTheDocument();
  });
});
