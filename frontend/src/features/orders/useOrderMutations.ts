import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../../api/client';
import type { EvidenceRef, ReassignmentRequest, ReviewRequest } from '../../api/types';
import type { EvidenceItem } from './evidence';
import {
  reassignOrder,
  reviewOrder,
  startOrderWork,
  submitOrderExecution,
  uploadOrderEvidence,
} from './write-api';

// Invalida el detalle y el listado tras una mutación exitosa (refleja el nuevo estado sin recarga completa).
function useInvalidateOrder(orderId: string) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['order', orderId] });
    void qc.invalidateQueries({ queryKey: ['orders'] });
  };
}

export function useStartWork(orderId: string) {
  const invalidate = useInvalidateOrder(orderId);
  return useMutation({ mutationFn: () => startOrderWork(orderId), onSuccess: invalidate });
}

// 024 (T032): antes de enviar la ejecución, cada foto se SUBE de verdad (endpoint nuevo
// `uploadOrderEvidence`, multipart, staging cifrado); el `object_ref` que consume `submitOrderExecution`
// es el DEVUELTO por el backend, no el placeholder de cliente (FR-012). Secuencial (no en paralelo): si
// una sube falla (415/413/422), las siguientes no se intentan y el error se propaga tal cual (mismo
// ApiError/userMessage que el resto de mutaciones).
export function useSubmitExecution(orderId: string) {
  const invalidate = useInvalidateOrder(orderId);
  return useMutation({
    mutationFn: async ({ notes, items }: { notes: string; items: EvidenceItem[] }) => {
      const evidence: EvidenceRef[] = [];
      for (const item of items) {
        const uploaded = await uploadOrderEvidence(orderId, item.file);
        evidence.push({
          object_ref: uploaded.object_ref,
          content_type: item.ref.content_type,
          size_bytes: item.ref.size_bytes,
        });
      }
      return submitOrderExecution(orderId, { notes, evidence });
    },
    onSuccess: invalidate,
  });
}

export function useReassign(orderId: string) {
  const invalidate = useInvalidateOrder(orderId);
  return useMutation({
    mutationFn: (body: ReassignmentRequest) => reassignOrder(orderId, body),
    onSuccess: invalidate,
    // FR-008: si la orden dejó de ser reasignable (404 genérico), refresca detalle+listado para que el
    // panel deje de mostrar datos obsoletos (el detalle refetch-eará y mostrará el estado no-disponible).
    onError: (err) => {
      if (err instanceof ApiError && err.status === 404) invalidate();
    },
  });
}

// FE-4 · decisión de revisión del supervisor. Al éxito invalida detalle+listado (la orden decidida sale
// de la cola pending_review, FR-003); en 404 (ya no visible) invalida para limpiar el detalle (FR-008).
export function useReview(orderId: string) {
  const invalidate = useInvalidateOrder(orderId);
  return useMutation({
    mutationFn: (body: ReviewRequest) => reviewOrder(orderId, body),
    onSuccess: invalidate,
    onError: (err) => {
      if (err instanceof ApiError && err.status === 404) invalidate();
    },
  });
}
