import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Contraste WCAG 2.1 AA verificado POR TOKEN (SC-005), independiente del render de axe.
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

// Lee los valores REALES de tokens.css (fuente de verdad, F-005): si un token cambia, el test lo usa.
const TOKENS = readFileSync('src/ui/tokens.css', 'utf8');
function token(name: string): string {
  const m = TOKENS.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{3,8})`));
  if (!m) throw new Error(`token --${name} no encontrado en tokens.css`);
  return m[1]!;
}

const BG = token('color-bg');
const SURFACE = token('color-surface');

const WHITE = token('color-text-on-accent');

// Pares texto/fondo (≥4.5:1) — leídos de tokens.css (§2.1-2.2).
const textPairs: Array<[string, string, string]> = [
  ['text/bg', token('color-text'), BG],
  ['text-muted/bg', token('color-text-muted'), BG],
  ['white/primary', WHITE, token('color-primary')],
  ['white/danger', WHITE, token('color-danger')],
  ['white/success', WHITE, token('color-success')],
  ['warning-fg/bg', token('color-warning-fg'), BG],
];

// Badges de estado (≥4.5:1) — §2.3.
const badgePairs: Array<[string, string, string]> = [
  ['assigned', token('status-assigned-fg'), token('status-assigned-bg')],
  ['in_progress', token('status-in_progress-fg'), token('status-in_progress-bg')],
  ['pending_review', token('status-pending_review-fg'), token('status-pending_review-bg')],
  ['closed', token('status-closed-fg'), token('status-closed-bg')],
  ['draft', token('status-draft-fg'), token('status-draft-bg')],
];

describe('SC-005 · contraste por token (WCAG 2.1 AA)', () => {
  it.each([...textPairs, ...badgePairs])('%s ≥ 4.5:1', (_name, fg, bg) => {
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('focus-ring ≥ 3:1 sobre bg y surface (componentes/estados)', () => {
    const ring = token('color-focus-ring');
    expect(ratio(ring, BG)).toBeGreaterThanOrEqual(3);
    expect(ratio(ring, SURFACE)).toBeGreaterThanOrEqual(3);
  });

  it('FR-019: token de objetivo táctil = 44px (axe target-size se verifica en e2e T044)', () => {
    expect(TOKENS).toMatch(/--touch-target:\s*44px/);
  });
});
