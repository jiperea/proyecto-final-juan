import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ConfirmDialog } from '../../src/ui/ConfirmDialog';

// FR-017 · ConfirmDialog: alertdialog accesible con foco atrapado/inicial/retorno, Esc, click-outside no cierra.
describe('FE-4 · ConfirmDialog', () => {
  it('no renderiza nada cuando open=false', () => {
    render(<ConfirmDialog open={false} title="X" onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('role=alertdialog + aria-modal; foco inicial en Confirmar', () => {
    render(<ConfirmDialog open title="¿Aprobar?" onConfirm={vi.fn()} onCancel={vi.fn()} />);
    const dlg = screen.getByRole('alertdialog');
    expect(dlg).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('button', { name: 'Confirmar' })).toHaveFocus();
  });

  it('Esc cancela; Confirmar/Cancelar disparan sus callbacks', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<ConfirmDialog open title="¿Aprobar?" onConfirm={onConfirm} onCancel={onCancel} />);
    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('foco atrapado: Tab en el último vuelve al primero y Shift+Tab al revés', () => {
    render(<ConfirmDialog open title="¿Aprobar?" onConfirm={vi.fn()} onCancel={vi.fn()} />);
    const dlg = screen.getByRole('alertdialog');
    const cancel = screen.getByRole('button', { name: 'Cancelar' });
    const confirm = screen.getByRole('button', { name: 'Confirmar' });
    confirm.focus(); // último
    fireEvent.keyDown(dlg, { key: 'Tab' });
    expect(cancel).toHaveFocus(); // wrap al primero
    cancel.focus();
    fireEvent.keyDown(dlg, { key: 'Tab', shiftKey: true });
    expect(confirm).toHaveFocus(); // wrap al último
  });

  it('el click en el overlay NO cierra (patrón alertdialog estricto)', () => {
    const onCancel = vi.fn();
    const { container } = render(
      <ConfirmDialog open title="¿Aprobar?" onConfirm={vi.fn()} onCancel={onCancel} />,
    );
    fireEvent.click(container.querySelector('.dialog-overlay')!);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('retorna el foco al disparador al cerrar', () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)}>abrir</button>
          <ConfirmDialog open={open} title="¿Aprobar?" onConfirm={() => setOpen(false)} onCancel={() => setOpen(false)} />
        </>
      );
    }
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'abrir' });
    trigger.focus();
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(trigger).toHaveFocus();
  });
});
