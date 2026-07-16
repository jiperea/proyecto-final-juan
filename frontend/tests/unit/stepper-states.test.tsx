// FE-8 (022) · T006 [Red] · US2 · FR-002/FR-006.
//
// El Stepper debe pintar cada paso con el color fijo del artifact — done=verde (token `closed`),
// current=morado `pending_review` con halo (`box-shadow: 0 0 0 4px` con `--status-pending_review-bg`),
// pending=`surface-2`+borde — y el paso actual NO debe usar el acento vivo (`--color-accent-vivid`),
// que FE-7/021 dejó en `.stepper__step--current .stepper__dot` y que esta feature SUSTITUYE.
//
// CORRECCIÓN DE MECÁNICA (no de valores/umbrales): esta versión inicial asumía que `getComputedStyle`
// resuelve `var()` en jsdom para propiedades de pintado (`background-color`) — comprobado
// empíricamente que NO es así en esta versión de jsdom/cssstyle (nunca sustituye `var(--x)`, ni para
// `background` ni para `background-color`; solo resuelve el VALOR CRUDO de la propia custom property,
// como ya hace `tokens-preview.test.ts`). Se verifica por texto crudo de `components.css` — el MISMO
// mecanismo que el test ya usaba para `box-shadow` (ver su comentario original) — sin cambiar qué
// colores/tokens se exigen.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Stepper } from '../../src/ui/Stepper';

const COMPONENTS_CSS = readFileSync(resolve(process.cwd(), 'src/ui/components.css'), 'utf8');

function ruleFor(selector: string): string {
  const re = new RegExp(`${selector.replace(/[.[\]]/g, '\\$&')}\\s*\\{[^}]*\\}`);
  return COMPONENTS_CSS.match(re)?.[0] ?? '';
}

describe('FE-8 · Stepper — colores fijos por estado del paso (FR-002/FR-006)', () => {
  it('el Stepper renderiza los tres tipos de paso (done/current/upcoming) por clase', () => {
    const { container } = render(<Stepper status="pending_review" />);
    expect(container.querySelector('.stepper__step--done .stepper__dot')).not.toBeNull();
    expect(container.querySelector('.stepper__step--current .stepper__dot')).not.toBeNull();
    const { container: c2 } = render(<Stepper status="assigned" />);
    expect(c2.querySelector('.stepper__step--upcoming .stepper__dot')).not.toBeNull();
  });

  it('done = verde fijo (token closed), no --color-success genérico sin más', () => {
    const rule = ruleFor('.stepper__step--done .stepper__dot');
    expect(rule).toContain('background: var(--status-closed-fg)');
    expect(rule).not.toContain('var(--color-success)');
  });

  it('current = morado pending_review, NO el acento vivo', () => {
    const rule = ruleFor('.stepper__step--current .stepper__dot');
    expect(rule).toContain('var(--status-pending_review-fg)');
    expect(rule).not.toContain('var(--color-accent-vivid)');
  });

  it('pending/futuro = superficie-2 + borde (sin color de estado)', () => {
    const rule = ruleFor('.stepper__step--upcoming .stepper__dot');
    expect(rule).toContain('background: var(--color-surface-2)');
    expect(rule).toContain('border-color: var(--color-border)');
    expect(rule).not.toMatch(/var\(--status-/);
  });

  it('el CSS del paso actual ya NO consume --color-accent-vivid (sustituido, FR-006)', () => {
    const rule = ruleFor('.stepper__step--current .stepper__dot');
    expect(rule).not.toContain('var(--color-accent-vivid)');
  });

  it('el paso actual tiene el halo — box-shadow 0 0 0 4px con --status-pending_review-bg (FR-006)', () => {
    const rule = ruleFor('.stepper__step--current .stepper__dot');
    expect(rule).toMatch(/box-shadow:\s*0\s*0\s*0\s*4px\s*var\(--status-pending_review-bg\)/);
  });
});
