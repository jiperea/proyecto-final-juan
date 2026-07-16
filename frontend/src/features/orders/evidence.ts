import { CONTENT_TYPE_ALLOWLIST, EVIDENCE_MAX_BYTES, EVIDENCE_MAX_ITEMS } from '../../api/schemas';
import type { EvidenceRef } from '../../api/types';

// FE-2/024 (T032) · evidencia en memoria hasta el envío. `ref.object_ref` es un PLACEHOLDER de cliente
// (UUID aleatorio, opaco) usado solo para React key/dedup/eliminar-por-ítem ANTES de subir; el envío real
// (`uploadOrderEvidence`, multipart) sube `file` y el backend devuelve el `object_ref` DEFINITIVO que
// consume `submitOrderExecution` (FR-012) — el placeholder nunca viaja al backend. Preview local vía
// object URL (no confundir con el `blob:` de LECTURA de evidencia ya almacenada, FR-013).

export type AllowedContentType = (typeof CONTENT_TYPE_ALLOWLIST)[number];

export interface EvidenceItem {
  ref: EvidenceRef; // metadato + object_ref PLACEHOLDER de cliente (solo para key/dedup, no viaja)
  file: File; // binario real; lo sube uploadOrderEvidence al enviar (T032)
  previewUrl: string; // object URL del fichero (solo en memoria; para el thumbnail)
  fileName: string; // nombre accesible (no viaja: potencial PII)
  // huella best-effort para evitar re-añadir el mismo fichero (no bloqueante; H-102)
  fingerprint: string;
}

const EXT_TO_TYPE: Record<string, AllowedContentType> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
};

// Deriva el content_type de la allowlist: primero `file.type`; si viene vacío (HEIC en algunos
// navegadores, H-007), fallback por extensión. Devuelve null si no resuelve a la allowlist.
export function resolveContentType(file: File): AllowedContentType | null {
  const t = file.type.toLowerCase();
  if ((CONTENT_TYPE_ALLOWLIST as readonly string[]).includes(t)) return t as AllowedContentType;
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return EXT_TO_TYPE[ext] ?? null;
}

export type AddEvidenceError = 'INVALID_EVIDENCE_TYPE' | 'INVALID_EVIDENCE_SIZE' | 'DUPLICATE' | 'MAX_ITEMS';

export interface AddEvidenceResult {
  ok: boolean;
  item?: EvidenceItem;
  error?: AddEvidenceError;
}

function fingerprint(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

// Valida un fichero y lo convierte en EvidenceItem (rechazo EN EL MOMENTO DE AÑADIR, no al enviar — FR-004/T-003).
export function makeEvidenceItem(file: File, existing: EvidenceItem[]): AddEvidenceResult {
  if (existing.length >= EVIDENCE_MAX_ITEMS) return { ok: false, error: 'MAX_ITEMS' };
  const contentType = resolveContentType(file);
  if (contentType === null) return { ok: false, error: 'INVALID_EVIDENCE_TYPE' };
  if (file.size < 1 || file.size > EVIDENCE_MAX_BYTES) return { ok: false, error: 'INVALID_EVIDENCE_SIZE' };
  const fp = fingerprint(file);
  if (existing.some((e) => e.fingerprint === fp)) return { ok: false, error: 'DUPLICATE' };
  const item: EvidenceItem = {
    ref: { object_ref: crypto.randomUUID(), content_type: contentType, size_bytes: file.size },
    file,
    previewUrl: URL.createObjectURL(file),
    fileName: file.name,
    fingerprint: fp,
  };
  return { ok: true, item };
}

export const ADD_EVIDENCE_MESSAGE: Record<AddEvidenceError, string> = {
  INVALID_EVIDENCE_TYPE: 'Formato no admitido. Usa JPG, PNG, WEBP o HEIC.',
  INVALID_EVIDENCE_SIZE: 'La imagen supera el tamaño máximo (25 MiB).',
  DUPLICATE: 'Esa foto ya está añadida.',
  MAX_ITEMS: `Máximo ${EVIDENCE_MAX_ITEMS} fotos.`,
};
