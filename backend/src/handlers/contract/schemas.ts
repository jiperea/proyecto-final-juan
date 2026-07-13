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
