// 025 · Fase Red — T012 (US2: carrusel). `EvidenceViewer` aún no existe: falla porque nunca aparece
// `role=dialog` (no por un import roto — `OrderDetailView`/tiles ya existen desde 024).
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { renderApp } from '../test-utils';
import { AppRoutes } from '../../src/routes/AppRoutes';
import { setAccessToken } from '../../src/api/session-store';
import { setViewportWide } from '../viewport';
import { server } from '../../mocks/server';
import {
  EVIDENCE_ID_1,
  EVIDENCE_ID_2,
  EVIDENCE_ID_3,
  ITEMS_N1,
  ITEMS_N3,
  ORDER_A,
  bootAs,
  mockEvidence200,
  mockEvidence410,
  orderDetailResponse,
} from './evidence-viewer-fixtures';

afterEach(() => setAccessToken(null));
beforeEach(() => setViewportWide(false));

async function openAt(k: number) {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`Ver imagen ${k} de 3`, 'i') }));
  const dialog = await screen.findByRole('dialog');
  await within(dialog).findByAltText(`Imagen ${k}`);
  return dialog;
}

async function bootN3() {
  bootAs('technician');
  server.use(http.get(`/v1/orders/${ORDER_A}`, () => HttpResponse.json(orderDetailResponse(ORDER_A, 'Orden A', { items: ITEMS_N3 }))));
  mockEvidence200(ORDER_A, EVIDENCE_ID_1);
  mockEvidence200(ORDER_A, EVIDENCE_ID_2);
  mockEvidence200(ORDER_A, EVIDENCE_ID_3);
  renderApp(<AppRoutes />, `/orders/${ORDER_A}`);
  await screen.findByRole('heading', { name: 'Orden A' });
}

