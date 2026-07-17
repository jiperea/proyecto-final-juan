// 025 · Fase Red — T004 (foundational: disparo/remount), T007 (shell a11y US1), T008 (carga/errores US1).
// `EvidenceViewer` (`src/features/orders/EvidenceViewer.tsx`) AÚN NO EXISTE: estos tests fallan hoy por
// falta de implementación (no se abre ningún `role=dialog`), no por un import roto — `OrderDetailView`
// existe y renderiza los tiles; lo que falta es que activarlos abra el visor.
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as axeMatchers from 'vitest-axe/matchers';
import { axe } from '../a11y/axe-fieldops';
import { AllProviders, renderApp } from '../test-utils';
import { AppRoutes } from '../../src/routes/AppRoutes';
import { OrderDetailView } from '../../src/features/orders/OrderDetailView';
import { setAccessToken } from '../../src/api/session-store';
import { setViewportWide } from '../viewport';
import { server } from '../../mocks/server';
import {
  ITEMS_N1,
  ITEMS_N3,
  ITEMS_B1,
  EVIDENCE_ID_1,
  EVIDENCE_ID_B1,
  ORDER_A,
  ORDER_B,
  bootAs,
  mockEvidence200,
  mockEvidence404,
  mockEvidence410,
  mockEvidenceNetworkError,
  orderDetailResponse,
} from './evidence-viewer-fixtures';

expect.extend(axeMatchers);

afterEach(() => setAccessToken(null));
beforeEach(() => setViewportWide(false));

