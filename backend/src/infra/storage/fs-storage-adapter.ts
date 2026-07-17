import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { err, ok, type Result } from '../../domain/result';
import type {
  ObjectRef,
  PutStagedInput,
  ReadResult,
  SignedReadHandle,
  StagedRefInfo,
  StoragePort,
  StoredObjectSummary,
} from '../../domain/ports/storage';
import type { ClockPort } from '../../domain/ports/services';
import {
  decodeHandle,
  decodeRef,
  deriveEncKey,
  deriveHandleKey,
  deriveRefKey,
  encodeHandle,
  encodeRef,
  newNonce,
} from './ref-codec';

// Adaptador de `StoragePort` sobre filesystem local (dev/test, research.md D1/D6). Cifra AES-256-GCM
// en reposo (IV aleatorio por objeto, tag autenticado verificado al leer); el `object_ref` es un
// token opaco HMAC-firmado (D2) y el handle de lectura interno tiene TTL corto (D6), nunca expuesto
// al cliente. Cada objeto se guarda en dos ficheros: `<hash>.bin` (iv+tag+ciphertext) y
// `<hash>.meta.json` (metadata NO sensible — ya visible al dueño dentro del propio ref).

const IV_LEN = 12;
const TAG_LEN = 16;

export interface FsStorageAdapterConfig {
  readonly baseDir: string;
  /** Secreto maestro (config.evidenceEncKey); se derivan sub-claves por contexto (cifrado/firma). */
  readonly encKey: string;
  readonly clock: ClockPort;
}

interface MetaFile {
  readonly objectRef: string;
  readonly ownerId: string;
  readonly orderId: string;
  readonly createdAt: string; // ISO
}

export class FsStorageAdapter implements StoragePort {
  private readonly encKey: Buffer;
  private readonly refKey: Buffer;
  private readonly handleKey: Buffer;
  private readonly ready: Promise<void>;

  constructor(private readonly cfg: FsStorageAdapterConfig) {
    this.encKey = deriveEncKey(cfg.encKey);
    this.refKey = deriveRefKey(cfg.encKey);
    this.handleKey = deriveHandleKey(cfg.encKey);
    this.ready = mkdir(cfg.baseDir, { recursive: true }).then(() => undefined);
  }

  private fileHash(objectRef: string): string {
    return createHash('sha256').update(objectRef).digest('hex');
  }

  private binPath(hash: string): string {
    return join(this.cfg.baseDir, `${hash}.bin`);
  }

  private metaPath(hash: string): string {
    return join(this.cfg.baseDir, `${hash}.meta.json`);
  }

  async putStaged(input: PutStagedInput): Promise<ObjectRef> {
    await this.ready;
    const createdAt = this.cfg.clock.now();
    const objectRef = encodeRef(
      { ownerId: input.ownerId, orderId: input.orderId, createdAt: createdAt.getTime(), nonce: newNonce() },
      this.refKey,
    );
    const iv = randomBytes(IV_LEN);
    const cipher = createCipheriv('aes-256-gcm', this.encKey, iv);
    const ciphertext = Buffer.concat([cipher.update(input.bytes), cipher.final()]);
    const tag = cipher.getAuthTag();
    const hash = this.fileHash(objectRef);
    await writeFile(this.binPath(hash), Buffer.concat([iv, tag, ciphertext]));
    const meta: MetaFile = {
      objectRef,
      ownerId: input.ownerId,
      orderId: input.orderId,
      createdAt: createdAt.toISOString(),
    };
    await writeFile(this.metaPath(hash), JSON.stringify(meta));
    return objectRef;
  }

  parseRef(objectRef: ObjectRef): Result<StagedRefInfo, 'malformed'> {
    const payload = decodeRef(objectRef, this.refKey);
    if (!payload) {
      return err('malformed');
    }
    return ok({ ownerId: payload.ownerId, orderId: payload.orderId, createdAt: new Date(payload.createdAt) });
  }

  async signRead(objectRef: ObjectRef, ttlSeconds: number): Promise<SignedReadHandle> {
    const exp = this.cfg.clock.now().getTime() + ttlSeconds * 1000;
    return encodeHandle({ ref: objectRef, exp }, this.handleKey);
  }

  async read(handle: SignedReadHandle): Promise<ReadResult> {
    const payload = decodeHandle(handle, this.handleKey);
    if (!payload || this.cfg.clock.now().getTime() > payload.exp) {
      return { expired: true };
    }
    const hash = this.fileHash(payload.ref);
    const raw = await readFile(this.binPath(hash));
    const iv = raw.subarray(0, IV_LEN);
    const tag = raw.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const ciphertext = raw.subarray(IV_LEN + TAG_LEN);
    const decipher = createDecipheriv('aes-256-gcm', this.encKey, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }

  async list(): Promise<readonly StoredObjectSummary[]> {
    await this.ready;
    const files = await readdir(this.cfg.baseDir);
    const metaFiles = files.filter((f) => f.endsWith('.meta.json'));
    const out: StoredObjectSummary[] = [];
    for (const f of metaFiles) {
      const raw = await readFile(join(this.cfg.baseDir, f), 'utf8');
      const meta = JSON.parse(raw) as MetaFile;
      out.push({
        objectRef: meta.objectRef,
        ownerId: meta.ownerId,
        orderId: meta.orderId,
        createdAt: new Date(meta.createdAt),
      });
    }
    return out;
  }

  async delete(objectRef: ObjectRef): Promise<void> {
    const hash = this.fileHash(objectRef);
    await Promise.all([
      rm(this.binPath(hash), { force: true }),
      rm(this.metaPath(hash), { force: true }),
    ]);
  }
}
