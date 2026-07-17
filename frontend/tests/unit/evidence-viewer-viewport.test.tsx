// 025 (T016) · FR-011: sin scroll horizontal a 360px/1280px, imagen contenida (max-width:100%) y
// controles con área táctil >=44x44px.
//
// jsdom no calcula layout real (cajas/flex/grid) — el criterio operable `scrollWidth <= clientWidth` a un
// ancho de viewport concreto requiere un motor de layout real (mismo límite ya documentado en
// `layout-by-viewport.test.tsx` para FR-011a de FE-8/022, resuelto allí con verificación manual/Playwright
// MCP). Aquí se cubre lo que SÍ es determinista en jsdom: las reglas CSS declaradas (estático), que son la
// causa raíz verificable por herramienta de la ausencia de scroll horizontal y del tamaño táctil.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('025 · sin scroll horizontal + controles >=44px (FR-011)', () => {
  const css = readFileSync('src/ui/components.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

  it('la imagen del visor está contenida (max-width:100%, sin ancho fijo mayor)', () => {
    const imgBlock = css.match(/\.evidence-viewer__image[^{}]*\{([^}]*)\}/);
    expect(imgBlock, 'no se encontró la regla .evidence-viewer__image en components.css').not.toBeNull();
    expect(imgBlock![1]).toMatch(/max-width:\s*100%/);
  });

  it('los controles del visor (cerrar/anterior/siguiente) usan el token de área táctil (>=44x44px)', () => {
    const controlBlock = css.match(/\.evidence-viewer__control[^{}]*\{([^}]*)\}/);
    expect(controlBlock, 'no se encontró la regla .evidence-viewer__control en components.css').not.toBeNull();
    expect(controlBlock![1]).toMatch(/min-height:\s*var\(--touch-target\)/);
    expect(controlBlock![1]).toMatch(/min-width:\s*var\(--touch-target\)/);
  });

  it('el token --touch-target es >=44px (referencia usada por los controles del visor)', () => {
    const tokens = readFileSync('src/ui/tokens.css', 'utf8');
    const m = tokens.match(/--touch-target:\s*(\d+)px/);
    expect(m, 'no se encontró el token --touch-target').not.toBeNull();
    expect(Number(m![1])).toBeGreaterThanOrEqual(44);
  });
});
