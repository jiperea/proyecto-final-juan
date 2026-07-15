import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { ReassignForm } from '../../src/features/orders/ReassignForm';
import { renderApp } from '../test-utils';
import { server } from '../../mocks/server';

// FR-011/SC-005 · reason/assignee_id no se emiten a consola ni se persisten en storage del navegador.
const OID = '00000000-0000-7000-8000-0000000000ff';
const DEST = '018f1000-0000-7000-8000-000000000006';
const REASON = 'motivo-secreto-de-reasignacion';

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('FE-3 · no-fuga de reason/assignee_id (FR-011/SC-005)', () => {
  it('tras un envío exitoso, ni consola ni storage contienen reason/assignee_id', async () => {
    const spies = [
      vi.spyOn(console, 'log').mockImplementation(() => {}),
      vi.spyOn(console, 'info').mockImplementation(() => {}),
      vi.spyOn(console, 'warn').mockImplementation(() => {}),
      vi.spyOn(console, 'error').mockImplementation(() => {}),
      vi.spyOn(console, 'debug').mockImplementation(() => {}),
    ];
    server.use(
      http.post(`/v1/orders/:id/reassignments`, () =>
        HttpResponse.json(
          { id: OID, title: 'O', description: 'd', status: 'assigned', assigned_to: DEST, version: 1, created_at: 'x', updated_at: 'y' },
          { status: 200 },
        ),
      ),
    );
    renderApp(<ReassignForm orderId={OID} onReassigned={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Técnico destino'), { target: { value: DEST } });
    fireEvent.change(screen.getByLabelText('Motivo de la reasignación'), { target: { value: REASON } });
    fireEvent.click(screen.getByRole('button', { name: 'Reasignar' }));

    await waitFor(() => {
      const logged = spies.flatMap((s) => s.mock.calls.flat()).map((a) => String(a)).join(' ');
      expect(logged).not.toContain(REASON);
      expect(logged).not.toContain(DEST);
    });

    const storage = JSON.stringify(localStorage) + JSON.stringify(sessionStorage);
    expect(storage).not.toContain(REASON);
    expect(storage).not.toContain(DEST);

    spies.forEach((s) => s.mockRestore());
  });
});
