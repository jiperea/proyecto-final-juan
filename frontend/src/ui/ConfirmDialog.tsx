import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Button } from './Button';

// FR-017 · primer diálogo modal del design system. alertdialog accesible: foco inicial dentro, foco
// ATRAPADO mientras está abierto, Esc/Cancelar cierran, click en overlay NO cierra (acción irreversible),
// y RETORNO del foco al elemento que lo abrió. Solo tokens (sin estilos sueltos).
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  confirmVariant = 'primary',
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: 'primary' | 'danger';
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  // Ref a la última onCancel para NO re-ejecutar el efecto (y recapturar el disparador) si el padre
  // re-renderiza con una arrow inline mientras el diálogo sigue abierto (I-006).
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  // Foco inicial + retorno + Esc/focus-trap. Depende SOLO de `open` (la captura del disparador y el
  // retorno de foco se hacen una vez por apertura). El keydown se adjunta imperativamente al nodo del
  // diálogo (no como handler JSX) — patrón a11y estándar, sin jsx-a11y/no-noninteractive-element-interactions.
  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    confirmRef.current?.focus(); // foco inicial dentro del diálogo
    const node = dialogRef.current;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCancelRef.current();
        return;
      }
      if (e.key !== 'Tab' || !node) return;
      const items = Array.from(
        node.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input, [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    node?.addEventListener('keydown', handleKeyDown);
    return () => {
      node?.removeEventListener('keydown', handleKeyDown);
      restoreRef.current?.focus(); // retorno de foco al disparador al cerrar
    };
  }, [open]);

  if (!open) return null;

  return (
    // El overlay NO cierra al hacer click (patrón alertdialog estricto para acción irreversible).
    <div className="dialog-overlay">
      <div ref={dialogRef} className="dialog" role="alertdialog" aria-modal="true" aria-label={title}>
        <h2 className="dialog__title">{title}</h2>
        {children ? <div className="dialog__body">{children}</div> : null}
        <div className="dialog__actions">
          <Button variant="secondary" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            ref={confirmRef}
            variant={confirmVariant}
            onClick={onConfirm}
            aria-busy={busy}
            aria-disabled={busy || undefined}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
