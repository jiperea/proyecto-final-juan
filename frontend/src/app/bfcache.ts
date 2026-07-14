import { useEffect } from 'react';
import { refreshOnce } from '../api/refresh';
import { invalidateSession } from '../api/session-store';

// FR-030: al restaurar desde bfcache (pageshow persisted), blanquear SÍNCRONAMENTE el contenido
// (atributo en <html> que CSS oculta) ANTES de revalidar la sesión; si no hay sesión → invalida (→ login).
export function handleBfcachePageshow(event: Pick<PageTransitionEvent, 'persisted'>): void {
  if (!event.persisted) return;
  document.documentElement.setAttribute('data-bfcache-blank', 'true');
  void refreshOnce()
    .then((r) => {
      if (!r) {
        invalidateSession(); // sin sesión → SessionProvider pasa a anónimo (login)
      }
    })
    .finally(() => {
      document.documentElement.removeAttribute('data-bfcache-blank');
    });
}

export function useBfcacheGuard(): void {
  useEffect(() => {
    const on = (e: PageTransitionEvent) => handleBfcachePageshow(e);
    window.addEventListener('pageshow', on);
    return () => window.removeEventListener('pageshow', on);
  }, []);
}
