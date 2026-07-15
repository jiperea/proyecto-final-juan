import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Stepper } from '../../src/ui/Stepper';
import type { OrderStatus } from '../../src/api/types';

// FR-006/SC-005/FR-014 · Stepper: paso actual correcto por estado + estado comunicado también por texto.
const CASES: Array<[OrderStatus, string, string[]]> = [
  ['draft', 'Borrador', []],
  ['assigned', 'Asignada', ['Borrador']],
  ['in_progress', 'En curso', ['Borrador', 'Asignada']],
  ['pending_review', 'En revisión', ['Borrador', 'Asignada', 'En curso']],
  ['closed', 'Cerrada', ['Borrador', 'Asignada', 'En curso', 'En revisión']],
];

describe('Stepper del ciclo de vida', () => {
  it.each(CASES)('estado %s → paso actual «%s» y previos completados', (status, currentLabel, doneLabels) => {
    render(<Stepper status={status} />);
    const list = screen.getByRole('list', { name: 'Estado de la orden' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(5);

    // El paso actual tiene aria-current="step" y su etiqueta + texto «(actual)».
    const current = items.find((li) => li.getAttribute('aria-current') === 'step')!;
    expect(current).toBeDefined();
    expect(current.textContent).toContain(currentLabel);
    expect(current.textContent).toContain('(actual)');

    // Los previos se marcan «(completado)».
    for (const label of doneLabels) {
      const li = items.find((i) => i.textContent?.includes(label))!;
      expect(li.textContent).toContain('(completado)');
    }
  });

  it('el estado se comunica por texto, no solo por color/posición (WCAG 1.4.1)', () => {
    render(<Stepper status="in_progress" />);
    expect(screen.getByText(/En curso/).closest('li')!.textContent).toContain('(actual)');
  });
});
