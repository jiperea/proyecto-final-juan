import { useQuery } from '@tanstack/react-query';
import { apiFetch, apiFetchBlob } from '../../api/client';
import { orderDetailResponseSchema, orderListResponseSchema } from '../../api/schemas';
import type { Role } from '../../api/types';

// FR-006/009b: listado por rol. Clave incluye el rol → purga por rol (FR-029). refetch-on-mount (queryClient).
// El tipo se infiere del schema Zod (fuente validada en el boundary, FR-016).
export function useOrderList(role: Role) {
  return useQuery({
    queryKey: ['orders', role],
    queryFn: async () => orderListResponseSchema.parse(await apiFetch<unknown>('/v1/orders')),
  });
}

// FR-011: detalle read-only. refetch-on-mount + «Actualizar».
export function useOrderDetail(orderId: string | undefined) {
  return useQuery({
    queryKey: ['order', orderId],
    enabled: orderId !== undefined,
    queryFn: async () =>
      orderDetailResponseSchema.parse(await apiFetch<unknown>(`/v1/orders/${orderId}`)),
  });
}

// 024 · FR-010/FR-013: binario de una evidencia. `enabled` la mantiene perezosa (solo al abrir la foto,
// no precargada con el detalle); fetch autenticado same-origin → Blob (nunca se expone la URL firmada/
// token en el DOM). No hay reintento automático en error salvo `refetch()` explícito del usuario.
export function useOrderEvidence(orderId: string, evidenceId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['order-evidence', orderId, evidenceId],
    enabled,
    retry: false,
    queryFn: async () => apiFetchBlob(`/v1/orders/${orderId}/evidence/${evidenceId}`),
  });
}
