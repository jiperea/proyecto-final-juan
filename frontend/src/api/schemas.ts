import { z } from 'zod';
import type { Order, OrderStatus } from './types';

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
