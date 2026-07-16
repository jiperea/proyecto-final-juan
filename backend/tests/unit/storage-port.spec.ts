import { describe, expect, it } from 'vitest';
import type { ClockPort } from '../../src/domain/ports/services';
import { fakeStorage } from '../helpers/fake-storage';

// Contrato de `StoragePort` (024, T006) verificado contra el fake en memoria (T010). El adaptador
// real (fs cifrado, tests/integration/fs-storage-adapter.spec.ts) implementa el MISMO contrato.

function mutableClock(startMs: number): { clock: ClockPort; advance: (deltaMs: number) => void } {
  let ms = startMs;
  return {
    clock: { now: () => new Date(ms) },
    advance: (deltaMs: number) => {
      ms += deltaMs;
    },
  };
}

const OWNER = '11111111-1111-1111-1111-111111111111';
const ORDER = '22222222-2222-2222-2222-222222222222';

describe('StoragePort — contrato (fake)', () => {
  it('putStaged → parseRef es consistente (owner/orden/fecha)', async () => {
    const { clock } = mutableClock(1_700_000_000_000);
    const store = fakeStorage(clock);
    const ref = await store.putStaged({
      bytes: Buffer.from('hello'),
      contentType: 'image/jpeg',
      ownerId: OWNER,
      orderId: ORDER,
    });
    const parsed = store.parseRef(ref);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.ownerId).toBe(OWNER);
      expect(parsed.value.orderId).toBe(ORDER);
      expect(parsed.value.createdAt.getTime()).toBe(1_700_000_000_000);
    }
  });

  it('signRead/read devuelve los bytes originales dentro del TTL', async () => {
    const { clock } = mutableClock(1_700_000_000_000);
    const store = fakeStorage(clock);
    const original = Buffer.from('contenido-evidencia');
    const ref = await store.putStaged({
      bytes: original,
      contentType: 'image/png',
      ownerId: OWNER,
      orderId: ORDER,
    });
    const handle = await store.signRead(ref, 300);
    const result = await store.read(handle);
    expect(Buffer.isBuffer(result)).toBe(true);
    expect((result as Buffer).equals(original)).toBe(true);
  });

  it('read tras expirar el TTL falla (no devuelve bytes)', async () => {
    const { clock, advance } = mutableClock(1_700_000_000_000);
    const store = fakeStorage(clock);
    const ref = await store.putStaged({
      bytes: Buffer.from('x'),
      contentType: 'image/webp',
      ownerId: OWNER,
      orderId: ORDER,
    });
    const handle = await store.signRead(ref, 1); // TTL 1s
    advance(2_000); // avanza 2s → expira
    const result = await store.read(handle);
    expect(result).toEqual({ expired: true });
  });

  it('parseRef de un ref manipulado → malformed', async () => {
    const { clock } = mutableClock(1_700_000_000_000);
    const store = fakeStorage(clock);
    const ref = await store.putStaged({
      bytes: Buffer.from('x'),
      contentType: 'image/heic',
      ownerId: OWNER,
      orderId: ORDER,
    });
    const tampered = `${ref}tampered`;
    const parsed = store.parseRef(tampered);
    expect(parsed).toEqual({ ok: false, error: 'malformed' });
  });

  it('list/delete exponen createdAt y purgan el objeto (para el GC)', async () => {
    const { clock } = mutableClock(1_700_000_000_000);
    const store = fakeStorage(clock);
    const ref = await store.putStaged({
      bytes: Buffer.from('x'),
      contentType: 'image/jpeg',
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
