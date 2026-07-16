import { useRef, useState } from 'react';
import { ApiError } from '../../api/client';
import { Button, TextArea } from '../../ui';
import { useSession } from '../auth/session';
import type { EvidenceItem } from './evidence';
import { EvidencePicker } from './EvidencePicker';
import { useExecutionDraft } from './useExecutionDraft';
import { useSubmitExecution } from './useOrderMutations';

// FR-002/003/005/009: registrar ejecución (notas + ≥1 evidencia) y enviar a revisión.
export function ExecutionForm({ orderId }: { orderId: string }) {
  const { user } = useSession();
  const draft = useExecutionDraft(user?.userId ?? 'anon', orderId);
  const [items, setItems] = useState<EvidenceItem[]>([]); // evidencias en memoria (no se persisten, H-101)
  const mutation = useSubmitExecution(orderId);
  const errorRef = useRef<HTMLParagraphElement>(null);

  // >=1 caracter imprimible: code point > 0x20 (no whitespace/control) y != 0x7f (DEL) - FR-003.
  const hasPrintable = [...draft.notes].some((ch) => {
    const c = ch.codePointAt(0) ?? 0;
    return c > 0x20 && c !== 0x7f;
  });
  const notesValid = draft.notes.length >= 1 && draft.notes.length <= 2000 && hasPrintable;
  const canSubmit = notesValid && items.length >= 1 && !mutation.isPending;

  // F-002: si el backend responde VALIDATION_ERROR, el mensaje se asocia al CAMPO de notas (aria-describedby),
  // no solo a la alerta genérica; el resto de códigos (INVALID_TRANSITION, etc.) van a la alerta del formulario.
  const backendErr = mutation.error instanceof ApiError ? mutation.error : null;
  const notesFieldError =
    !notesValid && draft.notes.length > 0
      ? 'Escribe unas notas (1..2000 caracteres, con contenido).'
      : backendErr?.code === 'VALIDATION_ERROR'
        ? backendErr.userMessage
        : undefined;

  function submit() {
    if (!canSubmit) return;
    // 024 (T032): la mutación sube cada foto real (uploadOrderEvidence) y luego envía la ejecución con
    // los object_ref devueltos por el backend (FR-012).
    mutation.mutate(
      { notes: draft.notes, items },
      {
        onSuccess: () => draft.clear(), // limpia el borrador tras enviar (FR-009)
        onError: () => errorRef.current?.focus(), // foco al error (F-008)
      },
    );
  }

  return (
    <form
      className="execution-form"
      aria-busy={mutation.isPending}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <TextArea
        label="Notas de la ejecución"
        value={draft.notes}
        maxLength={2000}
        required
        error={notesFieldError}
        onChange={(e) => draft.setNotes(e.target.value)}
      />

      <EvidencePicker items={items} onChange={setItems} />

      {/* Alerta general SOLO para códigos no asociados a un campo (INVALID_TRANSITION, EVIDENCE_REQUIRED, red…);
          VALIDATION_ERROR se muestra en el campo de notas (F-002). */}
      {mutation.isError && backendErr?.code !== 'VALIDATION_ERROR' ? (
        <p ref={errorRef} tabIndex={-1} className="field__error" role="alert">
          {backendErr ? backendErr.userMessage : 'No se pudo enviar. Reinténtalo.'}
        </p>
      ) : null}

      <Button type="submit" disabled={!canSubmit} aria-busy={mutation.isPending}>
        {mutation.isPending ? 'Enviando…' : 'Enviar a revisión'}
      </Button>
    </form>
  );
}
