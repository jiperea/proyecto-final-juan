// Reglas puras de validación de EvidenceRef (005, dominio — sin BD, sin frameworks).
// Parámetros derivados del contrato (research.md D1); no números mágicos dispersos por el código.
import { domainError, err, ok, type Result } from '../result';

/** Referencia/metadato de una evidencia (camelCase interno; el DTO externo es snake_case). */
export interface EvidenceRefInput {
  readonly objectRef: string;
  readonly contentType: string;
  readonly sizeBytes: number;
}

export const EVIDENCE_MIN = 1;
export const EVIDENCE_MAX = 10;
export const ALLOWED_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
] as const;
export const SIZE_BYTES_MAX = 26_214_400; // 25 MiB
export const OBJECT_REF_MAX = 512;

const ALLOWED = new Set<string>(ALLOWED_CONTENT_TYPES);

function invalidEvidence(): ReturnType<typeof domainError> {
  return domainError('INVALID_EVIDENCE', 'Alguna evidencia no es válida.', {
    agentAction:
      'Envía entre 1 y 10 evidencias de imagen (jpeg/png/webp/heic), tamaño 1..26214400 bytes, ' +
      'con object_ref bien formado y sin duplicados.',
  });
}

// object_ref: 1..512 code points, sin caracteres de control y sin whitespace de borde (formato opaco).
function objectRefWellFormed(ref: string): boolean {
  const codePoints = [...ref].length;
  if (codePoints < 1 || codePoints > OBJECT_REF_MAX) {
    return false;
  }
  if (/\p{Cc}/u.test(ref)) {
    return false; // caracteres de control (incluye \n, \t, \0, ...)
  }
  if (/^\s|\s$/u.test(ref)) {
    return false; // whitespace de borde
  }
  return true;
}

/**
 * Valida el array de evidencia por referencia (bloqueante, FR-004). No comprueba existencia del objeto
 * (transporte = #007). Devuelve la lista intacta si es válida.
 * - 0 elementos → EVIDENCE_REQUIRED (Brief "al menos una foto").
 * - resto de fallos (>máximo, tipo/tamaño/object_ref inválidos, duplicados exactos) → INVALID_EVIDENCE.
 */
export function validateEvidence(
  evidence: readonly EvidenceRefInput[],
): Result<readonly EvidenceRefInput[]> {
  if (evidence.length < EVIDENCE_MIN) {
    return err(
      domainError('EVIDENCE_REQUIRED', 'Se requiere al menos una evidencia.', {
        agentAction: 'Adjunta al menos una evidencia fotográfica válida.',
      }),
    );
  }
  if (evidence.length > EVIDENCE_MAX) {
    return err(invalidEvidence());
  }
  const seen = new Set<string>();
  for (const item of evidence) {
    if (!ALLOWED.has(item.contentType)) {
      return err(invalidEvidence());
    }
    if (!Number.isInteger(item.sizeBytes) || item.sizeBytes <= 0 || item.sizeBytes > SIZE_BYTES_MAX) {
      return err(invalidEvidence());
    }
    if (!objectRefWellFormed(item.objectRef)) {
      return err(invalidEvidence());
    }
    if (seen.has(item.objectRef)) {
      return err(invalidEvidence()); // duplicado exacto (byte a byte, case-sensitive, sin trim)
    }
    seen.add(item.objectRef);
  }
  return ok(evidence);
}

// ---------------------------------------------------------------------------------------------------
// 024 (T018/FR-019) — validación de CONTENIDO REAL (magic-bytes), independiente del tipo declarado por
// el cliente. Pura (sin fs/crypto de terceros, solo lectura de bytes en memoria). Usada por
// `uploadOrderEvidence` ANTES de almacenar (FR-002/FR-019/FR-020): tipo declarado fuera de la allowlist
// → 415 (ni mira el contenido); declarado en allowlist pero el contenido real no coincide (falseado,
// corrupto, ilegible) → 422.

// Marcas ISO-BMFF (`ftyp`) que identifican HEIC/HEIF (no se decodifica la imagen, solo la caja de tipo).
const HEIC_FTYP_BRANDS = new Set(['heic', 'heix', 'heim', 'heis', 'hevc', 'hevm', 'hevs', 'mif1', 'msf1']);

function isJpeg(b: Buffer): boolean {
  return b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
}

function isPng(b: Buffer): boolean {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (b.length < sig.length) {
    return false;
  }
  return sig.every((byte, i) => b[i] === byte);
}

function isWebp(b: Buffer): boolean {
  return b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP';
}

function isHeic(b: Buffer): boolean {
  if (b.length < 12 || b.toString('ascii', 4, 8) !== 'ftyp') {
    return false;
  }
  return HEIC_FTYP_BRANDS.has(b.toString('ascii', 8, 12));
}

/** Detecta el tipo real por magic-bytes; `null` si no coincide con ningún tipo de la allowlist. */
export function detectMagicContentType(bytes: Buffer): (typeof ALLOWED_CONTENT_TYPES)[number] | null {
  if (isJpeg(bytes)) return 'image/jpeg';
  if (isPng(bytes)) return 'image/png';
  if (isWebp(bytes)) return 'image/webp';
  if (isHeic(bytes)) return 'image/heic';
  return null;
}

/**
 * Valida un binario recién subido (uploadOrderEvidence, FR-002/FR-019): (1) el `content_type`
 * DECLARADO debe estar en la allowlist → si no, 415 UNSUPPORTED_MEDIA_TYPE (nunca mira el contenido);
 * (2) el contenido REAL (magic-bytes) debe coincidir con el declarado → si no (falseado/corrupto/
 * ilegible), 422 INVALID_EVIDENCE. Tamaño (413) se valida en el borde de streaming (handler), no aquí.
 */
export function validateUploadedImage(declaredContentType: string, bytes: Buffer): Result<void> {
  if (!ALLOWED.has(declaredContentType)) {
    return err(
      domainError('UNSUPPORTED_MEDIA_TYPE', 'Tipo de imagen no soportado.', {
        agentAction: 'Sube una imagen jpeg/png/webp/heic.',
      }),
    );
  }
  const real = detectMagicContentType(bytes);
  if (real === null || real !== declaredContentType) {
    return err(invalidEvidence());
  }
  return ok(undefined);
}
