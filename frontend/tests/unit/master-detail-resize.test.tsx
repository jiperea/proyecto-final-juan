import { useState } from 'react';
import { describe, expect, it, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { MasterDetail, useWideViewport } from '../../src/ui';
import { setViewportWide } from '../viewport';

// Harness que refleja el uso real: layout por viewport + selección.
function Harness() {
  const wide = useWideViewport();
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <MasterDetail
      wide={wide}
      hasSelection={selected !== null}
      onBack={() => setSelected(null)}
      list={
        <button type="button" onClick={() => setSelected('o1')}>
          Orden 1
        </button>
      }
      detail={<h2>Detalle {selected}</h2>}
    />
  );
}

describe('T052 · master-detail cruce dinámico de 1024px (FR-025)', () => {
  beforeEach(() => setViewportWide(true));

  it('≥1024 con selección: lista y detalle simultáneos; al estrechar colapsa a detalle con retorno; al ensanchar re-expande conservando selección', async () => {
    render(<Harness />);
    // wide, sin selección → placeholder
    expect(screen.getByText('Selecciona una orden')).toBeInTheDocument();
    // seleccionar
    await act(async () => {
      screen.getByRole('button', { name: 'Orden 1' }).click();
    });
    expect(screen.getByRole('heading', { name: 'Detalle o1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Orden 1' })).toBeInTheDocument(); // lista sigue visible

    // resize < 1024 con detalle abierto → colapsa a detalle con «Volver a la lista»
    await act(async () => setViewportWide(false));
    expect(screen.getByRole('button', { name: /Volver a la lista/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Detalle o1' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Orden 1' })).not.toBeInTheDocument();

    // resize ≥ 1024 de nuevo → re-expande conservando la selección
    await act(async () => setViewportWide(true));
    expect(screen.getByRole('button', { name: 'Orden 1' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Detalle o1' })).toBeInTheDocument();
  });
});
