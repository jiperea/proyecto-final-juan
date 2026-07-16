// FE-8 (022) · T003 [Red] · US1 · FR-001/002/003/004, SC-002/SC-002a.
//
// Fidelidad de tokens al preview de exploración, verificada por `getComputedStyle` sobre
// `document.documentElement` (no por regex sobre el fichero, a diferencia de los tests legacy de
// contraste): inyecta el CSS REAL de `src/ui/tokens.css` en un `<style>` de jsdom y lee los valores
// computados en tema claro (sin atributo) y oscuro (`data-theme="dark"`), como hace el mecanismo de
// tema real del proyecto (`src/ui/theme.ts` fija `data-theme` en `document.documentElement`).
//
// Debe FALLAR ahora: los valores actuales de `tokens.css` (herencia FE-5/017) no son aún los del
// preview (fondo blanco/gris azulado, sin teal en in_progress, sin `--status-pending_review-bg`
// #EDE6FC/#2A2140, radios/sombra distintos). Lo pone en verde T004 (actualizar `tokens.css`).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const TOKENS_CSS = readFileSync(resolve(process.cwd(), 'src/ui/tokens.css'), 'utf8');

let styleEl: HTMLStyleElement;

beforeEach(() => {
  styleEl = document.createElement('style');
  styleEl.textContent = TOKENS_CSS;
  document.head.appendChild(styleEl);
});

afterEach(() => {
  styleEl.remove();
  document.documentElement.removeAttribute('data-theme');
});

function setTheme(theme: 'light' | 'dark'): void {
  document.documentElement.setAttribute('data-theme', theme);
}

function cssVar(name: string): string {
  // Llamada fresca: getComputedStyle debe pedirse DESPUÉS de fijar data-theme (jsdom no recalcula un
  // CSSStyleDeclaration ya obtenido tras mutar el atributo).
  return getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim().toLowerCase();
}

// Utilidad WCAG (mismo cálculo que `tests/a11y/contrast-tokens.test.ts`), aplicada aquí sobre valores
// LEÍDOS por getComputedStyle (no por regex), para el contraste no-textual del acento vivo (SC-002a).
function luminance(hex: string): number {
  const n = hex.replace('#', '');
  const rgb = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
  const lin = rgb.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * lin[0]! + 0.7152 * lin[1]! + 0.0722 * lin[2]!;
}
function ratio(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1! + 0.05) / (l2! + 0.05);
}

describe('FE-8 · tokens neutros del preview (FR-001) — getComputedStyle', () => {
  it('claro: fondo/superficie/superficie-2/borde', () => {
    setTheme('light');
    expect(cssVar('color-bg')).toBe('#f4f6f8');
    expect(cssVar('color-surface')).toBe('#ffffff');
    expect(cssVar('color-surface-2')).toBe('#edf0f3');
    expect(cssVar('color-border')).toBe('#e1e6eb');
  });

  it('oscuro: fondo/superficie/superficie-2/borde', () => {
    setTheme('dark');
    expect(cssVar('color-bg')).toBe('#0e141a');
    expect(cssVar('color-surface')).toBe('#18212b');
    expect(cssVar('color-surface-2')).toBe('#212c38');
    expect(cssVar('color-border')).toBe('#2a3744');
  });
});

describe('FE-8 · acento vivo del preview (FR-002)', () => {
  it('claro = #dc5a24 / oscuro = #ff7a45', () => {
    setTheme('light');
    expect(cssVar('color-accent-vivid')).toBe('#dc5a24');
    setTheme('dark');
    expect(cssVar('color-accent-vivid')).toBe('#ff7a45');
  });
});

