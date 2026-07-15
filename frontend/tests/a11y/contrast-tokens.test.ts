import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// SC-003a (FE-5) · Contraste WCAG 2.1 AA por token, en AMBOS temas (claro y oscuro), independiente del
// render (vitest corre con css:false). Recorre la LISTA CERRADA de pares del spec §Pares de contraste.
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

// Quita comentarios para no confundir el selector real con el ejemplo de la cabecera documental.
const CSS = readFileSync('src/ui/tokens.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

// Extrae el bloque de un selector (primer `{ … }` tras el selector), tolerante a reformateo (espacios,
// comillas simples/dobles del atributo). H-006: no depende del formato exacto de tokens.css.
function block(selectorRe: RegExp): string {
  const m = CSS.match(selectorRe);
  if (!m || m.index === undefined) throw new Error(`selector ${selectorRe} no encontrado`);
  const open = CSS.indexOf('{', m.index);
  const close = CSS.indexOf('}', open);
  return CSS.slice(open, close);
}
const LIGHT = block(/:root\s*\{/); // primer :root (valores claros)
const DARK = block(/:root\[data-theme=['"]dark['"]\]\s*\{/);

// FE-7 (021): var-aware — resuelve `var(--otro)` siguiendo la referencia (p. ej. --color-focus-ring →
// var(--color-accent-vivid) → #dc5a24), para que el test lea el hex efectivo sin duplicarlo.
function token(theme: string, name: string, depth = 0): string {
  if (depth > 5) throw new Error(`ciclo de var en --${name}`);
  const src = theme === 'dark' ? DARK : LIGHT;
  const m = src.match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (!m) throw new Error(`token --${name} no encontrado en tema ${theme}`);
  const val = m[1]!.trim();
  if (/^#[0-9a-fA-F]{3,8}$/.test(val)) return val;
  const ref = val.match(/^var\(--([\w-]+)\)$/);
  if (ref) return token(theme, ref[1]!, depth + 1);
  throw new Error(`valor no resoluble para --${name}: ${val}`);
}

// Lista cerrada de pares (spec §Pares de contraste). [nombre, fg, bg, umbral].
function pairs(theme: string): Array<[string, string, string, number]> {
  const t = (n: string) => token(theme, n);
  return [
    ['text/bg', t('color-text'), t('color-bg'), 4.5],
    ['text/surface', t('color-text'), t('color-surface'), 4.5],
    ['text-muted/bg', t('color-text-muted'), t('color-bg'), 4.5],
    ['text-muted/surface', t('color-text-muted'), t('color-surface'), 4.5],
    ['on-accent/primary', t('color-text-on-accent'), t('color-primary'), 4.5],
    ['on-accent/primary-hover', t('color-text-on-accent'), t('color-primary-hover'), 4.5],
    ['on-accent/danger', t('color-text-on-accent'), t('color-danger'), 4.5],
    ['on-accent/success', t('color-text-on-accent'), t('color-success'), 4.5],
    ['warning-fg/surface', t('color-warning-fg'), t('color-surface'), 4.5],
    ['warning-fg/bg', t('color-warning-fg'), t('color-bg'), 4.5],
    ['danger-text/bg', t('color-danger'), t('color-bg'), 4.5],
    ['danger-text/surface', t('color-danger'), t('color-surface'), 4.5],
    ['focus-ring/bg', t('color-focus-ring'), t('color-bg'), 3],
    ['focus-ring/surface', t('color-focus-ring'), t('color-surface'), 3],
    // FE-7 (021): acento VIVO vs cada fondo adyacente (componente ≥3:1), en ambos temas.
    ['accent-vivid/bg', t('color-accent-vivid'), t('color-bg'), 3],
    ['accent-vivid/surface', t('color-accent-vivid'), t('color-surface'), 3],
    ['accent-vivid/surface-2', t('color-accent-vivid'), t('color-surface-2'), 3],
    ['status-assigned', t('status-assigned-fg'), t('status-assigned-bg'), 4.5],
    ['status-in_progress', t('status-in_progress-fg'), t('status-in_progress-bg'), 4.5],
    ['status-pending_review', t('status-pending_review-fg'), t('status-pending_review-bg'), 4.5],
    ['status-closed', t('status-closed-fg'), t('status-closed-bg'), 4.5],
    ['status-draft', t('status-draft-fg'), t('status-draft-bg'), 4.5],
    // Stepper: punto del paso actual (vivo, FE-7) / completado vs fondo (componente ≥3:1).
    ['stepper-current/bg', t('color-accent-vivid'), t('color-bg'), 3],
    ['stepper-done/bg', t('color-success'), t('color-bg'), 3],
  ];
}

describe.each(['light', 'dark'])('SC-003a · contraste por token — tema %s', (theme) => {
  it.each(pairs(theme))('%s ≥ umbral', (_name, fg, bg, threshold) => {
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(threshold);
  });
});

describe('token de objetivo táctil', () => {
  it('FR-019: --touch-target = 44px', () => {
    expect(CSS).toMatch(/--touch-target:\s*44px/);
  });
});
