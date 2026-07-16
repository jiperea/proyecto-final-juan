// FE-8 (022) · T005 [Red] · US2 · FR-003.
//
// El chip de estado (StatusBadge) debe llevar un punto de color a la izquierda, indicador `::before`
// con `currentColor` (sin token propio: toma el fg del propio chip), como en el artifact.
//
// jsdom NO implementa `getComputedStyle(el, '::before')` (lanza «Not implemented»), así que esto se
// verifica en dos capas, como indica tasks.md: (a) el marcado renderizado sigue exponiendo la clase
// `badge--<status>` sobre la que cuelga el punto (para que el selector CSS tenga algo a lo que
// aplicarse) y (b) la regla `::before` con `currentColor` existe en el CSS de producción
// (`src/ui/components.css`) — hoy NO existe ninguna regla `::before` para `.badge`, así que esto falla.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusBadge } from '../../src/ui/StatusBadge';
import type { OrderStatus } from '../../src/api/types';

const COMPONENTS_CSS = readFileSync(resolve(process.cwd(), 'src/ui/components.css'), 'utf8');

describe('FE-8 · StatusBadge — punto de color (FR-003)', () => {
  it.each<OrderStatus>(['draft', 'assigned', 'in_progress', 'pending_review', 'closed'])(
    'el chip %s conserva su clase de estado (ancla del punto ::before)',
    (status) => {
      render(<StatusBadge status={status} />);
      const badge = screen.getByText(/./, { selector: `.badge--${status}` });
      expect(badge).toBeInTheDocument();
    },
  );

  it('el chip define un punto `::before` con `currentColor` (sin color propio)', () => {
    // Regla genérica sobre `.badge` (o específica por variante) con `content` y color heredado del
    // propio chip vía `currentColor` — NO un token de color nuevo (el fg ya lo fija cada `.badge--*`).
    const rule = COMPONENTS_CSS.match(/\.badge(?:--[\w]+)?::before\s*\{[^}]*\}/);
    expect(rule, 'no existe ninguna regla `.badge(::before)` en components.css').not.toBeNull();
    const body = rule?.[0] ?? '';
    expect(body).toMatch(/content:\s*['"]{2}|content:\s*['"][^'"]*['"]/);
    expect(body).toMatch(/currentColor/);
    // El punto no debe fijar un color propio (background/border-color) que no sea currentColor.
    expect(body).not.toMatch(/background(?:-color)?:\s*var\(--status-/);
  });
});
