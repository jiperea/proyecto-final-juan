// FE-8 (022) · T006 [Red] · US2 · FR-002/FR-006.
//
// El Stepper debe pintar cada paso con el color fijo del artifact — done=verde (token `closed`),
// current=morado `pending_review` con halo (`box-shadow: 0 0 0 4px` con `--status-pending_review-bg`),
// pending=`surface-2`+borde — y el paso actual NO debe usar el acento vivo (`--color-accent-vivid`),
// que FE-7/021 dejó en `.stepper__step--current .stepper__dot` y que esta feature SUSTITUYE.
//
// Combina: (a) estructura real renderizada (`Stepper`) para localizar los nodos por clase, (b)
// `getComputedStyle` sobre el CSS de producción inyectado para colores simples (background-color SÍ
// se resuelve por jsdom incluso a través de `var()`; `box-shadow` NO, así que el halo se verifica por
// texto crudo de `components.css`, igual que hace `accent-vivid.test.ts`).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Stepper } from '../../src/ui/Stepper';

const TOKENS_CSS = readFileSync(resolve(process.cwd(), 'src/ui/tokens.css'), 'utf8');
const COMPONENTS_CSS = readFileSync(resolve(process.cwd(), 'src/ui/components.css'), 'utf8');

// Valores FIJOS del preview (FR-006), independientes de cómo T004 nombre el token subyacente.
const DONE_GREEN = '#178a4e'; // closed-fg claro
const CURRENT_PURPLE = '#7c3aed'; // pending_review claro
const ACCENT_VIVID = '#dc5a24';

let styleEl: HTMLStyleElement;
beforeEach(() => {
  styleEl = document.createElement('style');
  styleEl.textContent = TOKENS_CSS + '\n' + COMPONENTS_CSS;
  document.head.appendChild(styleEl);
});
afterEach(() => {
  styleEl.remove();
  document.documentElement.removeAttribute('data-theme');
});

function hexToRgb(hex: string): string {
  const n = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16));
  return `rgb(${r}, ${g}, ${b})`;
}

describe('FE-8 · Stepper — colores fijos por estado del paso (FR-002/FR-006)', () => {
  it('done = verde fijo (token closed), no --color-success genérico sin más', () => {
    const { container } = render(<Stepper status="pending_review" />);
    const doneDot = container.querySelector('.stepper__step--done .stepper__dot');
    expect(doneDot).not.toBeNull();
    expect(getComputedStyle(doneDot as Element).backgroundColor).toBe(hexToRgb(DONE_GREEN));
  });

  it('current = morado pending_review, NO el acento vivo', () => {
    const { container } = render(<Stepper status="pending_review" />);
    const currentDot = container.querySelector('.stepper__step--current .stepper__dot');
    expect(currentDot).not.toBeNull();
    const bg = getComputedStyle(currentDot as Element).backgroundColor;
    expect(bg).toBe(hexToRgb(CURRENT_PURPLE));
    expect(bg).not.toBe(hexToRgb(ACCENT_VIVID));
  });

  it('pending/futuro = superficie-2 + borde (sin color de estado)', () => {
    const { container } = render(<Stepper status="assigned" />);
    const upcomingDot = container.querySelector('.stepper__step--upcoming .stepper__dot');
    expect(upcomingDot).not.toBeNull();
    expect(getComputedStyle(upcomingDot as Element).backgroundColor).toBe(hexToRgb('#edf0f3'));
  });

  it('el CSS del paso actual ya NO consume --color-accent-vivid (sustituido, FR-006)', () => {
    const rule = COMPONENTS_CSS.match(/\.stepper__step--current \.stepper__dot\s*\{[^}]*\}/)?.[0] ?? '';
    expect(rule).not.toContain('var(--color-accent-vivid)');
  });

  it('el paso actual tiene el halo — box-shadow 0 0 0 4px con --status-pending_review-bg (FR-006)', () => {
    const rule = COMPONENTS_CSS.match(/\.stepper__step--current \.stepper__dot\s*\{[^}]*\}/)?.[0] ?? '';
    expect(rule).toMatch(/box-shadow:\s*0\s*0\s*0\s*4px\s*var\(--status-pending_review-bg\)/);
  });
});
