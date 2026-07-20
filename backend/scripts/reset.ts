import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assertDevLocalOrThrow } from '../prisma/seed';
import { clearDirContents } from '../src/infra/storage/clear-dir';

// Feature 026 (T010/T011, FR-005/FR-006/FR-011) — modelo "reset-y-siembra": orquesta, en UNA sola
// invocación (pensada para correr DENTRO del contenedor `backend` de dev, `docker compose run --rm
// backend npx tsx scripts/reset.ts`), la secuencia completa: (0) guard dev-local como PREFLIGHT — si
// falla, aborta ANTES de invocar nada destructivo (ni `prisma migrate reset` ni el borrado del almacén);
// (a) `prisma migrate reset --force --skip-seed`; (b) vacía el CONTENIDO de `EVIDENCE_STORAGE_DIR`
// (idempotente, `mkdir -p` implícito); (c) re-siembra con el mismo seed atómico con blob (FR-001/FR-010).
// El propio contenedor `backend` es el que escribió los blobs (mismo UID), así el mismatch de permisos
// host↔contenedor no puede ocurrir.

export interface RunResetDeps {
  readonly env: NodeJS.ProcessEnv;
  readonly runCommand: (cmd: string, args: readonly string[]) => Promise<void>;
  readonly clearDir: (dir: string) => Promise<void>;
  readonly storageDir: string;
}

export async function runReset(deps: RunResetDeps): Promise<void> {
  assertDevLocalOrThrow(deps.env); // (0) preflight; lanza ANTES de tocar nada si NODE_ENV/host/clave no son de dev-local.
  await deps.runCommand('npx', ['prisma', 'migrate', 'reset', '--force', '--skip-seed']); // (a)
  await deps.clearDir(deps.storageDir); // (b)
  await deps.runCommand('npm', ['run', 'seed']); // (c)
}

// Ejecuta un comando real heredando stdio (visible en la consola de `make reset`); rechaza si el
// proceso termina con código de salida distinto de 0, o si no puede lanzarse (p. ej. binario ausente).
function spawnCommand(cmd: string, args: readonly string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args as string[], { stdio: 'inherit' });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Comando '${cmd} ${args.join(' ')}' terminó con código ${code}`));
      }
    });
  });
}

async function main(): Promise<void> {
  await runReset({
    env: process.env,
    runCommand: spawnCommand,
    clearDir: clearDirContents,
    storageDir: process.env.EVIDENCE_STORAGE_DIR ?? './data/evidence',
  });
  console.log('Reset OK: BD y almacén de evidencia limpios y re-sembrados.');
}

// Solo auto-ejecuta si este módulo ES el entrypoint (permite importar runReset desde tests sin disparar
// el reset real), mismo patrón que prisma/seed.ts.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e: unknown) => {
    console.error(e);
    process.exitCode = 1;
  });
}
