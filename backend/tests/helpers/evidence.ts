import request from 'supertest';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import { stageBlob } from './evidence-storage';

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

export interface CommitRealEvidenceResult {
  readonly evidenceId: string;
  readonly objectRef: string;
  readonly auditId: string;
}

export interface CommitRealEvidenceOptions {
  readonly app: Express;
  readonly prisma: PrismaClient;
  readonly baseDir: string;
  readonly encKey: string;
  readonly ownerId: string;
  readonly orderId: string;
  readonly token: string;
  readonly bytes: Buffer;
  readonly contentType: string;
  readonly notes?: string;
}

// Helper de test (024, US2): fabrica una fila `OrderEvidence` REAL y COMMITTEADA (con blob real en el mismo
// `StoragePort` de filesystem que la app bajo prueba) subiendo por el flujo legítimo — `stageBlob` (mismo
// baseDir/encKey) seguido de `submitOrderExecution` real vía HTTP —, en vez de insertar filas sintéticas.
// Requiere que la orden esté `in_progress` y `ownerId` == técnico dueño (igual que el flujo real). Devuelve
// el `evidenceId` opaco (fila recién commiteada) para ejercitar `getOrderEvidence` (T022/T024/T025/T026/T052).
export async function commitRealEvidence(opts: CommitRealEvidenceOptions): Promise<CommitRealEvidenceResult> {
  const ref = await stageBlob({
    baseDir: opts.baseDir,
    encKey: opts.encKey,
    ownerId: opts.ownerId,
    orderId: opts.orderId,
    bytes: opts.bytes,
    contentType: opts.contentType,
  });
  const res = await request(opts.app)
    .post(`/v1/orders/${opts.orderId}/execution`)
    .set('Authorization', `Bearer ${opts.token}`)
    .send({
      notes: opts.notes ?? 'evidencia real para getOrderEvidence (024, US2)',
      evidence: [{ object_ref: ref, content_type: opts.contentType, size_bytes: opts.bytes.length }],
    });
  if (res.status !== 200) {
    throw new Error(`commitRealEvidence: submitOrderExecution falló (status=${res.status}, body=${JSON.stringify(res.body)})`);
  }
  const row = await opts.prisma.orderEvidence.findFirst({ where: { orderId: opts.orderId, objectRef: ref } });
  if (row === null) {
    throw new Error('commitRealEvidence: no se encontró la fila OrderEvidence recién commiteada');
  }
  return { evidenceId: row.id, objectRef: ref, auditId: row.auditId };
}
