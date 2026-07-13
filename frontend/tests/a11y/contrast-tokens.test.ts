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

const BG = '#ffffff';
const SURFACE = '#f8fafc';

// Pares texto/fondo (≥4.5:1) — mapea docs/design-system.md §2.1-2.2.
const textPairs: Array<[string, string, string]> = [
  ['text/bg', '#1e293b', BG],
  ['text-muted/bg', '#475569', BG],
  ['white/primary', '#ffffff', '#1d4ed8'],
  ['white/danger', '#ffffff', '#b91c1c'],
  ['white/success', '#ffffff', '#15803d'],
  ['warning-fg/bg', '#92400e', BG],
];

// Badges de estado (≥4.5:1) — §2.3.
const badgePairs: Array<[string, string, string]> = [
  ['assigned', '#1e40af', '#dbeafe'],
  ['in_progress', '#854d0e', '#fef9c3'],
  ['pending_review', '#6b21a8', '#f3e8ff'],
  ['closed', '#166534', '#dcfce7'],
  ['draft', '#334155', '#f1f5f9'],
];

describe('SC-005 · contraste por token (WCAG 2.1 AA)', () => {
  it.each([...textPairs, ...badgePairs])('%s ≥ 4.5:1', (_name, fg, bg) => {
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('focus-ring ≥ 3:1 sobre bg y surface (componentes/estados)', () => {
    expect(ratio('#1d4ed8', BG)).toBeGreaterThanOrEqual(3);
    expect(ratio('#1d4ed8', SURFACE)).toBeGreaterThanOrEqual(3);
  });

  it('FR-019: token de objetivo táctil = 44px (axe target-size se verifica en e2e T044)', () => {
    const css = readFileSync('src/ui/tokens.css', 'utf8');
    expect(css).toMatch(/--touch-target:\s*44px/);
  });
});
