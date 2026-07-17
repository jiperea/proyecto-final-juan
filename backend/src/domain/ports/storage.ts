import type { Result } from '../result';

// Puerto de almacenamiento de blobs de evidencia (024, Constitution III). El dominio NO conoce
// cifrado/firma/filesystem: solo esta interfaz pura. Adaptadores en infra/storage/* (fs cifrado en
// dev/test) y tests/helpers (fake en memoria).

/**
 * Referencia opaca a un blob (staged o committeado). Codifica `(ownerId, orderId, createdAt, nonce)`
 * firmados con HMAC (research.md D2); el dominio la trata como opaca — usa `parseRef` para leerla,
 * nunca la decodifica a mano.
 */
export type ObjectRef = string;

/**
 * Handle interno de lectura con TTL corto (≤300 s, D6). Nunca se expone al cliente (SC-003): solo
 * el backend lo crea y consume para leer del store.
 */
export type SignedReadHandle = string;

export interface StagedRefInfo {
  readonly ownerId: string;
  readonly orderId: string;
  readonly createdAt: Date;
}

export interface StoredObjectSummary {
  readonly objectRef: ObjectRef;
  readonly ownerId: string;
  readonly orderId: string;
  readonly createdAt: Date;
}

export interface PutStagedInput {
  readonly bytes: Buffer;
  readonly contentType: string;
  readonly ownerId: string;
  readonly orderId: string;
}

/** Resultado de una lectura: bytes en claro, o marca de expiración (el handle ya no es válido). */
export type ReadResult = Buffer | { readonly expired: true };

export interface StoragePort {
  /** Cifra y almacena en staging; devuelve el `object_ref` opaco (sin fila de metadatos, D2/D4). */
  putStaged(input: PutStagedInput): Promise<ObjectRef>;
  /** Decodifica y verifica la firma del ref. Error `'malformed'` si está corrupto/manipulado. */
  parseRef(objectRef: ObjectRef): Result<StagedRefInfo, 'malformed'>;
  /** Emite un handle de lectura interno con TTL ≤300 s (D6). */
  signRead(objectRef: ObjectRef, ttlSeconds: number): Promise<SignedReadHandle>;
  /** Descifra y devuelve los bytes; si el handle caducó, no devuelve bytes (fail-closed). */
  read(handle: SignedReadHandle): Promise<ReadResult>;
  /** Enumera los objetos almacenados (para el GC, FR-024). */
  list(): Promise<readonly StoredObjectSummary[]>;
  /** Purga física de un objeto. */
  delete(objectRef: ObjectRef): Promise<void>;
}
