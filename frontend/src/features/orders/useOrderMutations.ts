import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ExecutionRequest } from '../../api/types';
import { startOrderWork, submitOrderExecution } from './write-api';

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
