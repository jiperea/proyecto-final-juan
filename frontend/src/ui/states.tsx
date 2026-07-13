import type { ReactNode } from 'react';

// Estados de UI accesibles (FR-026/031). Spinner con aria-busy; error como role=alert; vacío como role=status.

export function Spinner({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="state" aria-busy="true" role="status">
      {label}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="state" role="status">
      {children}
    </div>
  );
}

export function InlineError({ children, onRetry }: { children: ReactNode; onRetry?: () => void }) {
  return (
    <div className="state state__error" role="alert">
      <p>{children}</p>
      {onRetry ? (
        <button type="button" className="btn btn--secondary" onClick={onRetry}>
          Reintentar
        </button>
      ) : null}
    </div>
  );
}
