import { useRef, useState } from 'react';
import { ApiError } from '../../api/client';
import { REASON_MAX_CODEPOINTS, UUID_RE, reasonHasPrintable } from '../../api/schemas';
import { Button, TextArea, TextField } from '../../ui';
import type { Order } from '../../api/types';
import { useReassign } from './useOrderMutations';

const REASON_MAX = REASON_MAX_CODEPOINTS;
const DESTINO_HINT =
  'Identificador (UUID) del técnico destino. Lo obtienes fuera de la app (roster del equipo o el propio técnico / su responsable).';
const DESTINO_INVALID = 'Introduce un identificador con formato UUID válido.';
const REASON_HINT = 'Motivo breve de la reasignación (1–500 caracteres).';

// FR-002/004/005/013/014/017: reasignar (dispatcher). Entrada manual del UUID destino (validada en
// cliente, obtenida fuera de banda) + motivo. El botón NO se gatea por validez (siempre accionable);
// la validación corre al enviar. Éxito → onReassigned (el detalle cierra el form, enfoca y anuncia).
export function ReassignForm({
  orderId,
  onReassigned,
}: {
  orderId: string;
  onReassigned: (updated: Order) => void;
}) {
  const mutation = useReassign(orderId);
  const [assignee, setAssignee] = useState('');
  const [reason, setReason] = useState('');
  const [assigneeError, setAssigneeError] = useState<string | undefined>(undefined);
  const [reasonError, setReasonError] = useState<string | undefined>(undefined);
  const alertRef = useRef<HTMLParagraphElement>(null);

  // Errores de backend mapeados por código: a campo (VALIDATION_ERROR→motivo, INVALID_ASSIGNEE→destino)
  // o a la alerta general (FORBIDDEN_ROLE/401/404/500/red) — FR-006/007/009/010/015/016.
  const backendErr = mutation.error instanceof ApiError ? mutation.error : null;
  const backendCode = backendErr?.code;
  const assigneeBackendError = backendCode === 'INVALID_ASSIGNEE' ? backendErr?.userMessage : undefined;
  const reasonBackendError = backendCode === 'VALIDATION_ERROR' ? backendErr?.userMessage : undefined;
  const generalError =
    mutation.isError && backendCode !== 'INVALID_ASSIGNEE' && backendCode !== 'VALIDATION_ERROR'
      ? (backendErr?.userMessage ?? 'No se pudo reasignar. Reinténtalo.')
      : undefined;

  function validateAssignee(): string | undefined {
    const v = assignee.trim();
    return UUID_RE.test(v) ? undefined : DESTINO_INVALID;
  }
  function validateReason(): string | undefined {
    const cps = [...reason].length; // conteo por code point (no UTF-16) — spec Edge Cases
    return cps >= 1 && cps <= REASON_MAX && reasonHasPrintable(reason)
      ? undefined
      : `Escribe un motivo (1..${REASON_MAX} caracteres, con contenido).`;
  }

  function submit() {
    if (mutation.isPending) return; // sin doble envío (FR-004)
    // Validación de cliente al enviar: AMBOS errores a la vez, sin llamar al backend (FR-005/014/017).
    const aErr = validateAssignee();
    const rErr = validateReason();
    setAssigneeError(aErr);
    setReasonError(rErr);
    if (aErr || rErr) return;
    mutation.mutate(
      { assignee_id: assignee.trim(), reason },
      {
        onSuccess: (updated) => onReassigned(updated),
        onError: () => alertRef.current?.focus(), // foco al error (perceptible)
      },
    );
  }

  return (
    <form
      className="reassign-form"
      noValidate
      aria-busy={mutation.isPending}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <TextField
        label="Técnico destino"
        value={assignee}
        hint={DESTINO_HINT}
        error={assigneeError ?? assigneeBackendError}
        autoComplete="off"
        inputMode="text"
        onChange={(e) => {
          setAssignee(e.target.value);
          if (assigneeError) setAssigneeError(undefined); // limpia al editar; re-evalúa en blur/submit
        }}
        onBlur={() => setAssigneeError(assignee.trim() === '' ? undefined : validateAssignee())}
      />
      <TextArea
        label="Motivo de la reasignación"
        value={reason}
        hint={REASON_HINT}
        required
        error={reasonError ?? reasonBackendError}
        onChange={(e) => {
          setReason(e.target.value);
          if (reasonError) setReasonError(undefined);
        }}
      />
      {generalError ? (
        <p ref={alertRef} tabIndex={-1} className="field__error" role="alert">
          {generalError}
        </p>
      ) : null}
      <Button
        type="submit"
        aria-busy={mutation.isPending}
        aria-disabled={mutation.isPending || undefined}
      >
        {mutation.isPending ? 'Reasignando…' : 'Reasignar'}
      </Button>
    </form>
  );
}
