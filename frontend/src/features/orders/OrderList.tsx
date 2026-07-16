import { Link } from 'react-router-dom';
import type { UseQueryResult } from '@tanstack/react-query';
import { ApiError } from '../../api/client';
import type { Order, OrderListResponse, Role } from '../../api/types';
import { Button, EmptyState, InlineError, Segmented, Spinner, StatusBadge } from '../../ui';
import { useSession } from '../auth/session';
import { resolveAssignee } from './resolveAssignee';
import type { OrderFilterState } from './useOrderFilter';
import './orders.css';

const EMPTY_BY_ROLE: Record<Role, string> = {
  technician: 'No tienes órdenes asignadas.',
  supervisor: 'No hay órdenes en revisión.',
  dispatcher: 'No hay órdenes para despachar.',
};

const SEGMENT_OPTIONS = [
  { value: 'active' as const, label: 'Activas' },
  { value: 'all' as const, label: 'Todas' },
];

// FE-9 (023) · FE-8 (022): tarjeta/fila del artifact — fila superior (código mono + chip), nombre, y
// fila de meta con cliente («—», el contrato no lo expone) y técnico (`resolveAssignee`: «Tú» /
// UUID truncado / «Sin asignar»). Markup compartido entre tarjeta apilada (móvil) y fila de oficina
// (`order-item--row`, ≥1024px, FR-002) — la regla de meta aplica igual en ambas.
function OrderItem({ order, selectedId, wide }: { order: Order; selectedId: string | undefined; wide: boolean }) {
  const current = order.id === selectedId;
  const { user } = useSession();
  const assignee = resolveAssignee(order.assigned_to, user?.userId);
  return (
    <li>
      <Link
        to={`/orders/${order.id}`}
        className={wide ? 'order-item order-item--row' : 'order-item'}
        aria-current={current ? 'true' : undefined}
      >
        <span className="order-item__code">#{order.id.slice(0, 8)}</span>
        <span className="order-item__title">{order.title}</span>
        <div className="order-item__meta">
          <span className="order-item__client">—</span>
          <span className="order-item__assignee">{assignee}</span>
        </div>
        <span className="order-item__status">
          <StatusBadge status={order.status} />
        </span>
      </Link>
    </li>
  );
}

// FR-006/007/008/009/009b/014: listado por rol con 4 estados. 403 → «sin-permiso» (distinto de error).
// FE-8 (022): segmentado «Activas/Todas» + 3 estados vacíos con precedencia (FR-005/005a/005b/011b);
// layout por VIEWPORT (`wide`, FR-011): tarjeta apilada o fila de tabla, para CUALQUIER rol. La query y
// el filtro los posee `OrdersView` (comparte caché de TanStack Query por `queryKey`); este componente es
// presentacional sobre ambos.
export function OrderList({
  role,
  selectedId,
  wide,
  query,
  filter,
}: {
  role: Role;
  selectedId: string | undefined;
  wide: boolean;
  query: UseQueryResult<OrderListResponse, unknown>;
  filter: OrderFilterState;
}) {
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
        <Segmented
          label="Filtro de órdenes"
          options={SEGMENT_OPTIONS}
          value={filter.segment}
          onChange={filter.setSegment}
        />
        <Button variant="secondary" onClick={() => void query.refetch()}>
          Actualizar
        </Button>
      </div>
      {orders.length === 0 ? (
        <EmptyState>{EMPTY_BY_ROLE[role]}</EmptyState>
      ) : filter.emptyKind === 'no-active' ? (
        <EmptyState>Sin órdenes activas en este momento. Cambia el filtro para verlas.</EmptyState>
      ) : filter.emptyKind === 'no-matches' ? (
        <EmptyState>Sin coincidencias para la búsqueda actual. Prueba a limpiar el término.</EmptyState>
      ) : (
        <>
          {wide ? (
            <div className="order-table-head" aria-hidden="true">
              <span>Código</span>
              <span>Orden</span>
              <span>Cliente</span>
              <span>Estado</span>
            </div>
          ) : null}
          <ul className="order-list">
            {filter.filtered.map((o) => (
              <OrderItem key={o.id} order={o} selectedId={selectedId} wide={wide} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
