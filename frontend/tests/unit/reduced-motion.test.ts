import { readFileSync } from 'node:fs';
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
