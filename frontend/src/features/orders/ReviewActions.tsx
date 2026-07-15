import { useRef, useState } from 'react';
import { ApiError } from '../../api/client';
import { reasonHasPrintable } from '../../api/schemas';
import { Button, ConfirmDialog, TextArea } from '../../ui';
import type { Order } from '../../api/types';
import { useReview } from './useOrderMutations';

// FR-001/002/004/005/006/007/009/017 · acciones de revisión del supervisor. Aprobar → ConfirmDialog
// (alertdialog, irreversible → closed). Rechazar → motivo obligatorio. El botón NO se gatea por validez
// (validación al enviar). Éxito → onReviewed (el detalle anuncia + enfoca). El componente solo muta ante
// una acción explícita del usuario (no auto-reintenta; FR-009b).
export function ReviewActions({
  orderId,
  evidenceCount,
  onReviewed,
}: {
  orderId: string;
  evidenceCount: number | undefined;
  onReviewed: (updated: Order) => void;
}) {
  const mutation = useReview(orderId);
  const [rejecting, setRejecting] = useState(false);
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | undefined>(undefined);
  const alertRef = useRef<HTMLParagraphElement>(null);

  // evidence.count===0 → no se puede aprobar (dato ya en el detalle); además del 409 defensivo (FR-007).
  const approveBlocked = evidenceCount === 0;

  const backendErr = mutation.error instanceof ApiError ? mutation.error : null;
  const reasonBackendError = backendErr?.code === 'INVALID_REASON' ? backendErr.userMessage : undefined;
  const generalError =
    mutation.isError && backendErr?.code !== 'INVALID_REASON'
      ? (backendErr?.userMessage ?? 'No se pudo aplicar la decisión. Reinténtalo.')
      : undefined;

  function doApprove() {
    setConfirmApprove(false);
    mutation.mutate(
      { decision: 'approve' },
      { onSuccess: onReviewed, onError: () => alertRef.current?.focus() },
    );
  }

  function submitReject() {
    if (mutation.isPending) return;
    // Pre-check de cliente (FR-004): ≥1 imprimible y ≤1000 code points. La longitud se mide sobre el
    // motivo trim + colapso de whitespace interno (espeja el saneo del backend para no falsear el límite);
    // la autoridad final sigue siendo el backend (INVALID_REASON).
    const effective = [...reason.trim().replace(/\s+/g, ' ')].length;
    if (!reasonHasPrintable(reason)) {
      setReasonError('Escribe un motivo para el rechazo.');
      return;
    }
    if (effective > 1000) {
      setReasonError('El motivo no puede superar los 1000 caracteres.');
      return;
    }
    setReasonError(undefined);
    mutation.mutate(
      { decision: 'reject', reason },
      { onSuccess: onReviewed, onError: () => alertRef.current?.focus() },
    );
  }

  return (
    <div className="review-actions" aria-busy={mutation.isPending}>
      {!rejecting ? (
        <div className="review-actions__buttons">
          <Button
            onClick={() => setConfirmApprove(true)}
            disabled={approveBlocked}
            aria-disabled={approveBlocked || undefined}
          >
            Aprobar
          </Button>
          <Button variant="secondary" onClick={() => setRejecting(true)}>
            Rechazar
          </Button>
          {approveBlocked ? (
            <p className="field__hint">No se puede aprobar sin evidencia.</p>
          ) : null}
        </div>
      ) : (
        <form
          className="review-actions__reject"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            submitReject();
          }}
        >
          <TextArea
            label="Motivo del rechazo"
            value={reason}
            hint="Explica por qué se rechaza; volverá al técnico para corregir."
            error={reasonError ?? reasonBackendError}
            onChange={(e) => {
              setReason(e.target.value);
              if (reasonError) setReasonError(undefined);
            }}
          />
          <div className="review-actions__buttons">
            <Button
              type="submit"
              variant="danger"
              aria-busy={mutation.isPending}
              aria-disabled={mutation.isPending || undefined}
            >
              {mutation.isPending ? 'Enviando…' : 'Confirmar rechazo'}
            </Button>
            <Button variant="secondary" onClick={() => setRejecting(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      )}

      {generalError ? (
        <p ref={alertRef} tabIndex={-1} className="field__error" role="alert">
          {generalError}
        </p>
      ) : null}

      <ConfirmDialog
        open={confirmApprove}
        title="¿Aprobar y cerrar la orden?"
        confirmLabel="Confirmar"
        confirmVariant="primary"
        busy={mutation.isPending}
        onConfirm={doApprove}
        onCancel={() => setConfirmApprove(false)}
      >
        Esta acción cierra la orden y no se puede deshacer.
      </ConfirmDialog>
    </div>
  );
}
