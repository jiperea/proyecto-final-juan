import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

// Codificación/firma compartida por el `object_ref` (staging, D2) y el handle de lectura interno
// (D6). Token opaco = base64url(payload JSON) + '.' + base64url(HMAC-SHA256(payload, key)). Claves
// derivadas del secreto de configuración por separación de contexto (una clave por uso, nunca la
// misma que la de cifrado AES-GCM).

export interface RefPayload {
  readonly ownerId: string;
  readonly orderId: string;
  readonly createdAt: number; // epoch ms
  readonly nonce: string;
}

export interface HandlePayload {
  readonly ref: string;
  readonly exp: number; // epoch ms
}

function deriveKey(masterKey: string, info: string): Buffer {
  return createHmac('sha256', masterKey).update(info).digest();
}

export function deriveEncKey(masterKey: string): Buffer {
  return deriveKey(masterKey, 'evidence-aes-gcm-v1');
}

export function deriveRefKey(masterKey: string): Buffer {
  return deriveKey(masterKey, 'evidence-ref-hmac-v1');
}

export function deriveHandleKey(masterKey: string): Buffer {
  return deriveKey(masterKey, 'evidence-handle-hmac-v1');
}

function sign(payloadB64: string, key: Buffer): string {
  return createHmac('sha256', key).update(payloadB64).digest('base64url');
}

function encode<T>(payload: T, key: Buffer): string {
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${payloadB64}.${sign(payloadB64, key)}`;
}

function decode<T>(token: string, key: Buffer, isValid: (v: unknown) => v is T): T | null {
  const parts = token.split('.');
  if (parts.length !== 2) {
    return null;
  }
  const [payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64) {
    return null;
  }
  const expected = Buffer.from(sign(payloadB64, key), 'base64url');
  let given: Buffer;
  try {
    given = Buffer.from(sigB64, 'base64url');
  } catch {
    return null;
  }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    return isValid(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isRefPayload(v: unknown): v is RefPayload {
  const p = v as Partial<RefPayload> | null;
  return (
    typeof p === 'object' &&
    p !== null &&
    typeof p.ownerId === 'string' &&
    typeof p.orderId === 'string' &&
    typeof p.createdAt === 'number' &&
    typeof p.nonce === 'string'
  );
}

function isHandlePayload(v: unknown): v is HandlePayload {
  const p = v as Partial<HandlePayload> | null;
  return typeof p === 'object' && p !== null && typeof p.ref === 'string' && typeof p.exp === 'number';
}

export function encodeRef(payload: RefPayload, key: Buffer): string {
  return encode(payload, key);
}

export function decodeRef(token: string, key: Buffer): RefPayload | null {
  return decode(token, key, isRefPayload);
}

export function encodeHandle(payload: HandlePayload, key: Buffer): string {
  return encode(payload, key);
}

export function decodeHandle(token: string, key: Buffer): HandlePayload | null {
  return decode(token, key, isHandlePayload);
}

export function newNonce(): string {
  return randomBytes(8).toString('hex');
}
