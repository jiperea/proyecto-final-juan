import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useSession } from '../features/auth/session';
import { Spinner } from '../ui';

// Guarda de sesión (FR-021): sin sesión → /login conservando el destino en el ESTADO DEL ROUTER
// (memoria), nunca en storage compartido. Tras autenticar, LoginPage vuelve a `from`.
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const location = useLocation();
  if (status === 'loading') return <Spinner label="Cargando…" />;
  if (status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}
