// Puertos del dominio IA (Constitution III). El dominio NO importa child_process/Prisma/SDK.
import type { DomainError, Result } from '../result';

// Metadatos de evidencia (nunca object_ref ni binario) — allowlist estructural (FR-003a).
export interface EvidenceMeta {
  readonly count: number;
  readonly contentTypes: readonly string[];
}

// Fuente de la incidencia = notas CRUDAS (pre-redacción) + metadatos de evidencia del CICLO VIGENTE
// (auditId del submit → pending_review actual, H-001). `null` en el puerto = orden no visible.
export interface IncidentSource {
  readonly notes: string;
  readonly evidence: EvidenceMeta;
}

// Petición minimizada al proveedor (PromptInput): notas redactadas + metadatos. No se persiste ni loguea.
// La serialización real (nonce-delimitado anti-inyección, FR-016) la hace el adaptador infra.
export interface PromptInput {
  readonly notesRedacted: string;
  readonly evidence: EvidenceMeta;
}

// Salida BIEN FORMADA del proveedor. `null` (ok) = salida no conforme como JSON (malformado / campo
// ausente o de tipo incorrecto, H-003) → el caso de uso la trata como fallback (200), NO como 503.
export interface ProviderSummary {
  readonly summary: string;
  readonly sufficient: boolean;
}

// Outcome del evento de acceso (FR-013). `blocked_pii` (seguridad) distinguible; `denied` cubre 403/404/429.
export type AccessOutcome = 'success' | 'fallback_insufficient' | 'blocked_pii' | 'error' | 'denied';

// Sub-tipo del rechazo (S-001, granularidad forense): sólo presente cuando outcome=denied.
export type DeniedReason = 'role_403' | 'not_visible_404' | 'rate_limited_429';

export interface AccessEvent {
  readonly actor: string;
  readonly orderId: string;
  readonly outcome: AccessOutcome;
  readonly deniedReason?: DeniedReason;
}

// Proveedor IA por puerto. `err(SERVICE_UNAVAILABLE)` SÓLO en timeout/fallo de proceso (→503).
export interface AiSummaryProviderPort {
  generate(input: PromptInput): Promise<Result<ProviderSummary | null, DomainError>>;
}

// Lectura de la fuente (infra Prisma). `null` = orden no visible en pending_review (→404). Nunca object_ref.
export interface IncidentSourcePort {
  findSummarizable(orderId: string): Promise<IncidentSource | null>;
}

// Evento de acceso sin PII (log estructurado; durable = #009/BL-002).
export interface AccessLogPort {
  record(event: AccessEvent): void;
}
