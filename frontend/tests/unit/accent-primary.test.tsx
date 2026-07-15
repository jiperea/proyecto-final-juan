import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button } from '../../src/ui/Button';
import { StatusBadge } from '../../src/ui/StatusBadge';
import type { OrderStatus } from '../../src/api/types';

// FR-002/FR-003 · la acción primaria expone la clase de acento (btn--primary → token de acento) y el badge
// de cada estado comunica color + TEXTO (no solo color, WCAG 1.4.1).
describe('acento primario y badge con texto', () => {
  it('la acción primaria usa la clase de acento btn--primary', () => {
    render(<Button>Entrar</Button>);
    const btn = screen.getByRole('button', { name: 'Entrar' });
    expect(btn).toHaveClass('btn', 'btn--primary');
  });

  it.each<[OrderStatus, string]>([
    ['draft', 'Borrador'],
    ['assigned', 'Asignada'],
    ['in_progress', 'En curso'],
    ['pending_review', 'En revisión'],
    ['closed', 'Cerrada'],
  ])('el badge de %s muestra la etiqueta de texto «%s»', (status, label) => {
    render(<StatusBadge status={status} />);
    const badge = screen.getByText(label);
    expect(badge).toHaveClass(`badge--${status}`);
  });
});
