import { useEffect, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import { ApiError } from '../../api/client';
import { FALLBACK_MESSAGE, OFFLINE_MESSAGE, messageForCode } from '../../i18n/errors';
import { InlineError, Spinner } from '../../ui';
import { useOrderEvidence } from './useOrders';

export interface EvidenceViewerItem {
  evidence_id: string;
  content_type: string;
}

// 025 · Visor ampliado de evidencia (lightbox + carrusel). Reutiliza el patrón de foco de
// `ConfirmDialog` (foco inicial dentro, focus-trap Tab/Shift+Tab, Esc cierra, retorno de foco al
// disparador) con UNA diferencia deliberada: aquí el backdrop SÍ cierra (no es una acción
// irreversible como en ConfirmDialog). Se monta/desmonta por completo desde el padre (condicional
// sobre `viewerIndex`), de modo que abrir siempre es una instancia fresca (sin overlays duplicados
// al reabrir) y el desmontaje dispara la limpieza de object URLs (FR-013/FR-014).
export function EvidenceViewer({
  orderId,
  items,
  startIndex,
  onClose,
}: {
  orderId: string;
  items: EvidenceViewerItem[];
  startIndex: number; // 0-based
  onClose: () => void;
}) {
  const [index, setIndex] = useState(startIndex);
  const [decodeFailed, setDecodeFailed] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const total = items.length;
  const current = items[index]!;
  const position = index + 1;
  const label = `Imagen ${position}`;

  // El binario se obtiene por el flujo fetch→blob existente (`useOrderEvidence`/`apiFetchBlob`); al
  // navegar, la clave de query cambia con `evidence_id` — react-query mantiene el estado de
  // carga/error POR clave (por índice), de modo que una respuesta tardía de una posición abandonada
  // nunca sobrescribe la imagen vigente (FR-008: guard de carrera implícito en el keying).
  const query = useOrderEvidence(orderId, current.evidence_id, true);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    setDecodeFailed(false);
  }, [index]);

  useEffect(() => {
    if (!query.data) {
      setBlobUrl(null);
      return undefined;
    }
    const url = URL.createObjectURL(query.data);
    setBlobUrl(url);
    return () => URL.revokeObjectURL(url); // FR-013/FR-014: revoca al cambiar de imagen o al desmontar
  }, [query.data]);

  // Foco inicial + retorno + Esc/flechas/focus-trap. Se ejecuta una vez por montaje (instancia fresca
  // en cada apertura); `total` es estable durante la vida del visor.
  useEffect(() => {
    restoreRef.current = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const node = dialogRef.current;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key === 'ArrowRight') {
        setIndex((i) => Math.min(i + 1, total - 1));
        return;
      }
      if (e.key === 'ArrowLeft') {
        setIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key !== 'Tab' || !node) return;
      const focusables = Array.from(node.querySelectorAll<HTMLElement>('button:not([disabled])'));
      if (focusables.length === 0) return;
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
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
      restoreRef.current?.focus(); // retorno de foco al disparador (tile) al cerrar/desmontar
    };
  }, [total]);

  function handleBackdropClick(e: MouseEvent<HTMLDivElement>) {
    // Solo el click directo en el backdrop cierra (no el burbujeo desde el contenido del diálogo).
    if (e.target === e.currentTarget) onClose();
  }

  function errorMessage(err: unknown): string {
    if (err instanceof ApiError) {
      if (err.status === 410) return messageForCode('EVIDENCE_GONE');
      if (err.status === 0) return OFFLINE_MESSAGE; // sin respuesta HTTP (red/offline)
    }
    // 404 y cualquier otro >=400 distinto de 401/410: mensaje único, sin filtrar el motivo (FR-005).
    return FALLBACK_MESSAGE;
  }

  return (
    // El backdrop cierra al click directo (a diferencia de ConfirmDialog); el cierre por teclado ya
    // existe (Esc, gestionado en el diálogo) — el div en sí no es un control interactivo independiente.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- backdrop de modal, cierre por teclado cubierto por Esc en el diálogo
    <div className="evidence-viewer__overlay" onClick={handleBackdropClick}>
      <div ref={dialogRef} className="evidence-viewer" role="dialog" aria-modal="true" aria-label={label}>
        <div className="evidence-viewer__header">
          {total > 1 ? <span className="evidence-viewer__indicator">{`${position} de ${total}`}</span> : null}
          <button ref={closeRef} type="button" className="evidence-viewer__control" onClick={onClose}>
            Cerrar
          </button>
        </div>
        <div className="evidence-viewer__body">
          {total > 1 ? (
            <button
              type="button"
              className="evidence-viewer__control"
              onClick={() => setIndex((i) => Math.max(i - 1, 0))}
              disabled={index === 0}
            >
              Anterior
            </button>
          ) : null}

          {query.isPending ? (
            <Spinner label={`Cargando ${label.toLowerCase()}…`} />
          ) : query.isError ? (
            <InlineError>{errorMessage(query.error)}</InlineError>
          ) : decodeFailed ? (
            <InlineError>{FALLBACK_MESSAGE}</InlineError>
          ) : blobUrl !== null ? (
            <img
              className="evidence-viewer__image"
              src={blobUrl}
              alt={label}
              onError={() => {
                // 200 con blob no decodificable: fallback único, revocación INMEDIATA (no espera al
                // cierre/cambio) y sin registrar detalle/evidence_id/URL blob (FR-005).
                URL.revokeObjectURL(blobUrl);
                setBlobUrl(null);
                setDecodeFailed(true);
              }}
            />
          ) : null}

          {total > 1 ? (
            <button
              type="button"
              className="evidence-viewer__control"
              onClick={() => setIndex((i) => Math.min(i + 1, total - 1))}
              disabled={index === total - 1}
            >
              Siguiente
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
