// Mapa de código de error del contrato → mensaje español (docs/design-system.md §8). FR-015/027.
// La UI NUNCA inventa texto: código no mapeado → fallback; sin respuesta HTTP → offline.
const MESSAGES: Record<string, string> = {
  UNAUTHENTICATED: 'Tu sesión ha caducado. Vuelve a iniciar sesión.',
  FORBIDDEN_ROLE: 'No tienes permiso para esta acción.',
  NOT_FOUND: 'Esta orden no existe o no está disponible para ti.',
  INVALID_TRANSITION: 'La orden ha cambiado de estado. Actualiza y reinténtalo.',
  INVALID_ASSIGNEE: 'El técnico destino no es válido.',
  INVALID_EVIDENCE: 'La evidencia no cumple los requisitos (formato/tamaño).',
  EVIDENCE_REQUIRED: 'Añade al menos una foto antes de enviar.',
  // 024 (uploadOrderEvidence, T032): allowlist/tamaño/contenido real del binario.
  PAYLOAD_TOO_LARGE: 'La imagen supera el tamaño máximo (25 MiB).',
  UNSUPPORTED_MEDIA_TYPE: 'Formato no admitido. Usa JPG, PNG, WEBP o HEIC.',
  STAGING_LIMIT_EXCEEDED: 'Máximo 10 fotos por ciclo.',
  EVIDENCE_GONE: 'Esta imagen ya no está disponible.',
  INVALID_REASON: 'Indica un motivo válido.',
  EVIDENCE_MISSING: 'No se puede aprobar: la orden no tiene evidencia.',
  VALIDATION_ERROR: 'Revisa los campos marcados.',
  RATE_LIMITED: 'Demasiadas solicitudes. Espera unos segundos.',
  SERVICE_UNAVAILABLE: 'Servicio no disponible temporalmente. Reinténtalo.',
  AI_UNAVAILABLE: 'El resumen por IA no está disponible en este entorno.', // 018 (dev-only): no reintentable
  INTERNAL: 'Ha ocurrido un error. Reinténtalo.',
};

export const FALLBACK_MESSAGE = 'Ha ocurrido un error. Reinténtalo.';
export const OFFLINE_MESSAGE = 'Sin conexión. Reinténtalo.';
export const INVALID_CREDENTIALS_MESSAGE = 'Credenciales no válidas';
export const NOT_AVAILABLE_MESSAGE = 'Esta orden no existe o no está disponible para ti.';
export const SESSION_EXPIRED_MESSAGE = 'Tu sesión ha caducado. Vuelve a iniciar sesión.';

export function messageForCode(code: string | undefined): string {
  if (code && code in MESSAGES) return MESSAGES[code]!;
  return FALLBACK_MESSAGE;
}
