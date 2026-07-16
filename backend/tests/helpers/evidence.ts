import request from 'supertest';
import type { Express } from 'express';

// Helpers HTTP para los endpoints de evidencia (024): uploadOrderEvidence (multipart) y getOrderEvidence
// (binario). Ambos endpoints AÚN NO EXISTEN (fase Red, T012-T017/T050/T051) — hasta que `dev-backend` los
// implemente, cualquier llamada cae en el 404 genérico de Express (ruta no registrada), no en el contrato
// `{code,message,...}` — por eso los tests que dependen de esta ayuda fallan por la razón correcta (el
// endpoint no existe todavía), y no por un typo/import roto.

export function uploadEvidence(
  app: Express,
  orderId: string,
  tok: string | null,
  buffer: Buffer,
  opts: { filename?: string; contentType?: string } = {},
): request.Test {
  const req = request(app).post(`/v1/orders/${orderId}/evidence`);
  const withAuth = tok ? req.set('Authorization', `Bearer ${tok}`) : req;
  return withAuth.attach('file', buffer, {
    filename: opts.filename ?? 'evidencia.jpg',
    contentType: opts.contentType ?? 'image/jpeg',
  });
}

export function getEvidence(app: Express, orderId: string, evidenceId: string, tok: string | null): request.Test {
  const req = request(app).get(`/v1/orders/${orderId}/evidence/${evidenceId}`);
  return tok ? req.set('Authorization', `Bearer ${tok}`) : req;
}
