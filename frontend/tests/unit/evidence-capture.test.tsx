// FE-8 (022) · T019 [Red] · US4 · FR-008/H-004.
//
// «Registrar ejecución»: rejilla de evidencia en 3 columnas con tile «+» (borde discontinuo, SIN
// acento — H-004: el «+» no es la superficie de acento; el botón primario de enviar sí lo es) y
// píldora de requisito («✓ N, mínimo 1» cumplido / no cumplido), como en el artifact.
//
// Debe FALLAR ahora: `EvidencePicker` hoy es un `<input type=file>` + lista simple (`.evidence-list`),
// SIN rejilla de 3 columnas, SIN tile «+» dedicado y SIN píldora de requisito — T021 lo pone en verde.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EvidencePicker } from '../../src/features/orders/EvidencePicker';
import type { EvidenceItem } from '../../src/features/orders/evidence';

const ORDERS_CSS = readFileSync(resolve(process.cwd(), 'src/features/orders/orders.css'), 'utf8');

function fakeItem(n: number): EvidenceItem {
  return {
    ref: { object_ref: `ref-${n}`, content_type: 'image/jpeg', size_bytes: 1024 },
    previewUrl: `blob:fake-${n}`,
    fileName: `foto-${n}.jpg`,
    fingerprint: `fp-${n}`,
  };
}

describe('FE-8 · rejilla de evidencia 3-col + tile «+» (FR-008/H-004)', () => {
  it('la rejilla declara 3 columnas en CSS de producción', () => {
    // Regla dedicada de rejilla (no `.evidence-list` flex heredado de FE-2).
    const rule = ORDERS_CSS.match(/\.evidence-grid\s*\{[^}]*\}/)?.[0] ?? '';
    expect(rule, 'no existe `.evidence-grid` en orders.css').not.toBe('');
    expect(rule).toMatch(/grid-template-columns:\s*repeat\(3/);
  });

  it('el tile «+» NO usa el acento vivo (H-004)', () => {
    render(<EvidencePicker items={[]} onChange={() => undefined} />);
    const addTile = screen.getByRole('button', { name: /añadir foto/i });
    expect(addTile).toBeInTheDocument();
    const rule = ORDERS_CSS.match(/\.evidence-add\s*\{[^}]*\}/)?.[0] ?? '';
    expect(rule, 'no existe `.evidence-add` en orders.css').not.toBe('');
    expect(rule).not.toMatch(/var\(--color-accent-vivid\)/);
    expect(rule).not.toMatch(/var\(--color-primary\)/);
  });
});

describe('FE-8 · píldora de requisito de fotos (FR-008)', () => {
  it('0 fotos: «no cumplido» — «0, mínimo 1»', () => {
    render(<EvidencePicker items={[]} onChange={() => undefined} />);
    const pill = screen.getByText(/mínimo 1/i);
    expect(pill.textContent).toMatch(/0.*mínimo 1/);
    expect(pill.textContent).not.toMatch(/✓/);
  });

  it('≥1 foto: «cumplido» — «✓ N, mínimo 1»', () => {
    render(<EvidencePicker items={[fakeItem(1), fakeItem(2)]} onChange={() => undefined} />);
    const pill = screen.getByText(/mínimo 1/i);
    expect(pill.textContent).toMatch(/✓\s*2.*mínimo 1/);
  });
});
