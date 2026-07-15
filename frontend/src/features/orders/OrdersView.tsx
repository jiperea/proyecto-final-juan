import { useNavigate, useParams } from 'react-router-dom';
import { useSession } from '../auth/session';
import { MasterDetail, useWideViewport } from '../../ui';
import { OrderList } from './OrderList';
import { OrderDetailView } from './OrderDetailView';

// FR-019/025: technician = una columna en cualquier ancho; dispatcher/supervisor = master-detail ≥1024px.
export function OrdersView() {
  const { user } = useSession();
  const { orderId } = useParams();
  const navigate = useNavigate();
  const wide = useWideViewport();
  const role = user!.role;
  const wideLayout = wide && role !== 'technician';

  return (
    <section>
      <h1>Mis órdenes</h1>
      <MasterDetail
        wide={wideLayout}
        hasSelection={orderId !== undefined}
        onBack={() => navigate('/orders')}
        list={<OrderList role={role} selectedId={orderId} />}
        detail={orderId !== undefined ? <OrderDetailView key={orderId} orderId={orderId} /> : null}
      />
    </section>
  );
}
