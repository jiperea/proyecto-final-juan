// FE-6 (020) · FR-010/SC-006 (sincronía doc↔config) + FR-005a/SC-002 (cupo/formato de eslint-disable).
// Verificación determinista de gobernanza: cada regla `enforced` del documento existe como error en la
// config, y el nº de eslint-disable de la feature respeta el cupo ≤3 con comentario justificativo.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd(); // frontend/
const eslintrc = readFileSync(join(root, '.eslintrc.cjs'), 'utf8');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) {
      if (entry !== 'generated') out.push(...walk(p));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(p);
    }
  }
  return out;
}

describe('FE-6 · gobernanza doc↔config (FR-010/SC-006)', () => {
  it('(g) sin default exports está enforced en .eslintrc.cjs', () => {
    expect(eslintrc).toContain('ExportDefaultDeclaration');
  });
  it('(b) react-hooks/exhaustive-deps está a nivel error', () => {
    expect(eslintrc).toMatch(/'react-hooks\/exhaustive-deps':\s*'error'/);
  });
  it('(j) no-restricted-imports de apiFetch está enforced', () => {
    expect(eslintrc).toContain('no-restricted-imports');
    expect(eslintrc).toContain('apiFetch');
  });
});

describe('FE-6 · cupo y formato de eslint-disable (FR-005a/SC-002)', () => {
  // El cupo/formato aplica a los disables de reglas FE-6 (los preexistentes de otras reglas quedan fuera).
  const FE6_RULES = ['no-restricted-syntax', 'react-hooks/exhaustive-deps', 'no-restricted-imports'];
  const disables = walk(join(root, 'src')).flatMap((f) =>
    readFileSync(f, 'utf8')
      .split('\n')
      .filter((l) => l.includes('eslint-disable') && FE6_RULES.some((r) => l.includes(r)))
      .map((l) => l.trim()),
  );

  it('el nº de eslint-disable de reglas FE-6 en src/ es ≤3', () => {
    expect(disables.length).toBeLessThanOrEqual(3);
  });

  it('cada eslint-disable lleva comentario `-- <razón>` de ≥15 caracteres', () => {
    for (const d of disables) {
      const m = d.match(/--\s*(.+)$/);
      expect(m, `disable sin '-- <razón>': ${d}`).not.toBeNull();
      expect((m?.[1] ?? '').trim().length).toBeGreaterThanOrEqual(15);
    }
  });
});
