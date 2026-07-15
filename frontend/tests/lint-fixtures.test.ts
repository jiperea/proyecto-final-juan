// FE-6 (020) · FR-007/SC-003 — enforcement demostrado, no solo declarado.
// Por CADA regla `enforced` nueva del baseline (g no-default-exports · b exhaustive-deps · j límite de capas),
// un snippet "malo" de tests/lint-fixtures/ DEBE producir error al lintarlo con la config real del front.
// Los snippets se lintan de forma programática (API de ESLint) con un filePath virtual bajo src/features/,
// para que apliquen los mismos overrides que a una vista real. El directorio está excluido del run principal.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';

// Forzar config legacy (.eslintrc.cjs), no la flat-config raíz del monorepo.
process.env.ESLINT_USE_FLAT_CONFIG = 'false';

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), 'lint-fixtures');
// filePath virtual: una "vista" (no capa de datos), para que apliquen los overrides de src/** no-ui.
const asView = join(process.cwd(), 'src', 'features', 'orders', '__lint_probe__.tsx');

const CASES = [
  { file: 'bad-default-export.tsx', ruleId: 'no-restricted-syntax', regla: 'g · sin default exports' },
  { file: 'bad-exhaustive-deps.tsx', ruleId: 'react-hooks/exhaustive-deps', regla: 'b · exhaustive-deps' },
  { file: 'bad-boundary.tsx', ruleId: 'no-restricted-imports', regla: 'j · límite de capas' },
];

describe('FE-6 · enforcement de lint (fixtures negativos)', () => {
  let eslint: ESLint;
  beforeAll(() => {
    eslint = new ESLint({ ignore: false });
  });

  for (const c of CASES) {
    it(`detecta violación de regla ${c.regla} (${c.ruleId})`, async () => {
      const code = readFileSync(join(fixturesDir, c.file), 'utf8');
      const results = await eslint.lintText(code, { filePath: asView });
      const result = results[0];
      expect(result).toBeDefined();
      const ruleIds = result!.messages.map((m) => m.ruleId);
      expect(result!.errorCount).toBeGreaterThan(0);
      expect(ruleIds).toContain(c.ruleId);
    });
  }
});
