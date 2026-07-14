import { ApiError } from '../../api/client';
import { Button, InlineError } from '../../ui';
import { useStartWork } from './useOrderMutations';

// FR-001: iniciar trabajo (assigned→in_progress). Estado en vuelo accesible (aria-busy); error mapeado
// (422 INVALID_TRANSITION → mensaje del contrato) sin romper la vista (FR-006/F-001).
export function StartWorkButton({ orderId }: { orderId: string }) {
  const mutation = useStartWork(orderId);
  const busy = mutation.isPending;
  return (
    <div>
      <Button
        onClick={() => mutation.mutate()}
        disabled={busy}
        aria-busy={busy}
      >
        {busy ? 'Iniciando…' : 'Iniciar trabajo'}
      </Button>
      {mutation.isError ? (
        <InlineError>
          {mutation.error instanceof ApiError ? mutation.error.userMessage : 'No se pudo iniciar. Reinténtalo.'}
        </InlineError>
      ) : null}
    </div>
  );
}
