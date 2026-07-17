import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// FR-010 · verificación determinista de prefers-reduced-motion (vitest corre con css:false, así que se
// comprueba el texto de tokens.css, no el render): la regla debe existir y neutralizar transition/animation
// sobre el selector universal `*` (aplica a todo componente, no a un selector aislado).
describe('FR-010 · prefers-reduced-motion global', () => {
  const css = readFileSync('src/ui/tokens.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

  it('existe @media (prefers-reduced-motion: reduce) sobre * que neutraliza transición/animación', () => {
    const m = css.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?)\}\s*\}/);
    expect(m, 'falta la @media de reduced-motion').not.toBeNull();
    const blockSrc = m![0];
    expect(blockSrc).toMatch(/\*\s*,/); // selector universal presente
    expect(blockSrc).toMatch(/transition-duration:\s*0\.01ms\s*!important/);
    expect(blockSrc).toMatch(/animation-duration:\s*0\.01ms\s*!important/);
  });
});

// 025 (T015) · FR-010c: la ÚNICA transición animada del visor es su apertura/cierre (clase del overlay);
// el cambio de imagen del carrusel es un swap instantáneo. Verificación estática (CSS puro, sin JS).
describe('025 · prefers-reduced-motion del visor de evidencia (FR-010c)', () => {
  const componentsCss = readFileSync('src/ui/components.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

  it('(a) existe @media (prefers-reduced-motion: reduce) que fija a 0ms la transición del overlay del visor', () => {
    const m = componentsCss.match(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\.evidence-viewer__overlay[\s\S]*?\}\s*\}/,
    );
    expect(m, 'falta la @media de reduced-motion para .evidence-viewer__overlay en components.css').not.toBeNull();
    expect(m![0]).toMatch(/transition-duration:\s*0m?s/);
  });

  it('(b) el selector de la imagen del carrusel no declara transition/animation (swap instantáneo)', () => {
    const imgBlock = componentsCss.match(/\.evidence-viewer__image[^{}]*\{([^}]*)\}/);
    expect(imgBlock, 'no se encontró la regla .evidence-viewer__image en components.css').not.toBeNull();
    expect(imgBlock![1]).not.toMatch(/transition/);
    expect(imgBlock![1]).not.toMatch(/animation/);
  });

  it('(c) EvidenceViewer.tsx no invoca matchMedia (mecanismo CSS puro, sin lectura JS de la preferencia)', () => {
    const path = 'src/features/orders/EvidenceViewer.tsx';
    expect(existsSync(path), 'EvidenceViewer.tsx aún no existe (fase Red)').toBe(true);
    const src = readFileSync(path, 'utf8');
    expect(src).not.toMatch(/matchMedia/);
  });
});