describe('EvidenceViewer · disparo del visor (T004 · FR-001, edge legacy, FR-014)', () => {
  it('(a) un tile CON evidence_id abre el visor en su posición al hacer click', async () => {
    bootAs('technician');
    server.use(http.get(`/v1/orders/${ORDER_A}`, () => HttpResponse.json(orderDetailResponse(ORDER_A, 'Orden A', { items: ITEMS_N3 }))));
    mockEvidence200(ORDER_A, EVIDENCE_ID_1);
    renderApp(<AppRoutes />, `/orders/${ORDER_A}`);
    await screen.findByRole('heading', { name: 'Orden A' });

    fireEvent.click(screen.getByRole('button', { name: /Ver imagen 1 de 3/i }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(await within(dialog).findByAltText('Imagen 1')).toBeInTheDocument();
  });

  it('(a) también se abre con Enter/Espacio desde teclado', async () => {
    bootAs('technician');
    server.use(http.get(`/v1/orders/${ORDER_A}`, () => HttpResponse.json(orderDetailResponse(ORDER_A, 'Orden A', { items: ITEMS_N1 }))));
    mockEvidence200(ORDER_A, EVIDENCE_ID_1);
    const u = userEvent.setup();
    renderApp(<AppRoutes />, `/orders/${ORDER_A}`);
    await screen.findByRole('heading', { name: 'Orden A' });

    screen.getByRole('button', { name: /Ver imagen 1 de 1/i }).focus();
    await u.keyboard('{Enter}');
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('(b) un tile LEGACY sin evidence_id no es interactivo y no abre el visor', async () => {
    bootAs('technician');
    server.use(
      http.get(`/v1/orders/${ORDER_A}`, () =>
        HttpResponse.json(orderDetailResponse(ORDER_A, 'Orden legacy', { legacyCount: 2 })),
      ),
    );
    renderApp(<AppRoutes />, `/orders/${ORDER_A}`);
    await screen.findByRole('heading', { name: 'Orden legacy' });

    expect(screen.getByText('Imagen 1')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ver imagen/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Imagen 1'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('(c) al cambiar de orden (remount vía key={orderId}) el visor no arrastra estado, no repite fetch con el par antiguo y revoca sus object URLs al desmontar', async () => {
    bootAs('technician');
    server.use(http.get(`/v1/orders/${ORDER_A}`, () => HttpResponse.json(orderDetailResponse(ORDER_A, 'Orden A', { items: ITEMS_N1 }))));
    server.use(http.get(`/v1/orders/${ORDER_B}`, () => HttpResponse.json(orderDetailResponse(ORDER_B, 'Orden B', { items: ITEMS_B1 }))));
    let callsA = 0;
    server.use(
      http.get(`/v1/orders/${ORDER_A}/evidence/${EVIDENCE_ID_1}`, () => {
        callsA += 1;
        return HttpResponse.arrayBuffer(new Uint8Array([9]).buffer, {
          status: 200,
          headers: { 'Content-Type': 'image/jpeg' },
        });
      }),
    );
    mockEvidence200(ORDER_B, EVIDENCE_ID_B1);
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL');

    // Réplica exacta del patrón de `OrdersView` (`<OrderDetailView key={orderId} …>` dentro del padre que
    // NO se remonta a sí mismo) — NO un `rerender` con prop cambiada sin key, que no desmontaría.
    function Harness({ orderId }: { orderId: string }) {
      return <OrderDetailView key={orderId} orderId={orderId} />;
    }

    const { rerender } = render(
      <AllProviders>
        <Harness orderId={ORDER_A} />
      </AllProviders>,
    );
    await screen.findByRole('heading', { name: 'Orden A' });
    fireEvent.click(screen.getByRole('button', { name: /Ver imagen 1 de 1/i }));
    await screen.findByRole('dialog');
    await screen.findByAltText('Imagen 1');
    expect(callsA).toBe(1);

    revokeSpy.mockClear();
    rerender(
      <AllProviders>
        <Harness orderId={ORDER_B} />
      </AllProviders>,
    );
    await screen.findByRole('heading', { name: 'Orden B' });

    // el visor nace cerrado con la nueva orden — no arrastra el estado «abierto» de la orden previa.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // no se repite el fetch del par antiguo (orderId A / evidence 1).
    expect(callsA).toBe(1);
    // el desmontaje del visor de la orden A revocó su object URL (efecto de limpieza, FR-014).
    expect(revokeSpy).toHaveBeenCalled();
  });
});

describe('EvidenceViewer · shell modal a11y (T007 · FR-001/FR-003/FR-004/FR-010b, SC-003/SC-004)', () => {
  async function openViewer() {
    bootAs('technician');
    server.use(http.get(`/v1/orders/${ORDER_A}`, () => HttpResponse.json(orderDetailResponse(ORDER_A, 'Orden A', { items: ITEMS_N1 }))));
    mockEvidence200(ORDER_A, EVIDENCE_ID_1);
    renderApp(<AppRoutes />, `/orders/${ORDER_A}`);
    await screen.findByRole('heading', { name: 'Orden A' });
    const trigger = screen.getByRole('button', { name: /Ver imagen 1 de 1/i });
    fireEvent.click(trigger);
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByAltText('Imagen 1'); // esperar a que resuelva, evita solapar con el spinner
    return { dialog, trigger };
  }

  it('abre con role=dialog + aria-modal=true, y el foco inicial queda dentro (botón Cerrar)', async () => {
    const { dialog } = await openViewer();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('button', { name: 'Cerrar' })).toHaveFocus();
  });

  it('el foco queda atrapado: Tab en el último de los controles vuelve al primero (y Shift+Tab al revés)', async () => {
    const { dialog } = await openViewer();
    // N=1 → sin controles de navegación (FR-009): único focusable = Cerrar; el ciclo vuelve a sí mismo.
    const focusables = within(dialog).getAllByRole('button');
    expect(focusables).toHaveLength(1);
    const closeBtn = focusables[0]!;
    closeBtn.focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(closeBtn).toHaveFocus();
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(closeBtn).toHaveFocus();
  });

  it('Esc cierra el visor y devuelve el foco al tile que lo abrió', async () => {
    const { dialog, trigger } = await openViewer();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('el botón «Cerrar» cierra el visor y devuelve el foco al tile', async () => {
    const { trigger } = await openViewer();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('el click en el backdrop (fuera de la imagen) cierra el visor y devuelve el foco al tile', async () => {
    const { trigger } = await openViewer();
    const overlay = document.querySelector('.evidence-viewer__overlay');
    expect(overlay, 'falta la clase .evidence-viewer__overlay (backdrop) — ver research.md D1/D5').not.toBeNull();
    fireEvent.click(overlay!);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('reabrir (abrir→cerrar→reabrir) no deja overlay duplicado', async () => {
    const { trigger } = await openViewer();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(trigger);
    await screen.findByRole('dialog');
    await screen.findByAltText('Imagen 1');
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });

  it('sin violaciones de accesibilidad (axe)', async () => {
    await openViewer();
    expect(await axe(document.body)).toHaveNoViolations();
  });
});

describe('EvidenceViewer · carga y errores (T008 · FR-002/FR-005/FR-013)', () => {
  it('muestra un indicador de carga mientras se descarga el binario', async () => {
    bootAs('technician');
    server.use(http.get(`/v1/orders/${ORDER_A}`, () => HttpResponse.json(orderDetailResponse(ORDER_A, 'Orden A', { items: ITEMS_N1 }))));
    mockEvidence200(ORDER_A, EVIDENCE_ID_1, 20);
    renderApp(<AppRoutes />, `/orders/${ORDER_A}`);
    await screen.findByRole('heading', { name: 'Orden A' });
    fireEvent.click(screen.getByRole('button', { name: /Ver imagen 1 de 1/i }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText(/Cargando imagen 1/i)).toBeInTheDocument();
  });

  it('410 EVIDENCE_GONE → «Esta imagen ya no está disponible.» (messageForCode), sin imagen rota', async () => {
    bootAs('technician');
    server.use(http.get(`/v1/orders/${ORDER_A}`, () => HttpResponse.json(orderDetailResponse(ORDER_A, 'Orden A', { items: ITEMS_N1 }))));
    mockEvidence410(ORDER_A, EVIDENCE_ID_1);
    renderApp(<AppRoutes />, `/orders/${ORDER_A}`);
    await screen.findByRole('heading', { name: 'Orden A' });
    fireEvent.click(screen.getByRole('button', { name: /Ver imagen 1 de 1/i }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Esta imagen ya no está disponible.')).toBeInTheDocument();
    expect(within(dialog).queryByRole('img')).not.toBeInTheDocument();
  });

  it('red/offline (sin respuesta HTTP) → OFFLINE_MESSAGE', async () => {
    bootAs('technician');
    server.use(http.get(`/v1/orders/${ORDER_A}`, () => HttpResponse.json(orderDetailResponse(ORDER_A, 'Orden A', { items: ITEMS_N1 }))));
    mockEvidenceNetworkError(ORDER_A, EVIDENCE_ID_1);
    renderApp(<AppRoutes />, `/orders/${ORDER_A}`);
    await screen.findByRole('heading', { name: 'Orden A' });
    fireEvent.click(screen.getByRole('button', { name: /Ver imagen 1 de 1/i }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Sin conexión. Reinténtalo.')).toBeInTheDocument();
  });

  it('404 → FALLBACK_MESSAGE único (NO el texto por-código de messageForCode para 404)', async () => {
    bootAs('technician');
    server.use(http.get(`/v1/orders/${ORDER_A}`, () => HttpResponse.json(orderDetailResponse(ORDER_A, 'Orden A', { items: ITEMS_N1 }))));
    mockEvidence404(ORDER_A, EVIDENCE_ID_1);
    renderApp(<AppRoutes />, `/orders/${ORDER_A}`);
    await screen.findByRole('heading', { name: 'Orden A' });
    fireEvent.click(screen.getByRole('button', { name: /Ver imagen 1 de 1/i }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Ha ocurrido un error. Reinténtalo.')).toBeInTheDocument();
    // NO debe filtrar el motivo (404 uniforme heredado de 024): ni el texto de NOT_FOUND de orden ni nada similar.
    expect(within(dialog).queryByText(/no existe o no está disponible/i)).not.toBeInTheDocument();
  });

  it('500 (u otro >=400 distinto de 401/410) → el MISMO FALLBACK_MESSAGE único', async () => {
    bootAs('technician');
    server.use(http.get(`/v1/orders/${ORDER_A}`, () => HttpResponse.json(orderDetailResponse(ORDER_A, 'Orden A', { items: ITEMS_N1 }))));
    server.use(
      http.get(`/v1/orders/${ORDER_A}/evidence/${EVIDENCE_ID_1}`, () =>
        HttpResponse.json({ code: 'INTERNAL', message: 'boom' }, { status: 500 }),
      ),
    );
    renderApp(<AppRoutes />, `/orders/${ORDER_A}`);
    await screen.findByRole('heading', { name: 'Orden A' });
    fireEvent.click(screen.getByRole('button', { name: /Ver imagen 1 de 1/i }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Ha ocurrido un error. Reinténtalo.')).toBeInTheDocument();
  });

  it('200 con blob no decodificable (onError del <img>) → FALLBACK_MESSAGE, revocación inmediata y SIN loguear detalle/evidence_id/URL blob', async () => {
    bootAs('technician');
    server.use(http.get(`/v1/orders/${ORDER_A}`, () => HttpResponse.json(orderDetailResponse(ORDER_A, 'Orden A', { items: ITEMS_N1 }))));
    mockEvidence200(ORDER_A, EVIDENCE_ID_1);
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    renderApp(<AppRoutes />, `/orders/${ORDER_A}`);
    await screen.findByRole('heading', { name: 'Orden A' });
    fireEvent.click(screen.getByRole('button', { name: /Ver imagen 1 de 1/i }));
    const dialog = await screen.findByRole('dialog');
    const img = await within(dialog).findByAltText('Imagen 1');
    revokeSpy.mockClear();

    fireEvent.error(img);

    expect(await within(dialog).findByText('Ha ocurrido un error. Reinténtalo.')).toBeInTheDocument();
    expect(within(dialog).queryByAltText('Imagen 1')).not.toBeInTheDocument();
    expect(revokeSpy).toHaveBeenCalled(); // revocación INMEDIATA (no espera al cierre)
    const logged = errorSpy.mock.calls.flat().map(String).join(' | ');
    expect(logged).not.toContain(EVIDENCE_ID_1);
    expect(logged).not.toMatch(/blob:/);
    errorSpy.mockRestore();
  });

  it('la imagen se renderiza desde un object URL (blob:), sin exponer la URL del endpoint en el DOM', async () => {
    bootAs('technician');
    server.use(http.get(`/v1/orders/${ORDER_A}`, () => HttpResponse.json(orderDetailResponse(ORDER_A, 'Orden A', { items: ITEMS_N1 }))));
    mockEvidence200(ORDER_A, EVIDENCE_ID_1);
    const { container } = renderApp(<AppRoutes />, `/orders/${ORDER_A}`);
    await screen.findByRole('heading', { name: 'Orden A' });
    fireEvent.click(screen.getByRole('button', { name: /Ver imagen 1 de 1/i }));
    const dialog = await screen.findByRole('dialog');
    const img = (await within(dialog).findByAltText('Imagen 1')) as HTMLImageElement;
    expect(img.src.startsWith('blob:')).toBe(true);
    expect(container.innerHTML).not.toContain(`/v1/orders/${ORDER_A}/evidence`);
    expect(container.innerHTML).not.toMatch(/Bearer\s/i);
  });

  it('revoca el object URL al cerrar el visor', async () => {
    bootAs('technician');
    server.use(http.get(`/v1/orders/${ORDER_A}`, () => HttpResponse.json(orderDetailResponse(ORDER_A, 'Orden A', { items: ITEMS_N1 }))));
    mockEvidence200(ORDER_A, EVIDENCE_ID_1);
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL');
    renderApp(<AppRoutes />, `/orders/${ORDER_A}`);
    await screen.findByRole('heading', { name: 'Orden A' });
    fireEvent.click(screen.getByRole('button', { name: /Ver imagen 1 de 1/i }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByAltText('Imagen 1');
    revokeSpy.mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(revokeSpy).toHaveBeenCalled();
  });
});
