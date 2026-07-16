import { useSession } from '../auth/session';

const ROLE_LABEL: Record<string, string> = {
  technician: 'Técnico',
  dispatcher: 'Despachador',
  supervisor: 'Supervisor',
};

// FE-8 (022) · T016/T017 · chrome de oficina del master-detail (FR-007): marca «F», buscador (filtra en
// cliente, FR-007a), rol y avatar. Se muestra en `≥1024px` para CUALQUIER rol (FR-011: layout por
// viewport, no por rol) — lo monta/desmonta `OrdersView` según `useWideViewport`.
export function OfficeTopbar({ term, onTermChange }: { term: string; onTermChange: (next: string) => void }) {
  const { user } = useSession();
  const initial = (user?.name ?? '?').charAt(0).toUpperCase();

  return (
    <div className="office-topbar">
      <span className="brand-mark" aria-hidden="true">
        F
      </span>
      <div className="office-topbar__search">
        <label className="visually-hidden" htmlFor="office-search">
          Buscar
        </label>
        <input
          id="office-search"
          type="search"
          className="field__input"
          placeholder="Buscar por código, orden, cliente o técnico"
          value={term}
          onChange={(e) => onTermChange(e.target.value)}
        />
      </div>
      {user ? (
        <span className="office-topbar__identity">
          <span>{ROLE_LABEL[user.role] ?? user.role}</span>
          <span className="office-topbar__avatar" aria-hidden="true">
            {initial}
          </span>
        </span>
      ) : null}
    </div>
  );
}
