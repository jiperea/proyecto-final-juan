import { z } from 'zod';
import type { EvidenceRef, ExecutionRequest, Order, OrderStatus, ReassignmentRequest } from './types';

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

export const orderDetailResponseSchema = z.object({
  order: orderSchema,
  notes: z.string().optional(),
  evidence: z.object({ count: z.number(), content_types: z.array(z.string()) }).optional(),
  last_rejection_reason: z.string().optional(),
});

// ── Write-side del técnico (FE-2, FR-004/FR-005/FR-008) ──────────────────────────────────────────
// Derivado del contrato (EvidenceRef/ExecutionRequest). El binario NO viaja; solo metadato.
export const CONTENT_TYPE_ALLOWLIST = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'] as const;
export const EVIDENCE_MAX_BYTES = 26214400; // 25 MiB (contrato)
export const EVIDENCE_MAX_ITEMS = 10;

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
