import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useSession } from '../auth/session';
import { MasterDetail, useWideViewport } from '../../ui';
import { OrderList } from './OrderList';
import { OrderDetailView } from './OrderDetailView';
import { OfficeTopbar } from './OfficeTopbar';
import { useOrderFilter } from './useOrderFilter';
import { useOrderList } from './useOrders';
import './orders.css';

// FE-8 (022) · FR-011: layout por VIEWPORT, no por rol — `<1024px` apilado, `≥1024px` master-detail,
// para CUALQUIER rol (antes, FE-1/017 forzaba una columna para `technician`; se sustituye por completo,
// fiel al artifact). FR-007/007a/007c: chrome de oficina (topbar con buscador) en `≥1024px`; el término
// se limpia al estrechar (FR-011b). La selección se conserva con nota si el filtro la excluye (FR-007c).
export function OrdersView() {
  const { user } = useSession();
  const { orderId } = useParams();
  const navigate = useNavigate();
  const wide = useWideViewport();
  const role = user!.role;
  const query = useOrderList(role);
  const orders = query.data?.orders ?? [];
  const filter = useOrderFilter(orders);
  const { clearTerm } = filter;

  useEffect(() => {
    if (!wide) clearTerm();
  }, [wide, clearTerm]);

  const outOfFilter = orderId !== undefined && !filter.filtered.some((o) => o.id === orderId);

  return (
    <section>
      <h1>Mis órdenes</h1>
      {wide ? <OfficeTopbar term={filter.term} onTermChange={filter.setTerm} /> : null}
      <MasterDetail
        wide={wide}
        hasSelection={orderId !== undefined}
        onBack={() => navigate('/orders')}
        list={<OrderList role={role} selectedId={orderId} wide={wide} query={query} filter={filter} />}
        detail={
          orderId !== undefined ? (
            <>
              {outOfFilter ? (
                <p className="notice" role="note">
                  Esta orden queda fuera del filtro actual.
                </p>
              ) : null}
              <OrderDetailView key={orderId} orderId={orderId} />
            </>
          ) : null
        }
      />
    </section>
  );
}
