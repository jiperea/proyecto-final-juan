import type { ClockPort } from '../../src/domain/ports/services';
import { FsStorageAdapter } from '../../src/infra/storage/fs-storage-adapter';

// Helper de test (024): construye un blob STAGED real, directamente contra el mismo `StoragePort` de
// filesystem que usará el backend (mismo `baseDir`/`encKey` que la app bajo prueba), sin pasar por el
// endpoint HTTP `uploadOrderEvidence` (que aún no existe en fase Red). Permite fabricar refs con
// `ownerId`/`orderId`/edad (`atMs`) arbitrarios para ejercitar la re-verificación de `submitOrderExecution`
// (FR-023) de forma aislada, representativa del adaptador de producción (mismo codec HMAC de `object_ref`).

export interface StageBlobOptions {
  readonly baseDir: string;
  readonly encKey: string;
  readonly ownerId: string;
  readonly orderId: string;
  readonly bytes: Buffer;
  readonly contentType: string;
  /** Instante (epoch ms) a usar como `createdAt` embebido en el ref. Por defecto, ahora mismo. */
  readonly atMs?: number;
}

export async function stageBlob(opts: StageBlobOptions): Promise<string> {
  const clock: ClockPort = { now: (): Date => new Date(opts.atMs ?? Date.now()) };
  const store = new FsStorageAdapter({ baseDir: opts.baseDir, encKey: opts.encKey, clock });
  return store.putStaged({
    bytes: opts.bytes,
    contentType: opts.contentType,
    ownerId: opts.ownerId,
    orderId: opts.orderId,
  });
}
