import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// Ruta de detalle de orden (/orders/:id): el foco lo gobierna MasterDetail (panel de detalle).
const isDetailRoute = (pathname: string): boolean => /^\/orders\/[^/]+$/.test(pathname);

// FR-024: al entrar en una vista mueve el foco a su <h1> (para lector de pantalla). EXCEPTO en rutas de
// detalle, donde MasterDetail mueve el foco al panel de detalle (FR-025) — así evitamos el conflicto de
// foco padre↔hijo tanto al navegar como en deep-link/montaje inicial (G3 F-001/F-006).
export function useRouteFocus(): void {
  const { pathname } = useLocation();
  useEffect(() => {
    if (isDetailRoute(pathname)) return;
    const h1 = document.querySelector<HTMLElement>('main h1');
    if (h1) {
      h1.setAttribute('tabindex', '-1');
      h1.focus();
    }
  }, [pathname]);
}
