import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

const topSegment = (pathname: string): string => pathname.split('/')[1] ?? '';

// FR-024: al cambiar de SECCIÓN (p. ej. /login ↔ /orders) mueve el foco al <h1> de la vista.
// Dentro de una sección (p. ej. /orders ↔ /orders/:id) NO refoca el h1, para no pisar el foco que
// MasterDetail mueve al panel de detalle al seleccionar (FR-025). Evita el conflicto de foco (G3 F-001).
export function useRouteFocus(): void {
  const { pathname } = useLocation();
  const prev = useRef<string | null>(null);
  useEffect(() => {
    const seg = topSegment(pathname);
    if (prev.current !== seg) {
      prev.current = seg;
      const h1 = document.querySelector<HTMLElement>('main h1');
      if (h1) {
        h1.setAttribute('tabindex', '-1');
        h1.focus();
      }
    }
  }, [pathname]);
}
