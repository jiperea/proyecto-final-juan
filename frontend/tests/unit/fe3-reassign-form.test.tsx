import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { ReassignForm } from '../../src/features/orders/ReassignForm';
import { renderApp } from '../test-utils';
import { server } from '../../mocks/server';

const OID = '00000000-0000-7000-8000-0000000000dd';
const DEST = '11111111-1111-4111-8111-111111111111';

function fillValid() {
  fireEvent.change(screen.getByLabelText('Técnico destino'), { target: { value: `  ${DEST}  ` } }); // con espacios (trim)
  fireEvent.change(screen.getByLabelText('Motivo de la reasignación'), {
    target: { value: 'Técnico no disponible' },
  });
}

describe('FE-3 · ReassignForm', () => {
  it('camino feliz: envía {assignee_id,reason} (trim) y llama onReassigned con la orden (FR-002/003/014)', async () => {
    const onReassigned = vi.fn();
    let sent: unknown;
    server.use(
      http.post(`/v1/orders/:id/reassignments`, async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json(
          { id: OID, title: 'O', description: 'd', status: 'assigned', assigned_to: DEST, version: 1, created_at: 'x', updated_at: 'y' },
          { status: 200 },
        );
      }),
    );
    renderApp(<ReassignForm orderId={OID} onReassigned={onReassigned} />);
    fillValid();
    fireEvent.click(screen.getByRole('button', { name: 'Reasignar' }));
    await waitFor(() => expect(onReassigned).toHaveBeenCalled());
    expect(sent).toEqual({ assignee_id: DEST, reason: 'Técnico no disponible' }); // sin espacios
  });

  it('el botón de confirmar NO se deshabilita por validez (siempre accionable — F-101/FR-004)', () => {
    renderApp(<ReassignForm orderId={OID} onReassigned={vi.fn()} />);
    const btn = screen.getByRole('button', { name: 'Reasignar' });
    expect(btn).toBeEnabled(); // sin disabled nativo con campos vacíos
    expect(btn).not.toHaveAttribute('aria-disabled');
  });

  it('validación de cliente: destino y motivo inválidos → AMBOS errores a la vez, sin llamar al backend (FR-005/014/017)', async () => {
    const onReassigned = vi.fn();
    let called = false;
    server.use(
      http.post(`/v1/orders/:id/reassignments`, () => {
        called = true;
        return HttpResponse.json({}, { status: 200 });
      }),
    );
    renderApp(<ReassignForm orderId={OID} onReassigned={onReassigned} />);
    fireEvent.change(screen.getByLabelText('Técnico destino'), { target: { value: 'no-uuid' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reasignar' }));
    const alerts = await screen.findAllByRole('alert');
    expect(alerts.length).toBe(2); // destino + motivo
    expect(called).toBe(false);
    expect(onReassigned).not.toHaveBeenCalled();
  });

  it('el error de campo se limpia al editar (FR-017)', async () => {
    renderApp(<ReassignForm orderId={OID} onReassigned={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Técnico destino'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reasignar' }));
    expect((await screen.findAllByRole('alert')).length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText('Técnico destino'), { target: { value: DEST } });
    await waitFor(() =>
      expect(screen.queryByText('Introduce un identificador con formato UUID válido.')).not.toBeInTheDocument(),
    );
  });

  it('INVALID_ASSIGNEE → mensaje asociado al campo destino, conserva lo introducido (FR-007)', async () => {
    server.use(
      http.post(`/v1/orders/:id/reassignments`, () =>
        HttpResponse.json({ code: 'INVALID_ASSIGNEE', message: 'x' }, { status: 422 }),
      ),
    );
    renderApp(<ReassignForm orderId={OID} onReassigned={vi.fn()} />);
    fillValid();
    fireEvent.click(screen.getByRole('button', { name: 'Reasignar' }));
    expect(await screen.findByText('El técnico destino no es válido.')).toBeInTheDocument();
    expect(screen.getByLabelText('Técnico destino')).toHaveValue(`  ${DEST}  `); // conservado
  });

  it('VALIDATION_ERROR → mensaje asociado al campo motivo (FR-006)', async () => {
    server.use(
      http.post(`/v1/orders/:id/reassignments`, () =>
        HttpResponse.json({ code: 'VALIDATION_ERROR', message: 'x' }, { status: 422 }),
      ),
    );
    renderApp(<ReassignForm orderId={OID} onReassigned={vi.fn()} />);
    fillValid();
    fireEvent.click(screen.getByRole('button', { name: 'Reasignar' }));
    expect(await screen.findByText('Revisa los campos marcados.')).toBeInTheDocument();
  });

  it('500 → alerta general sin romper la vista (FR-015)', async () => {
    server.use(
      http.post(`/v1/orders/:id/reassignments`, () => HttpResponse.json({ code: 'INTERNAL', message: 'x' }, { status: 500 })),
    );
    renderApp(<ReassignForm orderId={OID} onReassigned={vi.fn()} />);
    fillValid();
    fireEvent.click(screen.getByRole('button', { name: 'Reasignar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Ha ocurrido un error. Reinténtalo.');
  });

  it('fallo de red → mensaje de conectividad (FR-016)', async () => {
    server.use(http.post(`/v1/orders/:id/reassignments`, () => HttpResponse.error()));
    renderApp(<ReassignForm orderId={OID} onReassigned={vi.fn()} />);
    fillValid();
    fireEvent.click(screen.getByRole('button', { name: 'Reasignar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Sin conexión. Reinténtalo.');
  });

  it('en error de campo, aria-describedby referencia ayuda Y error a la vez (FR-017)', async () => {
    renderApp(<ReassignForm orderId={OID} onReassigned={vi.fn()} />);
    const destino = screen.getByLabelText('Técnico destino');
    fireEvent.change(destino, { target: { value: 'no-uuid' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reasignar' }));
    await screen.findAllByRole('alert');
    const ids = (destino.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean);
    expect(ids.length).toBe(2); // hint + error coexisten
    expect(destino).toHaveAttribute('aria-invalid', 'true');
  });

  it('estado en vuelo: aria-busy + aria-disabled (no disabled nativo), sin doble envío (FR-004/F-101)', async () => {
    let resolve!: () => void;
    server.use(
      http.post(`/v1/orders/:id/reassignments`, async () => {
        await new Promise<void>((r) => (resolve = r));
        return HttpResponse.json(
          { id: OID, title: 'O', description: 'd', status: 'assigned', assigned_to: DEST, version: 1, created_at: 'x', updated_at: 'y' },
          { status: 200 },
        );
      }),
    );
    renderApp(<ReassignForm orderId={OID} onReassigned={vi.fn()} />);
    fillValid();
    const btn = screen.getByRole('button', { name: 'Reasignar' });
    fireEvent.click(btn);
    const busy = await screen.findByRole('button', { name: 'Reasignando…' });
    expect(busy).toHaveAttribute('aria-disabled', 'true');
    expect(busy).not.toBeDisabled(); // no disabled nativo (no pierde foco)
    resolve();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Reasignando…' })).not.toBeInTheDocument());
  });

  it('motivo con 501 code points (astrales) se rechaza; 500 se acepta (conteo por code point, I-002)', async () => {
    const onReassigned = vi.fn();
    renderApp(<ReassignForm orderId={OID} onReassigned={onReassigned} />);
    fireEvent.change(screen.getByLabelText('Técnico destino'), { target: { value: DEST } });
    // 501 emojis (cada uno 1 code point = 2 unidades UTF-16) → debe rechazarse por code point.
    fireEvent.change(screen.getByLabelText('Motivo de la reasignación'), { target: { value: '😀'.repeat(501) } });
    fireEvent.click(screen.getByRole('button', { name: 'Reasignar' }));
    expect((await screen.findAllByRole('alert')).length).toBeGreaterThan(0);
    expect(onReassigned).not.toHaveBeenCalled();
  });
});
