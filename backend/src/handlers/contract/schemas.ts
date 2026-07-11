import { z } from 'zod';

// Esquemas Zod derivados del contrato OpenAPI (Constitution II). `strict()` → additionalProperties:false.
export const loginRequestSchema = z
  .object({
    identifier: z.string().min(1).max(320),
    password: z.string().min(12).max(200),
  })
  .strict();

export type LoginRequestDto = z.infer<typeof loginRequestSchema>;
