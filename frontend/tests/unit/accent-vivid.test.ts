// FE-7 (021) / FE-8 (022) · doble token de acento + fidelidad al preview. Verifica de forma
// determinista (sin render):
// (a) --color-accent-vivid existe con #dc5a24 (claro) / #ff7a45 (oscuro) en los 4 bloques de tema;
// (b) se consume por var() en los sitios AUTORIZADOS (FE-8 sustituye el punto del Stepper por el morado
//     fijo `pending_review`, FR-006 — el vivo YA NO se usa ahí; en su lugar pasa a fondo del botón
//     primario, FR-010, y a la marca «F», FR-002): foco, botón primario, marca, borde/barra de selección;
// (c) anti-hex: los valores del vivo no aparecen como literal en CSS de producción fuera de tokens.css;
// (d) check inverso: --color-accent-vivid solo se usa en los ficheros/sitios autorizados;
// (e) outline-offset ≥2px en los consumidores del anillo de foco.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const tokens = readFileSync('src/ui/tokens.css', 'utf8');
const components = readFileSync('src/ui/components.css', 'utf8');
const orders = readFileSync('src/features/orders/orders.css', 'utf8');

describe('FE-7 · token --color-accent-vivid en los 4 bloques (FR-001)', () => {
  it('4 declaraciones del token (uno por bloque de tema)', () => {
    const decls = tokens.match(/--color-accent-vivid:\s*#[0-9a-fA-F]{6}/g) ?? [];
    expect(decls.length).toBe(4);
  });
  it('claro = #dc5a24 (×2: :root y [data-theme=light])', () => {
    expect((tokens.match(/--color-accent-vivid:\s*#dc5a24/gi) ?? []).length).toBe(2);
  });
  it('oscuro = #ff7a45 (×2: @media dark y [data-theme=dark])', () => {
    expect((tokens.match(/--color-accent-vivid:\s*#ff7a45/gi) ?? []).length).toBe(2);
  });
});

describe('FE-7/FE-8 · consumo por var() en los sitios autorizados (FR-002/FR-010)', () => {
  it('anillo de foco: --color-focus-ring apunta a var(--color-accent-vivid) en los 4 bloques', () => {
    expect((tokens.match(/--color-focus-ring:\s*var\(--color-accent-vivid\)/g) ?? []).length).toBe(4);
  });

  it('FE-8 (022): el punto del Stepper YA NO usa el acento vivo (sustituido por el morado fijo, FR-006)', () => {
    const rule = components.match(/\.stepper__step--current \.stepper__dot\s*\{[^}]*\}/)?.[0] ?? '';
    expect(rule).not.toContain('var(--color-accent-vivid)');
    expect(rule).toContain('var(--status-pending_review-fg)');
  });

  it('FE-8 (022): botón primario usa el acento vivo de fondo (FR-010, excepción AA acotada)', () => {
    const rule = components.match(/\.btn--primary\s*\{[^}]*\}/)?.[0] ?? '';
    expect(rule).toContain('background: var(--color-accent-vivid)');
  });

  it('FE-8 (022): la marca «F» usa el acento vivo de fondo (FR-002)', () => {
    const rule = components.match(/\.brand-mark\s*\{[^}]*\}/)?.[0] ?? '';
    expect(rule).toContain('background: var(--color-accent-vivid)');
  });

  it('barra/selección de fila usa var(--color-accent-vivid) (borde en tarjeta, barra inset en fila de oficina)', () => {
    const borderRule = orders.match(/\.order-item\[aria-current="true"\]\s*\{[^}]*\}/)?.[0] ?? '';
    expect(borderRule).toContain('border-color: var(--color-accent-vivid)');
    expect(borderRule).not.toContain('--color-primary');
    const rowRule = orders.match(/\.order-item--row\[aria-current="true"\]\s*\{[^}]*\}/)?.[0] ?? '';
    expect(rowRule).toContain('var(--color-accent-vivid)');
  });
});

describe('FE-7 · anti-hex y check inverso (FR-003a)', () => {
  it('(c) el hex del vivo NO aparece literal en CSS de producción fuera de tokens.css', () => {
    for (const [name, css] of [['components.css', components], ['orders.css', orders]] as const) {
      expect(/#dc5a24/i.test(css), `#dc5a24 literal en ${name}`).toBe(false);
      expect(/#ff7a45/i.test(css), `#ff7a45 literal en ${name}`).toBe(false);
    }
  });
  it('(d) var(--color-accent-vivid) solo se usa en los sitios autorizados', () => {
    // components.css: botón primario + marca «F» (FE-8; el Stepper ya no lo usa).
    expect((components.match(/var\(--color-accent-vivid\)/g) ?? []).length).toBe(2);
    // orders.css: borde de selección (tarjeta, apilado) + barra inset (fila de oficina, FE-8/T016).
    expect((orders.match(/var\(--color-accent-vivid\)/g) ?? []).length).toBe(2);
  });
});

describe('FE-7 · outline-offset ≥2px en los consumidores del foco (FR-002/F-104)', () => {
  it('cada regla :focus-visible que usa --color-focus-ring tiene outline-offset ≥2px', () => {
    const css = components + '\n' + orders;
    const rules = css.split('}').filter((r) => r.includes('var(--color-focus-ring)'));
    expect(rules.length).toBeGreaterThanOrEqual(4); // .btn, .field__input, .order-item, .theme-toggle__option…
    for (const r of rules) {
      const m = r.match(/outline-offset:\s*(\d+)px/);
      expect(m, `regla con focus-ring sin outline-offset: ${r.trim().slice(0, 60)}`).not.toBeNull();
      expect(Number(m![1])).toBeGreaterThanOrEqual(2);
    }
  });
});
