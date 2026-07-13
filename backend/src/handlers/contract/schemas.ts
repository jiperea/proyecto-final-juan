import { z } from 'zod';

// Esquemas Zod derivados del contrato OpenAPI (Constitution II). `strict()` → additionalProperties:false.
export const loginRequestSchema = z
  .object({
    identifier: z.string().min(1).max(320),
    password: z.string().min(12).max(200),
  })
  .strict();

export type LoginRequestDto = z.infer<typeof loginRequestSchema>;

// 004 — cuerpo de reasignación. reason: 1..500 CODE POINTS (no UTF-16), con ≥1 carácter imprimible
// (rechaza vacío/whitespace/sólo control \p{Cc}/\p{Cf}, FR-006). assignee_id uuid (malformado → VALIDATION_ERROR,
// distinto de INVALID_ASSIGNEE que es uuid válido que no resuelve). `.strict()` → additionalProperties:false
// (un `actor`/campo extra en el body se rechaza; el actor sale del token, FR-008).
const REASSIGN_REASON_MAX = 500;
export const reassignRequestSchema = z
  .object({
    assignee_id: z.string().uuid(),
    reason: z
      .string()
      .refine((s) => [...s].length >= 1 && [...s].length <= REASSIGN_REASON_MAX, {
        message: 'reason debe tener entre 1 y 500 code points',
      })
      .refine((s) => /[^\s\p{Cc}\p{Cf}]/u.test(s), {
        message: 'reason debe contener al menos un carácter imprimible',
      }),
  })
  .strict();

export type ReassignRequestDto = z.infer<typeof reassignRequestSchema>;

// 005 — cuerpo del registro de ejecución. `.strict()` → additionalProperties:false (rechaza un `actor`/campo
// extra en el body; el actor sale del token, FR-007). La validación ESTRUCTURAL vive aquí (tipos + forma);
// las reglas CODIFICADAS con precedencia propia (evidencia antes que notas; EVIDENCE_REQUIRED vs
// INVALID_EVIDENCE vs VALIDATION_ERROR) viven en el DOMINIO (evidence.ts / submit-execution.ts), porque Zod
// sólo emite un VALIDATION_ERROR genérico y no garantiza el orden evidencia→notas exigido por FR-003/005.
const evidenceRefSchema = z
  .object({
    object_ref: z.string(),
    content_type: z.string(),
    size_bytes: z.number().int(),
  })
  .strict();

export const executionRequestSchema = z
  .object({
    notes: z.string(),
    evidence: z.array(evidenceRefSchema),
  })
  .strict();

export type ExecutionRequestDto = z.infer<typeof executionRequestSchema>;

// 006 — cuerpo de la decisión de revisión. `.strict()` → additionalProperties:false (rechaza un `actor_id`/campo
// extra; el actor sale del token, FR-012). `decision` enum (ausente/otro → VALIDATION_ERROR). `reason` OPCIONAL
// con una cota CRUDA generosa (≤4000 code points, red de seguridad de payload → VALIDATION_ERROR). La
// obligatoriedad por `decision`, el saneo y la longitud EFECTIVA 1..1000 (medida TRAS sanitizeReason →
// INVALID_REASON) viven en el DOMINIO (review-order.ts / sanitize-reason.ts), NO aquí (G2/K2): un motivo con
// mucho whitespace puede superar 1000 en crudo y ser válido tras saneo.
const REVIEW_REASON_RAW_MAX = 4000;
export const reviewRequestSchema = z
  .object({
    decision: z.enum(['approve', 'reject']),
    reason: z
      .string()
      .refine((s) => [...s].length <= REVIEW_REASON_RAW_MAX, {
        message: 'reason excede la cota cruda de payload',
      })
      .optional(),
  })
  .strict();

export type ReviewRequestDto = z.infer<typeof reviewRequestSchema>;