describe('EvidenceViewer · carrusel (T012 · FR-006/FR-007/FR-008/FR-009, SC-002)', () => {
  it('abre en la posición k del tile pulsado y muestra el indicador «k de N»', async () => {
    bootAs('technician');
    server.use(http.get(`/v1/orders/${ORDER_A}`, () => HttpResponse.json(orderDetailResponse(ORDER_A, 'Orden A', { items: ITEMS_N3 }))));
    mockEvidence200(ORDER_A, EVIDENCE_ID_2);
    renderApp(<AppRoutes />, `/orders/${ORDER_A}`);
    await screen.findByRole('heading', { name: 'Orden A' });

    fireEvent.click(screen.getByRole('button', { name: /Ver imagen 2 de 3/i }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByAltText('Imagen 2');
    expect(within(dialog).getByText(/2 de 3/)).toBeInTheDocument();
  });

  it('«Siguiente» avanza imagen e indicador; «Anterior» retrocede', async () => {
    await bootN3();
    const dialog = await openAt(1);

    fireEvent.click(within(dialog).getByRole('button', { name: 'Siguiente' }));
    await within(dialog).findByAltText('Imagen 2');
    expect(within(dialog).getByText(/2 de 3/)).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Anterior' }));
    await within(dialog).findByAltText('Imagen 1');
    expect(within(dialog).getByText(/1 de 3/)).toBeInTheDocument();
  });

  it('las flechas ←/→ del teclado navegan igual que los controles', async () => {
    await bootN3();
    const dialog = await openAt(1);

    fireEvent.keyDown(dialog, { key: 'ArrowRight' });
    await within(dialog).findByAltText('Imagen 2');
    fireEvent.keyDown(dialog, { key: 'ArrowLeft' });
    await within(dialog).findByAltText('Imagen 1');
  });

  it('en k=1 «Anterior» queda disabled NATIVO (no tabulable ni activable), sin envolver', async () => {
    await bootN3();
    const dialog = await openAt(1);
    const prev = within(dialog).getByRole('button', { name: 'Anterior' });
    expect(prev).toBeDisabled();
    fireEvent.click(prev); // no debe hacer nada — sigue en 1
    expect(within(dialog).getByText(/1 de 3/)).toBeInTheDocument();
    // excluido del focus-trap (selector `button:not([disabled])`): Tab no debe posarse en él.
    expect(prev).not.toHaveFocus();
  });

  it('en k=N «Siguiente» queda disabled NATIVO, sin envolver', async () => {
    await bootN3();
    const dialog = await openAt(3);
    const next = within(dialog).getByRole('button', { name: 'Siguiente' });
    expect(next).toBeDisabled();
    fireEvent.click(next); // no debe hacer nada — sigue en 3
    expect(within(dialog).getByText(/3 de 3/)).toBeInTheDocument();
  });

  it('con N=1 no se ofrecen controles de navegación ni indicador de posición', async () => {
    bootAs('technician');
    server.use(http.get(`/v1/orders/${ORDER_A}`, () => HttpResponse.json(orderDetailResponse(ORDER_A, 'Orden única', { items: ITEMS_N1 }))));
    mockEvidence200(ORDER_A, EVIDENCE_ID_1);
    renderApp(<AppRoutes />, `/orders/${ORDER_A}`);
    await screen.findByRole('heading', { name: 'Orden única' });
    fireEvent.click(screen.getByRole('button', { name: /Ver imagen 1 de 1/i }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByAltText('Imagen 1');

    expect(within(dialog).queryByRole('button', { name: 'Anterior' })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Siguiente' })).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/\d+\s*de\s*\d+/)).not.toBeInTheDocument();
  });

  it('410 por-índice: una posición sin blob no contamina la navegación al resto', async () => {
    bootAs('technician');
    server.use(http.get(`/v1/orders/${ORDER_A}`, () => HttpResponse.json(orderDetailResponse(ORDER_A, 'Orden A', { items: ITEMS_N3 }))));
    mockEvidence200(ORDER_A, EVIDENCE_ID_1);
    mockEvidence410(ORDER_A, EVIDENCE_ID_2);
    mockEvidence200(ORDER_A, EVIDENCE_ID_3);
    renderApp(<AppRoutes />, `/orders/${ORDER_A}`);
    await screen.findByRole('heading', { name: 'Orden A' });
    fireEvent.click(screen.getByRole('button', { name: /Ver imagen 1 de 3/i }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByAltText('Imagen 1');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Siguiente' })); // → posición 2 (410)
    expect(await within(dialog).findByText('Esta imagen ya no está disponible.')).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Siguiente' })); // → posición 3 (OK)
    await within(dialog).findByAltText('Imagen 3');
    expect(within(dialog).queryByText('Esta imagen ya no está disponible.')).not.toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Anterior' })); // → vuelve a 2 (410)
    expect(await within(dialog).findByText('Esta imagen ya no está disponible.')).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Anterior' })); // → vuelve a 1 (intacta)
    await within(dialog).findByAltText('Imagen 1');
  });

  it('navegación rápida: una respuesta tardía de una posición abandonada no sobrescribe la vigente', async () => {
    bootAs('technician');
    server.use(http.get(`/v1/orders/${ORDER_A}`, () => HttpResponse.json(orderDetailResponse(ORDER_A, 'Orden A', { items: ITEMS_N3 }))));
    mockEvidence200(ORDER_A, EVIDENCE_ID_1);
    mockEvidence200(ORDER_A, EVIDENCE_ID_2, 60); // la respuesta de la posición 2 se demora
    mockEvidence200(ORDER_A, EVIDENCE_ID_3);
    renderApp(<AppRoutes />, `/orders/${ORDER_A}`);
    await screen.findByRole('heading', { name: 'Orden A' });
    fireEvent.click(screen.getByRole('button', { name: /Ver imagen 1 de 3/i }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByAltText('Imagen 1');

    // avanza a 2 (dispara la petición demorada) y de inmediato a 3, antes de que 2 resuelva.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Siguiente' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Siguiente' }));
    await within(dialog).findByAltText('Imagen 3');

    // cuando la respuesta tardía de la posición 2 resuelve, NO debe pisar la imagen 3 vigente.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(within(dialog).getByAltText('Imagen 3')).toBeInTheDocument();
    expect(within(dialog).queryByAltText('Imagen 2')).not.toBeInTheDocument();
  });

  it('las etiquetas de los controles de navegación están en español', async () => {
    await bootN3();
    const dialog = await openAt(1);
    expect(within(dialog).getByRole('button', { name: 'Siguiente' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Anterior' })).toBeInTheDocument();
  });
});
