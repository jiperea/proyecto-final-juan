import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { EvidencePicker } from '../../src/features/orders/EvidencePicker';
import type { EvidenceItem } from '../../src/features/orders/evidence';

function file(name: string, type: string, size = 1024): File {
  const f = new File([new Uint8Array(1)], name, { type });
  Object.defineProperty(f, 'size', { value: size });
  return f;
}

function Harness() {
  const [items, setItems] = useState<EvidenceItem[]>([]);
  return <EvidencePicker items={items} onChange={setItems} />;
}

describe('FE-2 · EvidencePicker (FR-004)', () => {
  // 024 (T032): el aviso de «no se almacena todavía» (deuda #007) queda OBSOLETO — el envío ahora sube
  // el binario real (uploadOrderEvidence). Se elimina el aviso; ya no aplica.
  it('añade una imagen válida con preview y nombre accesible', () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('Añadir foto'), { target: { files: [file('foto.jpg', 'image/jpeg')] } });
    expect(screen.getByAltText(/Foto 1 de 1: foto\.jpg/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Eliminar foto 1 de 1' })).toBeInTheDocument();
  });

  it('rechaza al añadir un formato no admitido (INVALID_EVIDENCE)', () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('Añadir foto'), { target: { files: [file('x.pdf', 'application/pdf')] } });
    expect(screen.getByRole('alert').textContent).toMatch(/Formato no admitido/);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('permite eliminar una evidencia por ítem', () => {
    render(<Harness />);
    const input = screen.getByLabelText('Añadir foto');
    fireEvent.change(input, { target: { files: [file('foto.jpg', 'image/jpeg')] } });
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar foto 1 de 1' }));
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
