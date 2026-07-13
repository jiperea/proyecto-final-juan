// Puertos del dominio read-side (#010, Constitution III). El dominio NO importa Express/Prisma/pino.
// Todo lo que necesita el ensamblador del detalle llega por estos puertos (inyección de dependencias).
import type { OrderRecord } from '../model';

// Metadatos de evidencia del ciclo vigente (NUNCA object_ref ni binario) — igual forma que EvidenceMeta de 007.
// `contentTypes` viene ORDENADO por `at` asc (desempate por id) desde el reader; invariante count == length.
export interface EvidenceMeta {
  readonly count: number;
  readonly contentTypes: readonly string[];
}

// Transición de rechazo (006): fromStatus=pending_review, toStatus=in_progress. `reason` obligatorio (006).
// `id` es uuid v7 monótono generado server-side (desempate de `at` con el submit).
export interface RejectAudit {
  readonly id: string;
  readonly at: Date;
  readonly reason: string;
}

// Último submitOrderExecution (reason='execution_registered'): su `id` es el auditId del ciclo vigente.
export interface SubmitAudit {
  readonly id: string; // auditId del ciclo vigente
  readonly at: Date;
}

// Snapshot ATÓMICO del detalle (FR-003/FR-005): la fila `order` completa (guard de propiedad + campos),
// la última reject, el último submit y las notas/evidencia del ciclo vigente — TODO en un mismo instante
// lógico (una consulta / $transaction REPEATABLE READ), de modo que ni un submit ni una reasignación
// concurrentes produzcan estados híbridos ni dejen al ex-dueño leer el motivo.
export interface OrderDetailSnapshot {
  readonly order: OrderRecord;
  readonly lastSubmit: SubmitAudit | null; // null = sin ciclo de ejecución aún
  readonly lastReject: RejectAudit | null;
  readonly notes: string | null; // notas del ciclo vigente (null si no hay ciclo o no hay notas)
  readonly evidenceContentTypes: readonly string[]; // ciclo vigente, ordenado por `at` asc (id tiebreak)
}

// Lectura del snapshot consistente. `null` = la orden NO existe (→ 404). BD no disponible → lanza
// DomainError SERVICE_UNAVAILABLE (503); otro error inesperado se propaga (→ 500).
export interface OrderDetailReaderPort {
  read(orderId: string): Promise<OrderDetailSnapshot | null>;
}

// Redactor de PII estructurada (reusa domain/ai/pii-redactor de 007). Se invoca FAIL-CLOSED: si lanza,
// el ensamblador OMITE el motivo (nunca sirve el reason crudo).
export interface PiiRedactorPort {
  redact(text: string): string;
}

// Observabilidad de accesos denegados (FR-009). NO durable (el registro forense durable es #009). Señal
// best-effort por el logger pino compartido. Emite en 401 (sin actor) y 404 (con actor). `recurso` saneado.
export type DeniedAccessOutcome = '401_unauth' | '404_not_visible';

export interface DeniedAccessEvent {
  readonly actor?: string;
  readonly endpoint: string;
  readonly recurso: string;
  readonly outcome: DeniedAccessOutcome;
}

export interface DeniedAccessLoggerPort {
  record(event: DeniedAccessEvent): void;
}
