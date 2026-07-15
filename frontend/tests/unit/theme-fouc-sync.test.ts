import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { THEME_CHOICES, THEME_STORAGE_KEY } from '../../src/ui/theme';

// FR-013/H-006 · anti-drift: el script inline anti-FOUC de index.html duplica a mano la clave de tema
// (no puede importar theme.ts antes del bundle). Este test FALLA si divergen.
describe('anti-FOUC · sincronía index.html ↔ theme.ts', () => {
  const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');

  it('index.html usa exactamente THEME_STORAGE_KEY', () => {
    expect(html).toContain(`'${THEME_STORAGE_KEY}'`);
  });

  it('el script inline aplica data-theme antes de cargar el bundle de React', () => {
    const headScriptIdx = html.indexOf('data-theme');
    const bundleIdx = html.indexOf('src/main.tsx');
    expect(headScriptIdx).toBeGreaterThan(-1);
    expect(headScriptIdx).toBeLessThan(bundleIdx);
  });

  it('el script inline maneja cada valor persistible no-«system» (H-004: sin drift de valores)', () => {
    // 'system' no fija data-theme (gobierna la @media); el resto SÍ deben aparecer como rama en el script.
    for (const choice of THEME_CHOICES.filter((c) => c !== 'system')) {
      expect(html, `el script inline no contempla el valor '${choice}'`).toContain(`'${choice}'`);
    }
  });
});
