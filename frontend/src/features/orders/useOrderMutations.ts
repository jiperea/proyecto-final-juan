import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../../api/client';
import type { ExecutionRequest, ReassignmentRequest, ReviewRequest } from '../../api/types';
import { reassignOrder, reviewOrder, startOrderWork, submitOrderExecution } from './write-api';

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

export function useSubmitExecution(orderId: string) {
  const invalidate = useInvalidateOrder(orderId);
  return useMutation({
    mutationFn: (body: ExecutionRequest) => submitOrderExecution(orderId, body),
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
