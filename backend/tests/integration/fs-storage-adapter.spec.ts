import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ClockPort } from '../../src/domain/ports/services';
import { FsStorageAdapter } from '../../src/infra/storage/fs-storage-adapter';

// Adaptador de `StoragePort` sobre filesystem (024, T008/T009). Sin BD: cada test usa un tmpdir
// efímero propio. Verifica cifrado en reposo (D6), firma del ref (D2) y TTL de la firma de lectura
// interna (D6) con un reloj inyectable determinista.

function mutableClock(startMs: number): { clock: ClockPort; advance: (deltaMs: number) => void } {
  let ms = startMs;
  return {
    clock: { now: () => new Date(ms) },
    advance: (deltaMs: number) => {
      ms += deltaMs;
    },
  };
}

const ENC_KEY = 'test-evidence-enc-key-min-32-characters-x';
const OWNER = '11111111-1111-1111-1111-111111111111';
const ORDER = '22222222-2222-2222-2222-222222222222';

let baseDir: string;

beforeEach(async () => {
  baseDir = await mkdtemp(join(tmpdir(), 'fieldops-evidence-'));
});

afterEach(async () => {
  await rm(baseDir, { recursive: true, force: true });
});

describe('FsStorageAdapter (StoragePort sobre filesystem cifrado)', () => {
  it('los bytes en reposo difieren del original (cifrados) y read() devuelve el original', async () => {
    const { clock } = mutableClock(1_700_000_000_000);
    const store = new FsStorageAdapter({ baseDir, encKey: ENC_KEY, clock });
    const original = Buffer.from('contenido-de-la-foto-de-evidencia');

    const ref = await store.putStaged({
      bytes: original,
      contentType: 'image/jpeg',
      ownerId: OWNER,
      orderId: ORDER,
    });

    // (a) los bytes crudos en disco difieren byte a byte del original.
    const files = await readdir(baseDir);
    const binFile = files.find((f) => f.endsWith('.bin'));
    expect(binFile).toBeDefined();
    const raw = await readFile(join(baseDir, binFile as string));
    expect(raw.equals(original)).toBe(false);
    expect(raw.includes(original)).toBe(false);

    // (b) read() tras putStaged devuelve los bytes originales.
    const handle = await store.signRead(ref, 300);
    const result = await store.read(handle);
    expect(Buffer.isBuffer(result)).toBe(true);
    expect((result as Buffer).equals(original)).toBe(true);
  });

  it('signRead con TTL corto y reloj avanzado → read() falla (expired)', async () => {
    const { clock, advance } = mutableClock(1_700_000_000_000);
    const store = new FsStorageAdapter({ baseDir, encKey: ENC_KEY, clock });
    const ref = await store.putStaged({
      bytes: Buffer.from('x'),
      contentType: 'image/png',
      ownerId: OWNER,
      orderId: ORDER,
    });

    const handle = await store.signRead(ref, 1); // TTL 1s
    advance(2_000);
    const result = await store.read(handle);
    expect(result).toEqual({ expired: true });
  });

  it('parseRef de un ref manipulado → malformed', async () => {
    const { clock } = mutableClock(1_700_000_000_000);
    const store = new FsStorageAdapter({ baseDir, encKey: ENC_KEY, clock });
    const ref = await store.putStaged({
      bytes: Buffer.from('x'),
      contentType: 'image/heic',
      ownerId: OWNER,
      orderId: ORDER,
    });
    const tampered = ref.slice(0, -1) + (ref.endsWith('A') ? 'B' : 'A');
    const parsed = store.parseRef(tampered);
    expect(parsed).toEqual({ ok: false, error: 'malformed' });
  });

  it('list()/delete() exponen createdAt y purgan el blob (para el GC)', async () => {
    const { clock } = mutableClock(1_700_000_000_000);
    const store = new FsStorageAdapter({ baseDir, encKey: ENC_KEY, clock });
    const ref = await store.putStaged({
      bytes: Buffer.from('x'),
      contentType: 'image/webp',
      ownerId: OWNER,
      orderId: ORDER,
    });

    const listed = await store.list();
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ objectRef: ref, ownerId: OWNER, orderId: ORDER });
    expect(listed[0]?.createdAt.getTime()).toBe(1_700_000_000_000);

    await store.delete(ref);
    expect(await store.list()).toHaveLength(0);
  });
});
