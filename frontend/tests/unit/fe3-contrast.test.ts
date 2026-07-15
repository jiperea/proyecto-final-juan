import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// SC-003 (G1 A08/F-001) · comprobación DIRIGIDA de contraste sobre los tokens del design system usados en
// los estados nuevos del dispatcher (hint, error, foco). axe en jsdom NO verifica contraste de forma
// fiable; esto lo cubre de forma determinista leyendo tokens.css y calculando el ratio WCAG.
// cwd = frontend/ cuando corre vitest.
const tokens = readFileSync(resolve(process.cwd(), 'src/ui/tokens.css'), 'utf8');

// var-aware (FE-7): resuelve `var(--otro)` siguiendo la referencia (p. ej. --color-focus-ring →
// var(--color-accent-vivid) → #dc5a24). Lee el primer bloque (:root, valores claros).
function tokenHex(name: string, depth = 0): string {
  if (depth > 5) throw new Error(`ciclo de var en ${name}`);
  const m = tokens.match(new RegExp(`${name}\\s*:\\s*([^;]+);`));
  if (!m) throw new Error(`token ${name} no encontrado`);
  const val = m[1]!.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(val)) return val;
  const ref = val.match(/^var\((--[\w-]+)\)$/);
  if (ref) return tokenHex(ref[1]!, depth + 1);
  throw new Error(`valor no resoluble para ${name}: ${val}`);
}

function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = c.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * lin[0]! + 0.7152 * lin[1]! + 0.0722 * lin[2]!;
}
function contrast(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1! + 0.05) / (l2! + 0.05);
}

describe('FE-3 · contraste de tokens en estados del formulario (SC-003)', () => {
  const bg = tokenHex('--color-bg');
  it('texto de ayuda (--color-text-muted) sobre fondo ≥ 4.5:1', () => {
    expect(contrast(tokenHex('--color-text-muted'), bg)).toBeGreaterThanOrEqual(4.5);
  });
  it('texto de error (--color-danger) sobre fondo ≥ 4.5:1', () => {
    expect(contrast(tokenHex('--color-danger'), bg)).toBeGreaterThanOrEqual(4.5);
  });
  it('indicador de foco (--color-focus-ring) sobre fondo ≥ 3:1 (componente UI)', () => {
    expect(contrast(tokenHex('--color-focus-ring'), bg)).toBeGreaterThanOrEqual(3);
  });
});
