import { z } from 'zod';
import type {
  EvidenceMeta,
  EvidenceRef,
  ExecutionRequest,
  IncidentSummaryResponse,
  Order,
  OrderStatus,
  ReassignmentRequest,
  ReviewRequest,
  UploadEvidenceResponse,
} from './types';

// Validación runtime en el boundary (FR-016). Derivado del contrato; en CI el objetivo es generarlo
// (openapi-zod-client) y difear contra el contrato (SC-008b). Aquí se define alineado a los tipos
// generados de src/api/generated/*.
export const orderStatusSchema = z.enum([
  'draft',
  'assigned',
  'in_progress',
  'pending_review',
  'closed',
]);

export const orderSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  status: orderStatusSchema,
  assigned_to: z.string().nullable(),
  version: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const orderListResponseSchema = z.object({
  orders: z.array(orderSchema),
});

// ── Write-side del técnico (FE-2, FR-004/FR-005/FR-008) ──────────────────────────────────────────
// Derivado del contrato (EvidenceRef/ExecutionRequest). El binario NO viaja; solo metadato.
export const CONTENT_TYPE_ALLOWLIST = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'] as const;
export const EVIDENCE_MAX_BYTES = 26214400; // 25 MiB (contrato)
export const EVIDENCE_MAX_ITEMS = 10;

// 024 · FR-014: `items[]` amplía EvidenceMeta de forma COMPATIBLE (evidence_id + content_type, en el
// MISMO orden que content_types). Opcional en el contrato (legacy/rollout); si viene, length == count.
export const evidenceItemSchema = z.object({
  evidence_id: z.string(),
  content_type: z.enum(CONTENT_TYPE_ALLOWLIST),
});

export const evidenceMetaSchema = z.object({
  count: z.number(),
  content_types: z.array(z.enum(CONTENT_TYPE_ALLOWLIST)),
  items: z.array(evidenceItemSchema).optional(),
});

export const orderDetailResponseSchema = z.object({
  order: orderSchema,
  notes: z.string().optional(),
  evidence: evidenceMetaSchema.optional(),
  last_rejection_reason: z.string().optional(),
});

export const evidenceRefSchema = z.object({
  // object_ref: 1..512, sin caracteres de control ni whitespace de borde (contrato). Generado en cliente (UUID).
  object_ref: z
    .string()
    .min(1)
    .max(512)
    // sin control chars ni whitespace de borde (contrato); los UUID los cumplen.
    // eslint-disable-next-line no-control-regex
    .refine((s) => s === s.trim() && !/[\u0000-\u001f\u007f]/.test(s), 'object_ref invalido'),
  content_type: z.enum(CONTENT_TYPE_ALLOWLIST),
  size_bytes: z.number().int().min(1).max(EVIDENCE_MAX_BYTES),
});

// 024 (T032) · respuesta de uploadOrderEvidence: `object_ref` con el mismo formato que EvidenceRef.object_ref.
export const uploadEvidenceResponseSchema = z.object({
  object_ref: z.string(),
});

export const executionRequestSchema = z.object({
  notes: z.string().min(1).max(2000).refine((s) => /\S/.test(s), 'notas: ≥1 carácter imprimible'),
  evidence: z.array(evidenceRefSchema).min(1).max(EVIDENCE_MAX_ITEMS),
});

// ── Write-side del dispatcher (FE-3, FR-002/FR-014) ──────────────────────────────────────────────
// Derivado del contrato (ReassignmentRequest). assignee_id = UUID; reason 1..500 code points con ≥1
// imprimible; nunca viaja el actor (server-side).
// Forma general de UUID (8-4-4-4-12 hex), SIN fijar la versión: el backend emite UUIDv7 (p. ej.
// 018f1000-0000-7000-8000-...), así que pinar v1–v5 rechazaría destinos legítimos. Es solo un chequeo de
// formato en cliente; la validez real del destino la decide el backend (INVALID_ASSIGNEE).
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Longitud del motivo contada por CODE POINT (no por unidad UTF-16) — spec Edge Cases.
export const REASON_MAX_CODEPOINTS = 500;
export function reasonHasPrintable(s: string): boolean {
  return [...s].some((ch) => {
    const c = ch.codePointAt(0) ?? 0;
    return c > 0x20 && c !== 0x7f;
  });
}

export const reassignmentRequestSchema = z.object({
  assignee_id: z.string().regex(UUID_RE, 'assignee_id: formato UUID no válido'),
  reason: z
    .string()
    .refine((s) => [...s].length >= 1 && [...s].length <= REASON_MAX_CODEPOINTS, 'motivo: 1..500 code points')
    .refine(reasonHasPrintable, 'motivo: ≥1 carácter imprimible'),
});

// ── Write-side del supervisor (FE-4, FR-002/FR-006) ──────────────────────────────────────────────
// Derivado del contrato (ReviewRequest). `reason` opcional a nivel de esquema (obligatorio en reject lo
// exige el componente). Cota de payload cruda 4000 (igual que el contrato); la longitud efectiva
// 1..1000 la mide el BACKEND tras saneo (INVALID_REASON) — el cliente NO es más estricto (evita falsos
// rechazos con whitespace, misma lección que el UUIDv7 de FE-3).
export const REVIEW_REASON_MAX_RAW = 4000;

