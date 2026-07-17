// 026 (T012 · FR-002/FR-008/SC-004) — Fase RED/guardarraíl. Gobernanza: 0 cambios en `contracts/`, dominio y
// RBAC/handlers de evidencia (`getOrderEvidence`/`uploadOrderEvidence` NO cambian su código, FR-008); la
// imagen embebida es una CONSTANTE en el propio seed (sin ficheros de asset nuevos en el repo, FR-002); el
// Makefile/comando de seed NUNCA pasa `EVIDENCE_ENC_KEY` por argv (se hereda por `env_file`).
//
// `EMBEDDED_EVIDENCE_IMAGE` AÚN NO EXISTE en `backend/prisma/seed.ts` — la crea `dev-backend` (T002/T007)
// como una constante `Buffer` (JPEG válido, ≤2048 bytes) embebida en el propio fichero. Hasta entonces el
// import falla y el fichero es rojo por la razón correcta (la imagen embebida no existe todavía).
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EMBEDDED_EVIDENCE_IMAGE } from '../../prisma/seed';

function git(cmd: string): string {
  return execSync(cmd, { cwd: '..', stdio: ['pipe', 'pipe', 'pipe'] }).toString().trim();
}

function refExists(ref: string): boolean {
  try {
    git(`git rev-parse --verify --quiet ${ref}^{commit}`);
    return true;
  } catch {
    return false;
  }
}

// Resolución PORTABLE de la rama base (local y CI), mismo patrón que frontend/tests/front-governance.test.ts
// (025, guardarraíl «no toca backend/contratos/RBAC»).
function resolveBaseRef(): string {
  const candidates = [
    process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : '',
    'origin/develop',
    'develop',
  ].filter(Boolean);
  let baseRef = candidates.find(refExists);
  if (!baseRef) {
    try {
      git('git fetch --no-tags --depth=200 origin develop:refs/remotes/origin/develop');
      if (refExists('origin/develop')) baseRef = 'origin/develop';
    } catch {
      /* sin red / sin origin */
    }
  }
  return baseRef ?? 'develop';
}

function diffNameOnly(): string[] {
  const ref = resolveBaseRef();
  let base: string;
  try {
    base = git(`git merge-base ${ref} HEAD`);
  } catch {
    try {
      git('git fetch --no-tags --unshallow origin');
    } catch {
      try {
        git('git fetch --no-tags --deepen=2000 origin');
      } catch {
        /* ya completo o sin red */
      }
    }
    git('git fetch --no-tags origin develop:refs/remotes/origin/develop');
    base = git(`git merge-base ${ref} HEAD`);
  }
  return git(`git diff --name-only ${base} HEAD`).split('\n').filter(Boolean);
}

describe('026 · imagen embebida como constante (FR-002)', () => {
  it('EMBEDDED_EVIDENCE_IMAGE es un Buffer JPEG válido (magic bytes) de ≤2048 bytes', () => {
    expect(Buffer.isBuffer(EMBEDDED_EVIDENCE_IMAGE)).toBe(true);
    expect(EMBEDDED_EVIDENCE_IMAGE.length).toBeLessThanOrEqual(2048);
    expect(EMBEDDED_EVIDENCE_IMAGE[0]).toBe(0xff);
    expect(EMBEDDED_EVIDENCE_IMAGE[1]).toBe(0xd8); // SOI JPEG
  });

  it('el seed NO lee un asset de fichero de imagen (constante embebida, sin fs.readFileSync de imagen)', () => {
    const src = readFileSync('prisma/seed.ts', 'utf8');
    expect(src).not.toMatch(/readFileSync\([^)]*\.(jpg|jpeg|png|webp|heic)/i);
    expect(src).not.toMatch(/from ['"][^'"]*\.(jpg|jpeg|png|webp|heic)['"]/i);
  });
});

describe('026 · 0 cambios en contratos/dominio/RBAC/handlers de evidencia (FR-008/SC-004)', () => {
  it('0 ficheros modificados en contracts/ frente a develop', () => {
    const files = diffNameOnly().filter((f) => f.startsWith('contracts/'));
    expect(files, `contracts/ modificado: ${files.join(', ')}`).toEqual([]);
  });

  it('0 ficheros modificados en src/domain/ frente a develop', () => {
    const files = diffNameOnly().filter((f) => f.startsWith('backend/src/domain/'));
    expect(files, `dominio modificado: ${files.join(', ')}`).toEqual([]);
  });

  it('los handlers getOrderEvidence/uploadOrderEvidence NO cambian frente a develop', () => {
    const files = diffNameOnly().filter(
      (f) =>
        f === 'backend/src/handlers/orders/get-evidence.ts' ||
        f === 'backend/src/handlers/orders/upload-evidence.ts',
    );
    expect(files, `handler de evidencia modificado: ${files.join(', ')}`).toEqual([]);
  });
});

describe('026 · la clave NUNCA se pasa por argv (FR-006/rbac S-002)', () => {
  it('el Makefile no pasa EVIDENCE_ENC_KEY por -e/argv en ningún target', () => {
    const makefile = readFileSync('../Makefile', 'utf8');
    expect(makefile).not.toMatch(/-e\s+EVIDENCE_ENC_KEY=/);
    expect(makefile).not.toMatch(/EVIDENCE_ENC_KEY=\S+\s/); // asignación inline por argv
  });
});
