// 026 (T010 · US2 · FR-005/FR-006/FR-011) — Fase RED. `make reset` orquesta, en UNA sola invocación del
// contenedor `backend`: (0) guard dev-local (preflight) → (a) `prisma migrate reset --force --skip-seed` →
// (b) vaciar el CONTENIDO de `EVIDENCE_STORAGE_DIR` (idempotente, mkdir -p) → (c) re-sembrar. Si el guard
// falla, `prisma migrate reset` NUNCA se invoca (orden, no solo exit≠0). `make up`/`make seed` invocan el
// MISMO seed con blob, no `scripts/dcnode.sh` (que apunta a `db-test`/`fieldops_test`).
//
// `runReset` (backend/scripts/reset.ts) y `clearDirContents` (backend/src/infra/storage/clear-dir.ts) AÚN NO
// EXISTEN — los crea `dev-backend` (T011) con el contrato esperado:
//   export interface RunResetDeps {
//     env: NodeJS.ProcessEnv;
//     runCommand: (cmd: string, args: readonly string[]) => Promise<void>;
//     clearDir: (dir: string) => Promise<void>;
//     storageDir: string;
//   }
//   export async function runReset(deps: RunResetDeps): Promise<void>
//   export async function clearDirContents(dir: string): Promise<void>
// Hasta entonces los imports fallan y TODO el fichero es rojo por la razón correcta.
import { mkdtempSync, existsSync, mkdirSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runReset } from '../../scripts/reset';
import { clearDirContents } from '../../src/infra/storage/clear-dir';

const validEnv = (): NodeJS.ProcessEnv => ({
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://fieldops:fieldops@db:5432/fieldops',
  EVIDENCE_ENC_KEY: 'e'.repeat(40),
});

describe('026 · runReset — orquestación guard→migrate reset→limpiar almacén→re-sembrar (FR-011)', () => {
  it('secuencia completa en orden: migrate reset, luego clearDir, luego seed', async () => {
    const calls: string[] = [];
    const runCommand = async (cmd: string, args: readonly string[]): Promise<void> => {
      calls.push(`${cmd} ${args.join(' ')}`);
    };
    const clearDir = async (): Promise<void> => {
      calls.push('clearDir');
    };

    await runReset({ env: validEnv(), runCommand, clearDir, storageDir: '/tmp/whatever-evidence' });

    expect(calls.length).toBe(3);
    expect(calls[0]).toMatch(/migrate reset/);
    expect(calls[0]).toMatch(/--skip-seed/);
    expect(calls[1]).toBe('clearDir');
    expect(calls[2]).toMatch(/seed/);
  });

  it('si el guard falla (NODE_ENV=production), prisma migrate reset NUNCA se invoca (orden, no solo exit≠0)', async () => {
    const runCommand = async (): Promise<void> => {
      throw new Error('runCommand NO debería invocarse si el guard falla');
    };
    const clearDir = async (): Promise<void> => {
      throw new Error('clearDir NO debería invocarse si el guard falla');
    };

    await expect(
      runReset({ env: { ...validEnv(), NODE_ENV: 'production' }, runCommand, clearDir, storageDir: '/tmp/x' }),
    ).rejects.toThrow();
  });

  it('si el guard falla (hostname externo), ni migrate reset ni clearDir se invocan', async () => {
    let called = false;
    const runCommand = async (): Promise<void> => {
      called = true;
    };
    const clearDir = async (): Promise<void> => {
      called = true;
    };
    const badEnv = { ...validEnv(), DATABASE_URL: 'postgresql://u:p@evil-db.example.com/x' };

    await expect(runReset({ env: badEnv, runCommand, clearDir, storageDir: '/tmp/x' })).rejects.toThrow();
    expect(called).toBe(false);
  });
});

describe('026 · clearDirContents — vaciado idempotente del almacén (FR-011)', () => {
  it('directorio ausente → no falla (mkdir -p implícito, idempotente)', async () => {
    const parent = mkdtempSync(join(tmpdir(), 'fieldops-clear-dir-'));
    const missing = join(parent, 'no-existe-todavia');
    try {
      await expect(clearDirContents(missing)).resolves.not.toThrow();
      expect(existsSync(missing)).toBe(true); // termina existiendo y siendo escribible
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it('directorio con contenido → vacía el CONTENIDO, conserva el directorio', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'fieldops-clear-dir-'));
    writeFileSync(join(dir, 'blob1.bin'), 'x');
    mkdirSync(join(dir, 'subdir'));
    writeFileSync(join(dir, 'subdir', 'blob2.bin'), 'y');
    try {
      await clearDirContents(dir);
      expect(existsSync(dir)).toBe(true);
      expect(readdirSync(dir)).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('026 · Makefile — up/seed en el contexto del contenedor backend, no dcnode.sh→db-test (FR-006)', () => {
  const makefile = readFileSync('../Makefile', 'utf8');

  function target(name: string): string {
    const re = new RegExp(`^${name}:[^]*?(?=\\n\\w[^:]*:|\\n$|$)`, 'm');
    const m = makefile.match(re);
    return m ? m[0] : '';
  }

  it('`make seed` NO usa scripts/dcnode.sh (que apunta a db-test/fieldops_test)', () => {
    const body = target('seed');
    expect(body).not.toContain('dcnode.sh');
    expect(body).toMatch(/docker compose run --rm backend/);
  });

  it('`make up` invoca el mismo seed con blob en el contexto del contenedor backend (no dcnode.sh)', () => {
    const body = target('up');
    expect(body).not.toContain('dcnode.sh');
    expect(body).toMatch(/docker compose run --rm backend/);
  });

  it('existe el target `make reset` (guard→migrate reset→limpiar almacén→re-sembrar)', () => {
    const body = target('reset');
    expect(body).not.toBe('');
    expect(body).toMatch(/migrate reset/);
  });
});