export const reviewRequestSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  reason: z.string().max(REVIEW_REASON_MAX_RAW).optional(),
});

// Respuesta del resumen IA (007): el cliente distingue por `sufficient` (no por heurística de texto).
export const incidentSummaryResponseSchema = z.object({
  summary: z.string().nullable(),
  sufficient: z.boolean(),
});

export const userIdentitySchema = z.object({
  id: z.string(),
  email: z.string(),
  username: z.string(),
  role: z.enum(['dispatcher', 'technician', 'supervisor']),
});

// ── Gate de divergencia contrato↔Zod (FR-016 / SC-008b) ────────────────────────────────────────────
// tsc FALLA si el Zod deja de coincidir con los tipos generados del contrato (p. ej. un estado nuevo o
// un campo renombrado en orders.openapi.yaml). Complementa a `codegen:check` (que cubre los tipos TS).
type ZodOrder = z.infer<typeof orderSchema>;
type ZodOrderStatus = z.infer<typeof orderStatusSchema>;
type AssertAssignable<A, B extends A> = B;

// Bidireccional = equivalencia estructural (Order y OrderStatus no tienen opcionales → sin fricción
// con exactOptionalPropertyTypes). Los opcionales de OrderDetailResponse se validan en runtime (Zod).
export type _OrderStatusFwd = AssertAssignable<OrderStatus, ZodOrderStatus>;
export type _OrderStatusBack = AssertAssignable<ZodOrderStatus, OrderStatus>;
export type _OrderFwd = AssertAssignable<Order, ZodOrder>;
export type _OrderBack = AssertAssignable<ZodOrder, Order>;

// Write-side: el Zod de request debe coincidir con el tipo generado del contrato (FR-008/SC-005).
type ZodEvidenceRef = z.infer<typeof evidenceRefSchema>;
type ZodExecutionRequest = z.infer<typeof executionRequestSchema>;
export type _EvidenceFwd = AssertAssignable<EvidenceRef, ZodEvidenceRef>;
export type _EvidenceBack = AssertAssignable<ZodEvidenceRef, EvidenceRef>;
export type _ExecFwd = AssertAssignable<ExecutionRequest, ZodExecutionRequest>;
export type _ExecBack = AssertAssignable<ZodExecutionRequest, ExecutionRequest>;
type ZodReassignmentRequest = z.infer<typeof reassignmentRequestSchema>;
export type _ReassignFwd = AssertAssignable<ReassignmentRequest, ZodReassignmentRequest>;
export type _ReassignBack = AssertAssignable<ZodReassignmentRequest, ReassignmentRequest>;
// ReviewRequest: `decision` se asegura estructuralmente; el `reason` opcional no se asserta
// bidireccionalmente por la fricción de exactOptionalPropertyTypes (`.optional()` de Zod añade
// `| undefined`, incompatible con `reason?: string`). El drift de tipos lo cubre `codegen:check` y el
// runtime lo valida `reviewRequestSchema.parse`. Se asegura al menos el enum de decisión:
type ZodReviewDecision = z.infer<typeof reviewRequestSchema>['decision'];
export type _ReviewDecisionFwd = AssertAssignable<ReviewRequest['decision'], ZodReviewDecision>;
export type _ReviewDecisionBack = AssertAssignable<ZodReviewDecision, ReviewRequest['decision']>;
type ZodIncidentSummary = z.infer<typeof incidentSummaryResponseSchema>;
export type _SummaryFwd = AssertAssignable<IncidentSummaryResponse, ZodIncidentSummary>;
export type _SummaryBack = AssertAssignable<ZodIncidentSummary, IncidentSummaryResponse>;

// 024 · EvidenceMeta (items[] compatible). `items` no se asserta bidireccionalmente por la misma fricción
// de exactOptionalPropertyTypes que ReviewRequest.reason (`.optional()` de Zod añade explícitamente
// `| undefined`, incompatible con `items?: T[]`); se asserta count/content_types (el resto del contrato) y
// SOLO el elemento de `items` (evidence_id/content_type), no la opcionalidad del array en sí.
type ZodEvidenceMeta = z.infer<typeof evidenceMetaSchema>;
export type _EvidenceMetaFwd = AssertAssignable<
  Omit<EvidenceMeta, 'items'>,
  Omit<ZodEvidenceMeta, 'items'>
>;
export type _EvidenceMetaBack = AssertAssignable<
  Omit<ZodEvidenceMeta, 'items'>,
  Omit<EvidenceMeta, 'items'>
>;
type ZodEvidenceItem = z.infer<typeof evidenceItemSchema>;
export type _EvidenceItemFwd = AssertAssignable<EvidenceMeta['items'] extends (infer I)[] | undefined ? I : never, ZodEvidenceItem>;
export type _EvidenceItemBack = AssertAssignable<ZodEvidenceItem, EvidenceMeta['items'] extends (infer I)[] | undefined ? I : never>;
type ZodUploadEvidenceResponse = z.infer<typeof uploadEvidenceResponseSchema>;
export type _UploadEvidenceFwd = AssertAssignable<UploadEvidenceResponse, ZodUploadEvidenceResponse>;
export type _UploadEvidenceBack = AssertAssignable<ZodUploadEvidenceResponse, UploadEvidenceResponse>;
