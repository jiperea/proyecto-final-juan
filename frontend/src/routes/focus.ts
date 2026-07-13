import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// FR-024: al cambiar la ruta, mueve el foco al <h1> de la vista destino (para lectores de pantalla).
export function useRouteFocus(): void {
  const { pathname } = useLocation();
  useEffect(() => {
    const h1 = document.querySelector<HTMLElement>('main h1');
    if (h1) {
      h1.setAttribute('tabindex', '-1');
      h1.focus();
    }
  }, [pathname]);
}
