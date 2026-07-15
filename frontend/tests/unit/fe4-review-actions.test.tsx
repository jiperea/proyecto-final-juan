import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { ReviewActions } from '../../src/features/orders/ReviewActions';
import { renderApp } from '../test-utils';
import { server } from '../../mocks/server';

const OID = '018f2000-0000-7000-8000-0000000000f2';

describe('FE-4 · ReviewActions', () => {
  it('aprobar abre el alertdialog; Confirmar envía approve; Cancelar no', async () => {
    const onReviewed = vi.fn();
    let sent: unknown;
    server.use(
      http.post(`/v1/orders/:id/review`, async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json({ id: OID, title: 'O', description: 'd', status: 'closed', assigned_to: null, version: 1, created_at: 'x', updated_at: 'y' });
      }),
    );
    renderApp(<ReviewActions orderId={OID} evidenceCount={2} onReviewed={onReviewed} />);
    fireEvent.click(screen.getByRole('button', { name: 'Aprobar' }));
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(onReviewed).toHaveBeenCalled());
    expect(sent).toEqual({ decision: 'approve' });
  });

  it('Aprobar deshabilitado si evidence.count===0 (FR-007)', () => {
    renderApp(<ReviewActions orderId={OID} evidenceCount={0} onReviewed={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Aprobar' })).toBeDisabled();
    expect(screen.getByText(/sin evidencia/i)).toBeInTheDocument();
  });

  it('rechazar exige motivo (validación cliente, sin llamar al backend)', async () => {
    let called = false;
    server.use(http.post(`/v1/orders/:id/review`, () => { called = true; return HttpResponse.json({}); }));
    renderApp(<ReviewActions orderId={OID} evidenceCount={2} onReviewed={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Rechazar' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar rechazo' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(called).toBe(false);
  });

  it('rechazar con motivo válido envía {decision:reject,reason}', async () => {
    const onReviewed = vi.fn();
    let sent: { decision?: string; reason?: string } = {};
    server.use(
      http.post(`/v1/orders/:id/review`, async ({ request }) => {
        sent = (await request.json()) as { decision?: string; reason?: string };
        return HttpResponse.json({ id: OID, title: 'O', description: 'd', status: 'in_progress', assigned_to: null, version: 1, created_at: 'x', updated_at: 'y' });
      }),
    );
    renderApp(<ReviewActions orderId={OID} evidenceCount={2} onReviewed={onReviewed} />);
    fireEvent.click(screen.getByRole('button', { name: 'Rechazar' }));
    fireEvent.change(await screen.findByLabelText('Motivo del rechazo'), { target: { value: 'Faltan fotos del cuadro' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar rechazo' }));
    await waitFor(() => expect(onReviewed).toHaveBeenCalled());
    expect(sent.decision).toBe('reject');
    expect(sent.reason).toBe('Faltan fotos del cuadro');
  });

  it('INVALID_REASON → mensaje asociado al campo motivo', async () => {
    server.use(http.post(`/v1/orders/:id/review`, () => HttpResponse.json({ code: 'INVALID_REASON', message: 'x' }, { status: 422 })));
    renderApp(<ReviewActions orderId={OID} evidenceCount={2} onReviewed={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Rechazar' }));
    fireEvent.change(await screen.findByLabelText('Motivo del rechazo'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar rechazo' }));
    expect(await screen.findByText('Indica un motivo válido.')).toBeInTheDocument();
  });

  it('EVIDENCE_MISSING (409) en approve → alerta general', async () => {
    server.use(http.post(`/v1/orders/:id/review`, () => HttpResponse.json({ code: 'EVIDENCE_MISSING', message: 'x' }, { status: 409 })));
    renderApp(<ReviewActions orderId={OID} evidenceCount={undefined} onReviewed={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Aprobar' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/sin evidencia|evidencia/i);
  });

  it.each([
    ['VALIDATION_ERROR', 422],
    ['GUARD_UNMET', 404],
    ['FORBIDDEN_ROLE', 403],
    ['INTERNAL', 500],
    ['SERVICE_UNAVAILABLE', 503],
  ])('reject: %s (%d) → alerta general mapeada, sin romper', async (code, status) => {
    server.use(http.post(`/v1/orders/:id/review`, () => HttpResponse.json({ code, message: 'x' }, { status })));
    renderApp(<ReviewActions orderId={OID} evidenceCount={2} onReviewed={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Rechazar' }));
    fireEvent.change(await screen.findByLabelText('Motivo del rechazo'), { target: { value: 'Motivo válido' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar rechazo' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    // FR-009: el motivo se conserva para reintentar sin retipeo (500/503 y demás).
    expect(screen.getByLabelText('Motivo del rechazo')).toHaveValue('Motivo válido');
  });

  it('reject con motivo > 1000 code points → bloqueado en cliente (FR-004), sin llamar al backend', async () => {
    let called = false;
    server.use(http.post(`/v1/orders/:id/review`, () => { called = true; return HttpResponse.json({}); }));
    renderApp(<ReviewActions orderId={OID} evidenceCount={2} onReviewed={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Rechazar' }));
    fireEvent.change(await screen.findByLabelText('Motivo del rechazo'), { target: { value: 'a'.repeat(1001) } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar rechazo' }));
    expect(await screen.findByText(/no puede superar los 1000/i)).toBeInTheDocument();
    expect(called).toBe(false);
  });

  it('401 en approve confirmado → NO se reintenta automáticamente (una sola llamada, FR-009b)', async () => {
    let calls = 0;
    server.use(
      http.post(`/v1/orders/:id/review`, () => {
        calls += 1;
        return HttpResponse.json({ code: 'UNAUTHENTICATED', message: 'x' }, { status: 401 });
      }),
    );
    renderApp(<ReviewActions orderId={OID} evidenceCount={2} onReviewed={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Aprobar' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(calls).toBe(1)); // sin refresh+retry del POST irreversible
  });
});
