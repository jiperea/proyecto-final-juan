import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { renderApp } from '../test-utils';
import { AppRoutes } from '../../src/routes/AppRoutes';
import { Spinner, EmptyState, InlineError, MasterDetail } from '../../src/ui';

describe('T049 · a11y transversal (FR-024/026/028/031/025)', () => {
  it('FR-024: al montar la ruta, el foco va al <h1> de la vista', async () => {
    renderApp(<AppRoutes />, '/orders'); // bootstrap por defecto → autenticado
    const h1 = await screen.findByRole('heading', { name: 'Mis órdenes' });
    await waitFor(() => expect(document.activeElement).toBe(h1));
  });

  it('FR-026: Spinner expone aria-busy y role=status', () => {
    render(<Spinner />);
    const region = screen.getByRole('status');
    expect(region).toHaveAttribute('aria-busy', 'true');
  });

  it('FR-031: estado vacío=role=status, error=role=alert (live regions)', () => {
    const { rerender } = render(<EmptyState>Sin órdenes</EmptyState>);
    expect(screen.getByRole('status')).toHaveTextContent('Sin órdenes');
    rerender(<InlineError>Fallo</InlineError>);
    expect(screen.getByRole('alert')).toHaveTextContent('Fallo');
  });

  it('FR-028: tokens.css desactiva animaciones con prefers-reduced-motion', () => {
    const css = readFileSync('src/ui/tokens.css', 'utf8');
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce/);
    expect(css).toMatch(/transition-duration:\s*0/);
  });

  it('FR-025: MasterDetail mueve el foco al panel de detalle al seleccionar', async () => {
    const { rerender } = render(
      <MasterDetail wide={false} hasSelection={false} list={<p>lista</p>} detail={<h2>Detalle</h2>} onBack={() => {}} />,
    );
    rerender(
      <MasterDetail wide={false} hasSelection list={<p>lista</p>} detail={<h2>Detalle</h2>} onBack={() => {}} />,
    );
    await waitFor(() => expect(document.activeElement).toHaveTextContent('Detalle'));
  });
});
