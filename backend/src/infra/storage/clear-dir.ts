import { mkdir, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

// Feature 026 (T010, FR-011) — vacía el CONTENIDO de un directorio de forma idempotente: si no existe,
// lo crea (`mkdir -p`) sin fallar; si existe, borra sus entradas (recursivo) pero conserva el propio
// directorio (nunca lo elimina). Usado por `runReset` para limpiar `EVIDENCE_STORAGE_DIR` antes de
// re-sembrar. Falla solo ante un error real de E/S o permisos (mensaje del propio error de Node, que
// nombra la ruta).
export async function clearDirContents(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
  const entries = await readdir(dir);
  await Promise.all(entries.map((entry) => rm(join(dir, entry), { recursive: true, force: true })));
}
