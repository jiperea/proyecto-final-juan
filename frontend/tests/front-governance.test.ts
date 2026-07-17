// FE-6 (020) · FR-010/SC-006 (sincronía doc↔config) + FR-005a/SC-002 (cupo/formato de eslint-disable).
// Verificación determinista de gobernanza: cada regla `enforced` del documento existe como error en la
// config, y el nº de eslint-disable de la feature respeta el cupo ≤3 con comentario justificativo.
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
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

// 025 (T003) · Guardarraíl (Red), activo durante todo el desarrollo de la feature: 025 es SOLO frontend
// (presentación) — no toca backend/contrato/RBAC/seed (FR-012); el visor solo usa tokens (FR-010/SC-005);
// y el invariante de remount (`key={orderId}`) del que depende FR-014 queda protegido frente a un refactor
// futuro que lo quite.
describe('025 · guardarraíl del visor de evidencia (FR-010/FR-012/FR-014)', () => {
  it('no toca backend/, contracts/, RBAC ni seed frente a develop (FR-012)', () => {
    // Repo root = un nivel por encima de `frontend/` (cwd de esta suite).
    let files: string[];
    try {
      const base = execSync('git merge-base develop HEAD', { cwd: '..' }).toString().trim();
      files = execSync(`git diff --name-only ${base} HEAD`, { cwd: '..' })
        .toString()
        .trim()
        .split('\n')
        .filter(Boolean);
    } catch (e) {
      throw new Error(`no se pudo calcular el diff frente a develop: ${String(e)}`);
    }
    const forbidden = files.filter(
      (f) =>
        f.startsWith('backend/') ||
        f.startsWith('contracts/') ||
        f.toLowerCase().includes('rbac') ||
        f.toLowerCase().includes('seed'),
    );
    expect(forbidden, `archivos fuera de alcance de 025 (solo frontend): ${forbidden.join(', ')}`).toEqual([]);
  });

  it('`OrdersView.tsx` mantiene `key={orderId}` en `<OrderDetailView>` (invariante del que depende FR-014)', () => {
    const src = readFileSync(join(root, 'src', 'features', 'orders', 'OrdersView.tsx'), 'utf8');
    expect(src).toMatch(/<OrderDetailView\s+key=\{orderId\}/);
  });

  it('0 estilos sueltos (hex/px/tipografía) en los componentes del visor (FR-010/SC-005)', () => {
    const viewerPath = join(root, 'src', 'features', 'orders', 'EvidenceViewer.tsx');
    expect(existsSync(viewerPath), 'EvidenceViewer.tsx aún no existe (fase Red)').toBe(true);
    const viewerSrc = readFileSync(viewerPath, 'utf8');
    expect(viewerSrc).not.toMatch(/#[0-9a-fA-F]{3,8}\b/); // hex de color suelto
    expect(viewerSrc).not.toMatch(/[^-\w]\d+px\b/); // px suelto (fuera de nombres de variable/clase)
    expect(viewerSrc).not.toMatch(/font-family\s*:/i);

    const css = readFileSync(join(root, 'src', 'ui', 'components.css'), 'utf8');
    const viewerBlocks = css.match(/\.evidence-viewer[\w-]*[^{}]*\{[^}]*\}/g) ?? [];
    expect(
      viewerBlocks.length,
      'no se encontraron reglas .evidence-viewer* en components.css (fase Red)',
    ).toBeGreaterThan(0);
    for (const block of viewerBlocks) {
      expect(block, `hex suelto en: ${block}`).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    }
  });
});