// 5 chips de estado (fg/bg), en ambos temas — FR-003. Incluye in_progress en TEAL (no el
// amarillo/ámbar heredado de FE-5/017) y el pending_review-bg del que dependen el halo del stepper
// (FR-006) y la tarjeta IA (FR-016).
//
// CORRECCIÓN DE ACCESIBILIDAD (no transcripción): el `fg` literal del artifact de `draft`/`assigned`/
// `in_progress`/`closed` en CLARO NO alcanza AA de texto (4.5:1) contra su propio `bg` — comprobado con
// `tests/a11y/contrast-tokens.test.ts` (SC-003a), que NO se relaja. Se oscurece el `fg` (misma familia de
// matiz) lo mínimo necesario para cumplir AA; el `bg` y TODO el tema oscuro quedan literales al artifact
// (ver comentario en `src/ui/tokens.css`). `pending_review` no necesita ajuste (4.70:1, cumple ya).
const STATUS_LIGHT: Array<[string, string, string]> = [
  ['draft', '#475569', '#eaedf1'],
  ['assigned', '#1d4ed8', '#e4ecfd'],
  ['in_progress', '#0a5f77', '#def0f5'],
  ['pending_review', '#7c3aed', '#ede6fc'],
  ['closed', '#116c34', '#ddf1e5'],
];
const STATUS_DARK: Array<[string, string, string]> = [
  ['draft', '#94a3b4', '#26313d'],
  ['assigned', '#6fa0ff', '#1e2a44'],
  ['in_progress', '#4fc2de', '#123039'],
  ['pending_review', '#b896ff', '#2a2140'],
  ['closed', '#4fc98a', '#12321f'],
];

describe('FE-8 · paleta de chips de estado del preview (FR-003)', () => {
  it.each(STATUS_LIGHT)('claro · %s → fg %s / bg %s', (status, fg, bg) => {
    setTheme('light');
    expect(cssVar(`status-${status}-fg`)).toBe(fg);
    expect(cssVar(`status-${status}-bg`)).toBe(bg);
  });

  it.each(STATUS_DARK)('oscuro · %s → fg %s / bg %s', (status, fg, bg) => {
    setTheme('dark');
    expect(cssVar(`status-${status}-fg`)).toBe(fg);
    expect(cssVar(`status-${status}-bg`)).toBe(bg);
  });

  it('--status-pending_review-bg fijado (halo del stepper / tarjeta IA)', () => {
    setTheme('light');
    expect(cssVar('status-pending_review-bg')).toBe('#ede6fc');
    setTheme('dark');
    expect(cssVar('status-pending_review-bg')).toBe('#2a2140');
  });
});

describe('FE-8 · radios y sombra del preview (FR-004)', () => {
  it('--radius-sm = 9px / --radius-md = 14px (ambos temas, son globales)', () => {
    setTheme('light');
    expect(cssVar('radius-sm')).toBe('9px');
    expect(cssVar('radius-md')).toBe('14px');
  });

  it('--shadow-1 está definida con la sombra del preview', () => {
    setTheme('light');
    const shadow = cssVar('shadow-1');
    expect(shadow.length).toBeGreaterThan(0);
    expect(shadow).toContain('16, 24, 32');
    // Sombra de dos capas del preview (0 1px 2px … , 0 8px 24px …) — distinta a la heredada de FE-5.
    expect(shadow).toMatch(/0\s*1px\s*2px\s*rgba\(16,\s*24,\s*32,\s*\.?0?\.05\)/);
    expect(shadow).toMatch(/0\s*8px\s*24px\s*rgba\(16,\s*24,\s*32,\s*\.?0?\.06\)/);
  });
});

describe('FE-8 · contraste NO-textual del acento vivo vs surface (SC-002a / WCAG 1.4.11)', () => {
  it('claro: acento vivo vs --color-surface ≥ 3:1', () => {
    setTheme('light');
    expect(ratio(cssVar('color-accent-vivid'), cssVar('color-surface'))).toBeGreaterThanOrEqual(3);
  });
  it('oscuro: acento vivo vs --color-surface ≥ 3:1', () => {
    setTheme('dark');
    expect(ratio(cssVar('color-accent-vivid'), cssVar('color-surface'))).toBeGreaterThanOrEqual(3);
  });
});
