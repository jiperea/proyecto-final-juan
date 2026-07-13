import { Link } from 'react-router-dom';
import { ApiError } from '../../api/client';
import type { Order, Role } from '../../api/types';
import { Button, EmptyState, InlineError, Spinner, StatusBadge } from '../../ui';
import { useOrderList } from './useOrders';
import './orders.css';

const EMPTY_BY_ROLE: Record<Role, string> = {
  technician: 'No tienes órdenes asignadas.',
  supervisor: 'No hay órdenes en revisión.',
  dispatcher: 'No hay órdenes para despachar.',
};

function OrderItem({ order, selectedId }: { order: Order; selectedId: string | undefined }) {
  const current = order.id === selectedId;
  return (
    <li>
      <Link
        to={`/orders/${order.id}`}
        className="order-item"
        aria-current={current ? 'true' : undefined}
      >
        <span className="order-item__title">{order.title}</span>
        <StatusBadge status={order.status} />
      </Link>
    </li>
  );
}

// FR-006/007/008/009/009b/014: listado por rol con 4 estados. 403 → «sin-permiso» (distinto de error).
export function OrderList({ role, selectedId }: { role: Role; selectedId: string | undefined }) {
  const query = useOrderList(role);

  if (query.isPending) return <Spinner label="Cargando órdenes…" />;

  if (query.isError) {
    const err = query.error;
    if (err instanceof ApiError && err.status === 403) {
      return (
        <div className="state" role="status">
          No tienes permiso para ver este listado.
        </div>
      );
    }
    const message = err instanceof ApiError ? err.userMessage : 'Ha ocurrido un error. Reinténtalo.';
    return <InlineError onRetry={() => void query.refetch()}>{message}</InlineError>;
  }

  const orders = query.data.orders;
  return (
    <div aria-busy={query.isFetching}>
      <div className="orders-toolbar">
        <Button variant="secondary" onClick={() => void query.refetch()}>
          Actualizar
        </Button>
      </div>
      {orders.length === 0 ? (
        <EmptyState>{EMPTY_BY_ROLE[role]}</EmptyState>
      ) : (
        <ul className="order-list">
          {orders.map((o) => (
            <OrderItem key={o.id} order={o} selectedId={selectedId} />
          ))}
        </ul>
      )}
    </div>
  );
}
