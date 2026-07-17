import type {
  ObjectRef,
  PutStagedInput,
  ReadResult,
  SignedReadHandle,
  StagedRefInfo,
  StoragePort,
  StoredObjectSummary,
} from '../../src/domain/ports/storage';
import type { ClockPort } from '../../src/domain/ports/services';
import { err, ok, type Result } from '../../src/domain/result';
import {
  decodeHandle,
  decodeRef,
  deriveHandleKey,
  deriveRefKey,
  encodeHandle,
  encodeRef,
  newNonce,
} from '../../src/infra/storage/ref-codec';

// Fake en memoria de `StoragePort` (024) para tests de dominio/handlers sin filesystem real. Honra
// el mismo contrato de firma/TTL que el adaptador real (mismo codec de ref/handle) para que un test
// contra el fake sea representativo del comportamiento del adaptador de producción.

const FAKE_HMAC_SECRET = 'fake-storage-hmac-secret-not-real-min-32-chars';

export interface FakeStorage extends StoragePort {
  readonly objects: Map<string, Buffer>; // objectRef -> bytes en claro (fake: sin cifrado)
}

export function fakeStorage(clock: ClockPort): FakeStorage {
  const refKey = deriveRefKey(FAKE_HMAC_SECRET);
  const handleKey = deriveHandleKey(FAKE_HMAC_SECRET);
  const objects = new Map<string, Buffer>();

  return {
    objects,

    async putStaged(input: PutStagedInput): Promise<ObjectRef> {
      const createdAt = clock.now();
      const objectRef = encodeRef(
        { ownerId: input.ownerId, orderId: input.orderId, createdAt: createdAt.getTime(), nonce: newNonce() },
        refKey,
      );
      objects.set(objectRef, input.bytes);
      return objectRef;
    },

    parseRef(objectRef: ObjectRef): Result<StagedRefInfo, 'malformed'> {
      const payload = decodeRef(objectRef, refKey);
      if (!payload) {
        return err('malformed');
      }
      return ok({ ownerId: payload.ownerId, orderId: payload.orderId, createdAt: new Date(payload.createdAt) });
    },

    async signRead(objectRef: ObjectRef, ttlSeconds: number): Promise<SignedReadHandle> {
      const exp = clock.now().getTime() + ttlSeconds * 1000;
      return encodeHandle({ ref: objectRef, exp }, handleKey);
    },

    async read(handle: SignedReadHandle): Promise<ReadResult> {
      const payload = decodeHandle(handle, handleKey);
      if (!payload || clock.now().getTime() > payload.exp) {
        return { expired: true };
      }
      const bytes = objects.get(payload.ref);
      if (!bytes) {
        return { expired: true };
      }
      return bytes;
    },

    async list(): Promise<readonly StoredObjectSummary[]> {
      const out: StoredObjectSummary[] = [];
      for (const objectRef of objects.keys()) {
        const parsed = decodeRef(objectRef, refKey);
        if (parsed) {
          out.push({
            objectRef,
            ownerId: parsed.ownerId,
            orderId: parsed.orderId,
            createdAt: new Date(parsed.createdAt),
          });
        }
      }
      return out;
    },

    async delete(objectRef: ObjectRef): Promise<void> {
      objects.delete(objectRef);
    },
  };
}
