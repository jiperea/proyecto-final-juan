import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

// Hook: ¿ancho ≥1024px? Reacciona al resize dinámico (FR-025).
export function useWideViewport(): boolean {
  const [wide, setWide] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px)').matches : false,
  );
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    setWide(mq.matches);
    const on = (e: MediaQueryListEvent) => setWide(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return wide;
}

export function BackToList({ onBack }: { onBack: () => void }) {
  return (
    <button type="button" className="btn btn--secondary back-to-list" onClick={onBack}>
      ← Volver a la lista
    </button>
  );
}

interface MasterDetailProps {
  wide: boolean;
  hasSelection: boolean;
  list: ReactNode;
  detail: ReactNode;
  onBack: () => void;
}

// dispatcher/supervisor ≥1024px: lista + detalle simultáneos. Al estrechar con detalle abierto,
// colapsa a la vista de detalle con control de retorno (FR-025). El foco al panel al seleccionar
// lo gestiona el consumidor moviendo foco al detail cuando cambia la selección.
export function MasterDetail({ wide, hasSelection, list, detail, onBack }: MasterDetailProps) {
  const detailRef = useRef<HTMLDivElement>(null);

  // FR-025: al aparecer una selección, mueve el foco al panel de detalle (lector de pantalla/teclado).
  useEffect(() => {
    if (hasSelection && detailRef.current) detailRef.current.focus();
  }, [hasSelection]);

  if (wide) {
    return (
      <div className="master-detail master-detail--wide">
        <nav aria-label="Órdenes">{list}</nav>
        <div ref={detailRef} tabIndex={-1}>
          {hasSelection ? detail : <p className="state">Selecciona una orden</p>}
        </div>
      </div>
    );
  }
  // Estrecho: si hay selección, muestra detalle con retorno; si no, la lista.
  return (
    <div className="master-detail">
      {hasSelection ? (
        <div ref={detailRef} tabIndex={-1}>
          <BackToList onBack={onBack} />
          {detail}
        </div>
      ) : (
        <nav aria-label="Órdenes">{list}</nav>
      )}
    </div>
  );
}
